import * as THREE from 'three';
import {
  applyPartTransform,
  buildRawPartGeometry,
  countGeometryFaces,
} from './meshGenerator';
import { assignTriplanarUVsAndTangents, decimateWithQEM } from './qemDecimator';
import { synthesizePBRTextures } from './pbrTextureEngine';
import type {
  AssetBlueprint,
  PartTelemetry,
  PBRMapPreview,
  PipelineMetrics,
} from '../types/polygen';

export interface BuiltAssetBundle {
  optimizedGroup: THREE.Group;
  rawGroup: THREE.Group;
  pbrPreviews: PBRMapPreview[];
  metrics: PipelineMetrics;
  dispose: () => void;
}

function mColorHex(hex?: string): string {
  return hex && /^#[0-9a-fA-F]{3,6}$/.test(hex) ? hex : '#000000';
}

function createMaterialForPart(
  part: AssetBlueprint['parts'][number],
  textures: ReturnType<typeof synthesizePBRTextures>,
  isSoftwareGl: boolean
): THREE.MeshPhysicalMaterial {
  const m = part.material;
  const hasTransmission = (m.transmission ?? 0) > 0.05;

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.roughnessMap,
    metalnessMap: textures.metalnessMap,
    roughness: 1.0,
    metalness: 1.0,
    clearcoat: m.clearcoat ?? (m.pattern === 'ceramic_glaze' ? 0.7 : 0),
    clearcoatRoughness: 0.14,
    anisotropy:
      m.pattern === 'brushed_brass' || m.pattern === 'forged_metal' ? 0.65 : 0,
    emissive: m.emissiveColor ? new THREE.Color(m.emissiveColor) : new THREE.Color('#000000'),
    emissiveIntensity: m.emissiveIntensity ?? 0,
    envMapIntensity: 1.15,
  });

  if (hasTransmission) {
    mat.transmission = isSoftwareGl ? 0 : Math.min(0.92, m.transmission ?? 0.6);
    mat.transparent = isSoftwareGl;
    mat.opacity = isSoftwareGl ? 0.78 : 1.0;
    mat.ior = m.ior ?? 1.6;
    mat.thickness = 0.65;
  }

  return mat;
}

export function buildAssetPipeline(
  blueprint: AssetBlueprint,
  targetFaces: number,
  options: {
    maxAnisotropy: number;
    isSoftwareGl: boolean;
    blueprintTimeMs?: number;
  }
): BuiltAssetBundle {
  const tStart = performance.now();
  const disposables: Array<{ dispose: () => void }> = [];

  // Stage 1: Raw High-Poly Geometry Synthesis
  const tMesh0 = performance.now();
  const rawPartGeoms: THREE.BufferGeometry[] = [];
  let totalRawVertices = 0;
  let totalRawFaces = 0;

  for (const part of blueprint.parts) {
    const geom = buildRawPartGeometry(part);
    applyPartTransform(geom, part);
    assignTriplanarUVsAndTangents(geom);
    rawPartGeoms.push(geom);
    totalRawVertices += geom.getAttribute('position')?.count ?? 0;
    totalRawFaces += countGeometryFaces(geom);
  }

  // Compute global normalization so every generated model sits cleanly at Y=0 inside a ~1.8m studio envelope
  const globalBox = new THREE.Box3();
  rawPartGeoms.forEach((g) => {
    g.computeBoundingBox();
    if (g.boundingBox) globalBox.union(g.boundingBox);
  });

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  globalBox.getCenter(center);
  globalBox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const normScale = 1.85 / maxDim;
  const minYAfterScale = (globalBox.min.y - center.y) * normScale;

  for (const g of rawPartGeoms) {
    g.translate(-center.x, -center.y, -center.z);
    g.scale(normScale, normScale, normScale);
    g.translate(0, -minYAfterScale, 0);
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
  const tMeshMs = Math.round(performance.now() - tMesh0);

  // Stage 2: Garland-Heckbert QEM Decimation
  const tQem0 = performance.now();
  const qemResults = blueprint.parts.map((part, idx) => {
    const rawGeom = rawPartGeoms[idx];
    const partRawFaces = countGeometryFaces(rawGeom);
    const share = totalRawFaces > 0 ? partRawFaces / totalRawFaces : 1 / blueprint.parts.length;
    const partBudget = Math.max(24, Math.round(targetFaces * share));
    return decimateWithQEM(rawGeom, partBudget);
  });
  const tQemMs = Math.round(performance.now() - tQem0);

  // Stage 3: Procedural PBR Map Synthesis & Material Binding
  const tPbr0 = performance.now();
  const optimizedGroup = new THREE.Group();
  optimizedGroup.name = `${blueprint.title}_Optimized`;

  const rawGroup = new THREE.Group();
  rawGroup.name = `${blueprint.title}_Raw`;

  const pbrPreviews: PBRMapPreview[] = [];
  const partBreakdown: PartTelemetry[] = [];
  let totalOptVertices = 0;
  let totalOptFaces = 0;

  // Compute assembly center for exploded view vectors
  const assemblyCenter = new THREE.Vector3(0, 0.9, 0);

  blueprint.parts.forEach((part, idx) => {
    const rawGeom = rawPartGeoms[idx];
    const qem = qemResults[idx];
    const optGeom = qem.geometry;

    const textures = synthesizePBRTextures(
      part.name,
      part.material,
      options.maxAnisotropy,
      256
    );
    const material = createMaterialForPart(part, textures, options.isSoftwareGl);

    disposables.push(
      rawGeom,
      optGeom,
      textures.map,
      textures.normalMap,
      textures.roughnessMap,
      textures.metalnessMap,
      material
    );

    optGeom.computeBoundingBox();
    const partCenter = new THREE.Vector3();
    optGeom.boundingBox?.getCenter(partCenter);
    const explodeDir = partCenter.clone().sub(assemblyCenter);
    if (explodeDir.lengthSq() < 1e-4) {
      explodeDir.set(0, 0.5, 0);
    } else {
      explodeDir.normalize();
    }

    const optMesh = new THREE.Mesh(optGeom, material);
    optMesh.name = part.name;
    optMesh.castShadow = true;
    optMesh.receiveShadow = true;
    optMesh.userData = {
      partId: part.id,
      tier: part.tier,
      explodeDir: explodeDir.toArray(),
      baseMaterial: material,
      partName: part.name,
      defaultEmissive: mColorHex(part.material.emissiveColor),
      defaultEmissiveIntensity: part.material.emissiveIntensity ?? 0,
    };
    optimizedGroup.add(optMesh);

    const rawMesh = new THREE.Mesh(rawGeom, material);
    rawMesh.name = `${part.name}_Raw`;
    rawMesh.castShadow = true;
    rawMesh.receiveShadow = true;
    rawMesh.userData = {
      partId: part.id,
      tier: part.tier,
      explodeDir: explodeDir.toArray(),
      baseMaterial: material,
      partName: part.name,
      defaultEmissive: mColorHex(part.material.emissiveColor),
      defaultEmissiveIntensity: part.material.emissiveIntensity ?? 0,
    };
    rawGroup.add(rawMesh);

    pbrPreviews.push(textures.preview);
    totalOptVertices += qem.optimizedVertices;
    totalOptFaces += qem.optimizedFaces;

    partBreakdown.push({
      id: part.id,
      name: part.name,
      tier: part.tier,
      pattern: part.material.pattern,
      rawFaces: qem.rawFaces,
      optimizedFaces: qem.optimizedFaces,
      roughness: part.material.roughness,
      metalness: part.material.metalness,
    });
  });

  const tPbrMs = Math.round(performance.now() - tPbr0);
  const blueprintMs = options.blueprintTimeMs ?? 0;
  const totalMs = Math.round(performance.now() - tStart + blueprintMs);

  const reductionPct =
    totalRawFaces > 0
      ? Math.max(0, Number((((totalRawFaces - totalOptFaces) / totalRawFaces) * 100).toFixed(1)))
      : 0;

  // Estimate binary GLB size from geometry buffers + compressed 256px PNG textures
  const estimatedGlbKb = Math.round(
    (totalOptVertices * 44 + totalOptFaces * 12) / 1024 + blueprint.parts.length * 68
  );

  return {
    optimizedGroup,
    rawGroup,
    pbrPreviews,
    metrics: {
      rawVertices: totalRawVertices,
      rawFaces: totalRawFaces,
      optimizedVertices: totalOptVertices,
      optimizedFaces: totalOptFaces,
      polygonReductionPct: reductionPct,
      partCount: blueprint.parts.length,
      estimatedGlbKb,
      timingsMs: {
        blueprint: blueprintMs,
        meshGen: tMeshMs,
        qemOpt: tQemMs,
        pbrSynth: tPbrMs,
        total: totalMs,
      },
      partBreakdown,
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
