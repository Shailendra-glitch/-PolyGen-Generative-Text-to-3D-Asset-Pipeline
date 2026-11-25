import * as THREE from 'three';
import type { PartSpec } from '../types/polygen';

function clampNum(val: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

function buildGearGeometry(
  outerR: number,
  innerR: number,
  depth: number,
  teeth: number,
  bevel: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const toothCount = Math.max(6, Math.min(40, Math.round(teeth)));
  const step = (Math.PI * 2) / toothCount;
  const toothOuter = outerR;
  const toothRoot = outerR * 0.86;

  for (let i = 0; i < toothCount; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.34;
    const a3 = a0 + step * 0.66;
    const a4 = a0 + step * 0.78;

    const p0x = Math.cos(a0) * toothRoot;
    const p0y = Math.sin(a0) * toothRoot;
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(Math.cos(a1) * toothRoot, Math.sin(a1) * toothRoot);
    shape.lineTo(Math.cos(a2) * toothOuter, Math.sin(a2) * toothOuter);
    shape.lineTo(Math.cos(a3) * toothOuter, Math.sin(a3) * toothOuter);
    shape.lineTo(Math.cos(a4) * toothRoot, Math.sin(a4) * toothRoot);
  }
  shape.closePath();

  const safeInner = Math.min(innerR, toothRoot * 0.88);
  if (safeInner > 0.01) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, safeInner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 4,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 24,
  });
  geom.translate(0, 0, -depth * 0.5);
  return geom;
}

export function buildRawPartGeometry(part: PartSpec): THREE.BufferGeometry {
  const dims = part.dimensions ?? {};
  const segs = Math.round(clampNum(dims.radialSegments, 40, 8, 64));

  switch (part.geometryType) {
    case 'extrude_profile': {
      const pts =
        part.profilePoints && part.profilePoints.length >= 3
          ? part.profilePoints
          : [
              [-0.25, -0.25],
              [0.25, -0.25],
              [0.25, 0.25],
              [-0.25, 0.25],
            ];
      const shape = new THREE.Shape();
      pts.forEach(([x, y], idx) => {
        const cx = clampNum(x, 0, -4, 4);
        const cy = clampNum(y, 0, -4, 4);
        if (idx === 0) shape.moveTo(cx, cy);
        else shape.lineTo(cx, cy);
      });
      shape.closePath();

      const depth = clampNum(dims.depth, 0.14, 0.01, 3);
      const bevelSize = clampNum(dims.bevelSize, 0.014, 0.001, 0.12);
      const bevelThickness = clampNum(dims.bevelThickness, 0.014, 0.001, 0.12);

      return new THREE.ExtrudeGeometry(shape, {
        depth,
        steps: 8,
        bevelEnabled: true,
        bevelSize,
        bevelThickness,
        bevelSegments: 4,
        curveSegments: 28,
      });
    }

    case 'lathe_profile': {
      const pts =
        part.profilePoints && part.profilePoints.length >= 2
          ? part.profilePoints
          : [
              [0.0, 0.0],
              [0.22, 0.05],
              [0.16, 0.25],
              [0.24, 0.45],
              [0.0, 0.5],
            ];
      const vecs = pts.map(
        ([r, y]) => new THREE.Vector2(Math.max(0, clampNum(r, 0.1, 0, 3)), clampNum(y, 0, -3, 4))
      );
      return new THREE.LatheGeometry(vecs, Math.max(16, segs));
    }

    case 'tube_curve': {
      const rawPts =
        part.curvePoints && part.curvePoints.length >= 2
          ? part.curvePoints
          : [
              [-0.3, 0, 0],
              [0, 0.35, 0],
              [0.3, 0, 0],
            ];
      const vecs = rawPts.map(
        ([x, y, z]) =>
          new THREE.Vector3(clampNum(x, 0, -4, 4), clampNum(y, 0, -4, 4), clampNum(z, 0, -4, 4))
      );
      const curve = new THREE.CatmullRomCurve3(vecs);
      const tubeRadius = clampNum(dims.tubeRadius, 0.032, 0.004, 0.4);
      return new THREE.TubeGeometry(curve, 64, tubeRadius, Math.max(16, Math.min(32, segs)), false);
    }

    case 'gear_ring': {
      const outerR = clampNum(dims.radiusTop, 0.35, 0.04, 2.5);
      const innerR = clampNum(dims.radiusBottom, outerR * 0.65, 0.01, outerR * 0.9);
      const depth = clampNum(dims.depth, 0.08, 0.01, 1.5);
      const teeth = clampNum(dims.teethCount, 16, 6, 40);
      const bevel = clampNum(dims.bevelSize, 0.006, 0.001, 0.05);
      return buildGearGeometry(outerR, innerR, depth, teeth, bevel);
    }

    case 'faceted_gem': {
      const radius = clampNum(dims.radiusTop, 0.12, 0.02, 1.5);
      const detail = Math.round(clampNum(dims.radialSegments, 2, 1, 4));
      return new THREE.IcosahedronGeometry(radius, detail);
    }

    case 'torus': {
      const radius = clampNum(dims.radiusTop, 0.25, 0.02, 2.5);
      const tube = clampNum(dims.tubeRadius, 0.03, 0.004, 0.5);
      return new THREE.TorusGeometry(radius, tube, 28, 64);
    }

    case 'cylinder_taper': {
      const rTop = clampNum(dims.radiusTop, 0.18, 0.0, 2.5);
      const rBot = clampNum(dims.radiusBottom, 0.22, 0.0, 2.5);
      const h = clampNum(dims.height, 0.5, 0.02, 4.0);
      return new THREE.CylinderGeometry(rTop, rBot, h, Math.max(16, segs), 16, false);
    }

    case 'beveled_box':
    default: {
      const w = clampNum(dims.width, 0.4, 0.02, 4);
      const h = clampNum(dims.height, 0.4, 0.02, 4);
      const d = clampNum(dims.depth, 0.4, 0.02, 4);
      const bevel = clampNum(dims.bevelSize, Math.min(w, h, d) * 0.08, 0.002, 0.12);
      const shape = new THREE.Shape();
      const hw = w * 0.5 - bevel;
      const hh = h * 0.5 - bevel;
      shape.moveTo(-hw, -hh);
      shape.lineTo(hw, -hh);
      shape.lineTo(hw, hh);
      shape.lineTo(-hw, hh);
      shape.closePath();
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.01, d - bevel * 2),
        steps: 6,
        bevelEnabled: true,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 4,
      });
      geom.center();
      return geom;
    }
  }
}

export function applyPartTransform(geometry: THREE.BufferGeometry, part: PartSpec): void {
  const pos = part.transform?.position ?? [0, 0, 0];
  const rot = part.transform?.rotation ?? [0, 0, 0];
  const scl = part.transform?.scale ?? [1, 1, 1];

  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      clampNum(rot[0], 0, -Math.PI * 2, Math.PI * 2),
      clampNum(rot[1], 0, -Math.PI * 2, Math.PI * 2),
      clampNum(rot[2], 0, -Math.PI * 2, Math.PI * 2),
      'XYZ'
    )
  );
  const vPos = new THREE.Vector3(
    clampNum(pos[0], 0, -5, 5),
    clampNum(pos[1], 0, -5, 5),
    clampNum(pos[2], 0, -5, 5)
  );
  const vScl = new THREE.Vector3(
    clampNum(scl[0], 1, 0.05, 5),
    clampNum(scl[1], 1, 0.05, 5),
    clampNum(scl[2], 1, 0.05, 5)
  );
  mat.compose(vPos, q, vScl);
  geometry.applyMatrix4(mat);
}

export function countGeometryFaces(geometry: THREE.BufferGeometry): number {
  if (geometry.index) {
    return Math.floor(geometry.index.count / 3);
  }
  const pos = geometry.getAttribute('position');
  return pos ? Math.floor(pos.count / 3) : 0;
}
