export type MaterialPattern =
  | 'forged_metal'
  | 'rusted_iron'
  | 'carved_stone'
  | 'brushed_brass'
  | 'polished_wood'
  | 'obsidian_crystal'
  | 'carbon_weave'
  | 'ceramic_glaze';

export type GeometryType =
  | 'extrude_profile'
  | 'lathe_profile'
  | 'tube_curve'
  | 'cylinder_taper'
  | 'faceted_gem'
  | 'gear_ring'
  | 'beveled_box'
  | 'torus';

export type PartTier = 'primary' | 'secondary' | 'accent';

export interface PartDimensions {
  width?: number;
  height?: number;
  depth?: number;
  radiusTop?: number;
  radiusBottom?: number;
  bevelSize?: number;
  bevelThickness?: number;
  tubeRadius?: number;
  radialSegments?: number;
  teethCount?: number;
  twistAngle?: number;
}

export interface PartMaterialSpec {
  baseColor: string;
  secondaryColor: string;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  transmission?: number;
  ior?: number;
  pattern: MaterialPattern;
}

export interface PartSpec {
  id: string;
  name: string;
  tier: PartTier;
  geometryType: GeometryType;
  profilePoints?: [number, number][];
  curvePoints?: [number, number, number][];
  dimensions: PartDimensions;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  material: PartMaterialSpec;
}

export interface AssetBlueprint {
  title: string;
  prompt: string;
  category: string;
  designNotes: string;
  recommendedFaces: number;
  parts: PartSpec[];
}

export type PipelineStage =
  | 'idle'
  | 'blueprint'
  | 'mesh_gen'
  | 'qem_opt'
  | 'pbr_synth'
  | 'completed'
  | 'failed';

export interface PartTelemetry {
  id: string;
  name: string;
  tier: PartTier;
  pattern: MaterialPattern;
  rawFaces: number;
  optimizedFaces: number;
  roughness: number;
  metalness: number;
}

export interface PipelineMetrics {
  rawVertices: number;
  rawFaces: number;
  optimizedVertices: number;
  optimizedFaces: number;
  polygonReductionPct: number;
  partCount: number;
  estimatedGlbKb: number;
  timingsMs: {
    blueprint: number;
    meshGen: number;
    qemOpt: number;
    pbrSynth: number;
    total: number;
  };
  partBreakdown: PartTelemetry[];
}

export interface PBRMapPreview {
  partName: string;
  pattern: MaterialPattern;
  albedoUrl: string;
  normalUrl: string;
  roughnessUrl: string;
  metalnessUrl: string;
}

export type ShadingMode = 'pbr' | 'wireframe' | 'clay' | 'normals' | 'uv_checker';
export type HdriPreset = 'studio' | 'sunset' | 'warehouse' | 'noir';
export type CameraPreset = 'perspective' | 'front' | 'side' | 'top';
export type MeshQualityView = 'optimized' | 'raw';
export type StudioTab = 'viewport' | 'pbr_maps' | 'benchmarks' | 'library';

export interface SavedAssetEntry {
  id: string;
  createdAt: string;
  targetFaces: number;
  blueprint: AssetBlueprint;
  metrics: PipelineMetrics;
}
