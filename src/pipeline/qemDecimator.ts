import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface QEMResult {
  geometry: THREE.BufferGeometry;
  rawVertices: number;
  rawFaces: number;
  optimizedVertices: number;
  optimizedFaces: number;
}

interface HeapItem {
  v1: number;
  v2: number;
  cost: number;
  tx: number;
  ty: number;
  tz: number;
  gen1: number;
  gen2: number;
}

class MinHeap {
  private data: HeapItem[] = [];

  get size(): number {
    return this.data.length;
  }

  push(item: HeapItem): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapItem | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    const item = this.data[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.data[parentIdx];
      if (item.cost >= parent.cost) break;
      this.data[idx] = parent;
      idx = parentIdx;
    }
    this.data[idx] = item;
  }

  private sinkDown(idx: number): void {
    const len = this.data.length;
    const item = this.data[idx];
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < len && this.data[left].cost < this.data[smallest].cost) {
        smallest = left;
      }
      if (right < len && this.data[right].cost < this.data[smallest].cost) {
        smallest = right;
      }
      if (smallest === idx) break;
      this.data[idx] = this.data[smallest];
      idx = smallest;
    }
    this.data[idx] = item;
  }
}

function addPlaneQuadric(
  q: Float64Array,
  offset: number,
  a: number,
  b: number,
  c: number,
  d: number,
  weight = 1
): void {
  q[offset + 0] += a * a * weight;
  q[offset + 1] += a * b * weight;
  q[offset + 2] += a * c * weight;
  q[offset + 3] += a * d * weight;
  q[offset + 4] += b * b * weight;
  q[offset + 5] += b * c * weight;
  q[offset + 6] += b * d * weight;
  q[offset + 7] += c * c * weight;
  q[offset + 8] += c * d * weight;
  q[offset + 9] += d * d * weight;
}

function evaluateQuadric(q: Float64Array, offset: number, x: number, y: number, z: number): number {
  return (
    q[offset + 0] * x * x +
    2 * q[offset + 1] * x * y +
    2 * q[offset + 2] * x * z +
    2 * q[offset + 3] * x +
    q[offset + 4] * y * y +
    2 * q[offset + 5] * y * z +
    2 * q[offset + 6] * y +
    q[offset + 7] * z * z +
    2 * q[offset + 8] * z +
    q[offset + 9]
  );
}

/**
 * Generates clean tri-planar UV coordinates + UV2 + tangents for any BufferGeometry
 */
export function assignTriplanarUVsAndTangents(geom: THREE.BufferGeometry): void {
  const posAttr = geom.getAttribute('position');
  if (!posAttr) return;

  geom.computeVertexNormals();
  const normAttr = geom.getAttribute('normal');
  const count = posAttr.count;
  const uvs = new Float32Array(count * 2);

  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = Math.max(size.x, size.y, size.z, 0.001);

  for (let i = 0; i < count; i++) {
    const x = (posAttr.getX(i) - box.min.x) / scale;
    const y = (posAttr.getY(i) - box.min.y) / scale;
    const z = (posAttr.getZ(i) - box.min.z) / scale;

    const nx = Math.abs(normAttr.getX(i));
    const ny = Math.abs(normAttr.getY(i));
    const nz = Math.abs(normAttr.getZ(i));

    if (nx >= ny && nx >= nz) {
      uvs[i * 2] = z;
      uvs[i * 2 + 1] = y;
    } else if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
    } else {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = y;
    }
  }

  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(), 2));

  if (geom.index) {
    try {
      geom.computeTangents();
    } catch {
      // Non-critical if degenerate face prevents tangent generation
    }
  }
}

/**
 * Garland-Heckbert Quadric Error Metrics (QEM) Edge-Collapse Decimation.
 */
export function decimateWithQEM(
  rawGeometry: THREE.BufferGeometry,
  targetFaces: number
): QEMResult {
  const rawPos = rawGeometry.getAttribute('position');
  const rawVertices = rawPos ? rawPos.count : 0;
  const rawFaces = rawGeometry.index
    ? Math.floor(rawGeometry.index.count / 3)
    : Math.floor(rawVertices / 3);

  // Strip normals/uvs before welding so coincident seam vertices merge into a connected manifold
  const cleanSrc = new THREE.BufferGeometry();
  cleanSrc.setAttribute('position', rawGeometry.getAttribute('position').clone());
  if (rawGeometry.index) {
    cleanSrc.setIndex(rawGeometry.index.clone());
  }

  const welded = BufferGeometryUtils.mergeVertices(cleanSrc, 1e-4);
  cleanSrc.dispose();

  const posAttr = welded.getAttribute('position');
  const indexAttr = welded.index;
  if (!indexAttr || !posAttr) {
    assignTriplanarUVsAndTangents(welded);
    return {
      geometry: welded,
      rawVertices,
      rawFaces,
      optimizedVertices: posAttr ? posAttr.count : 0,
      optimizedFaces: rawFaces,
    };
  }

  const vCount = posAttr.count;
  const fCount = Math.floor(indexAttr.count / 3);

  if (fCount <= targetFaces || fCount < 16) {
    assignTriplanarUVsAndTangents(welded);
    return {
      geometry: welded,
      rawVertices,
      rawFaces,
      optimizedVertices: vCount,
      optimizedFaces: fCount,
    };
  }

  const vx = new Float64Array(vCount);
  const vy = new Float64Array(vCount);
  const vz = new Float64Array(vCount);
  for (let i = 0; i < vCount; i++) {
    vx[i] = posAttr.getX(i);
    vy[i] = posAttr.getY(i);
    vz[i] = posAttr.getZ(i);
  }

  const f0 = new Int32Array(fCount);
  const f1 = new Int32Array(fCount);
  const f2 = new Int32Array(fCount);
  const faceDeleted = new Uint8Array(fCount);
  const faceNx = new Float64Array(fCount);
  const faceNy = new Float64Array(fCount);
  const faceNz = new Float64Array(fCount);

  const vertFaces: number[][] = Array.from({ length: vCount }, () => []);
  const quadrics = new Float64Array(vCount * 10);

  for (let f = 0; f < fCount; f++) {
    const a = indexAttr.getX(f * 3);
    const b = indexAttr.getX(f * 3 + 1);
    const c = indexAttr.getX(f * 3 + 2);
    f0[f] = a;
    f1[f] = b;
    f2[f] = c;

    if (a === b || b === c || a === c) {
      faceDeleted[f] = 1;
      continue;
    }

    const abx = vx[b] - vx[a];
    const aby = vy[b] - vy[a];
    const abz = vz[b] - vz[a];
    const acx = vx[c] - vx[a];
    const acy = vy[c] - vy[a];
    const acz = vz[c] - vz[a];

    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) {
      faceDeleted[f] = 1;
      continue;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    faceNx[f] = nx;
    faceNy[f] = ny;
    faceNz[f] = nz;

    const d = -(nx * vx[a] + ny * vy[a] + nz * vz[a]);
    const areaWeight = len * 0.5;
    addPlaneQuadric(quadrics, a * 10, nx, ny, nz, d, areaWeight);
    addPlaneQuadric(quadrics, b * 10, nx, ny, nz, d, areaWeight);
    addPlaneQuadric(quadrics, c * 10, nx, ny, nz, d, areaWeight);

    vertFaces[a].push(f);
    vertFaces[b].push(f);
    vertFaces[c].push(f);
  }

  const vertDeleted = new Uint8Array(vCount);
  const vertGen = new Int32Array(vCount);
  const heap = new MinHeap();
  const tempQ = new Float64Array(10);

  const computeEdgeCandidate = (u: number, v: number): HeapItem | null => {
    if (u === v || vertDeleted[u] || vertDeleted[v]) return null;
    const uOff = u * 10;
    const vOff = v * 10;
    for (let k = 0; k < 10; k++) {
      tempQ[k] = quadrics[uOff + k] + quadrics[vOff + k];
    }

    const mx = (vx[u] + vx[v]) * 0.5;
    const my = (vy[u] + vy[v]) * 0.5;
    const mz = (vz[u] + vz[v]) * 0.5;

    const cMid = Math.max(0, evaluateQuadric(tempQ, 0, mx, my, mz));
    const cU = Math.max(0, evaluateQuadric(tempQ, 0, vx[u], vy[u], vz[u]));
    const cV = Math.max(0, evaluateQuadric(tempQ, 0, vx[v], vy[v], vz[v]));

    let tx = mx;
    let ty = my;
    let tz = mz;
    let bestCost = cMid;

    if (cU < bestCost) {
      bestCost = cU;
      tx = vx[u];
      ty = vy[u];
      tz = vz[u];
    }
    if (cV < bestCost) {
      bestCost = cV;
      tx = vx[v];
      ty = vy[v];
      tz = vz[v];
    }

    // Penalize excessive edge stretch to preserve uniform triangle aspect ratios
    const edgeLen = Math.hypot(vx[u] - vx[v], vy[u] - vy[v], vz[u] - vz[v]);
    bestCost += edgeLen * edgeLen * 1e-4;

    return {
      v1: u,
      v2: v,
      cost: bestCost,
      tx,
      ty,
      tz,
      gen1: vertGen[u],
      gen2: vertGen[v],
    };
  };

  // Seed initial unique edges
  const seenEdges = new Set<number>();
  for (let f = 0; f < fCount; f++) {
    if (faceDeleted[f]) continue;
    const tri = [f0[f], f1[f], f2[f]];
    for (let e = 0; e < 3; e++) {
      const u = tri[e];
      const v = tri[(e + 1) % 3];
      const a = u < v ? u : v;
      const b = u < v ? v : u;
      const key = a * vCount + b;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        const item = computeEdgeCandidate(a, b);
        if (item) heap.push(item);
      }
    }
  }

  let activeFaces = fCount;
  for (let f = 0; f < fCount; f++) {
    if (faceDeleted[f]) activeFaces--;
  }

  const checkFlip = (vert: number, other: number, tx: number, ty: number, tz: number): boolean => {
    const faces = vertFaces[vert];
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (faceDeleted[f]) continue;
      const a = f0[f];
      const b = f1[f];
      const c = f2[f];
      if (a === other || b === other || c === other) continue;

      const x0 = a === vert ? tx : vx[a];
      const y0 = a === vert ? ty : vy[a];
      const z0 = a === vert ? tz : vz[a];
      const x1 = b === vert ? tx : vx[b];
      const y1 = b === vert ? ty : vy[b];
      const z1 = b === vert ? tz : vz[b];
      const x2 = c === vert ? tx : vx[c];
      const y2 = c === vert ? ty : vy[c];
      const z2 = c === vert ? tz : vz[c];

      const abx = x1 - x0;
      const aby = y1 - y0;
      const abz = z1 - z0;
      const acx = x2 - x0;
      const acy = y2 - y0;
      const acz = z2 - z0;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) return true;

      const dot = (nx * faceNx[f] + ny * faceNy[f] + nz * faceNz[f]) / len;
      if (dot < 0.05) return true;
    }
    return false;
  };

  while (activeFaces > targetFaces && heap.size > 0) {
    const item = heap.pop()!;
    const { v1, v2, tx, ty, tz, gen1, gen2 } = item;

    if (
      vertDeleted[v1] ||
      vertDeleted[v2] ||
      vertGen[v1] !== gen1 ||
      vertGen[v2] !== gen2
    ) {
      continue;
    }

    if (checkFlip(v1, v2, tx, ty, tz) || checkFlip(v2, v1, tx, ty, tz)) {
      continue;
    }

    // Collapse v2 into v1
    vx[v1] = tx;
    vy[v1] = ty;
    vz[v1] = tz;
    vertGen[v1]++;
    vertDeleted[v2] = 1;

    const q1Off = v1 * 10;
    const q2Off = v2 * 10;
    for (let k = 0; k < 10; k++) {
      quadrics[q1Off + k] += quadrics[q2Off + k];
    }

    // Reassign v2's faces to v1 or delete shared faces
    const v2Faces = vertFaces[v2];
    for (let i = 0; i < v2Faces.length; i++) {
      const f = v2Faces[i];
      if (faceDeleted[f]) continue;
      if (f0[f] === v1 || f1[f] === v1 || f2[f] === v1) {
        faceDeleted[f] = 1;
        activeFaces--;
      } else {
        if (f0[f] === v2) f0[f] = v1;
        if (f1[f] === v2) f1[f] = v1;
        if (f2[f] === v2) f2[f] = v1;
        vertFaces[v1].push(f);
      }
    }
    vertFaces[v2].length = 0;

    // Update face normals around v1 and enqueue updated neighbor edges
    const neighbors = new Set<number>();
    const v1Faces = vertFaces[v1];
    const cleanList: number[] = [];

    for (let i = 0; i < v1Faces.length; i++) {
      const f = v1Faces[i];
      if (faceDeleted[f]) continue;
      const a = f0[f];
      const b = f1[f];
      const c = f2[f];
      if (a === b || b === c || a === c) {
        faceDeleted[f] = 1;
        activeFaces--;
        continue;
      }

      const abx = vx[b] - vx[a];
      const aby = vy[b] - vy[a];
      const abz = vz[b] - vz[a];
      const acx = vx[c] - vx[a];
      const acy = vy[c] - vy[a];
      const acz = vz[c] - vz[a];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) {
        faceDeleted[f] = 1;
        activeFaces--;
        continue;
      }

      faceNx[f] = nx / len;
      faceNy[f] = ny / len;
      faceNz[f] = nz / len;
      cleanList.push(f);

      if (a !== v1 && !vertDeleted[a]) neighbors.add(a);
      if (b !== v1 && !vertDeleted[b]) neighbors.add(b);
      if (c !== v1 && !vertDeleted[c]) neighbors.add(c);
    }
    vertFaces[v1] = cleanList;

    neighbors.forEach((nb) => {
      const next = computeEdgeCandidate(v1, nb);
      if (next) heap.push(next);
    });
  }

  // Compact surviving vertices and triangles
  const remap = new Int32Array(vCount).fill(-1);
  const newPositions: number[] = [];
  const newIndices: number[] = [];

  for (let f = 0; f < fCount; f++) {
    if (faceDeleted[f]) continue;
    const tri = [f0[f], f1[f], f2[f]];
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue;

    for (let k = 0; k < 3; k++) {
      const oldIdx = tri[k];
      if (remap[oldIdx] === -1) {
        remap[oldIdx] = newPositions.length / 3;
        newPositions.push(vx[oldIdx], vy[oldIdx], vz[oldIdx]);
      }
      newIndices.push(remap[oldIdx]);
    }
  }

  welded.dispose();

  const outGeom = new THREE.BufferGeometry();
  outGeom.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  outGeom.setIndex(newIndices);
  assignTriplanarUVsAndTangents(outGeom);

  return {
    geometry: outGeom,
    rawVertices,
    rawFaces,
    optimizedVertices: newPositions.length / 3,
    optimizedFaces: newIndices.length / 3,
  };
}
