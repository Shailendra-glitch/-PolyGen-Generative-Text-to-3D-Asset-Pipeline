import {
  Box,
  Compass,
  Eye,
  Grid,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Sun,
} from 'lucide-react';
import type {
  CameraPreset,
  HdriPreset,
  MeshQualityView,
  ShadingMode,
} from '../types/polygen';

interface BlenderToolRailProps {
  shadingMode: ShadingMode;
  onShadingModeChange: (m: ShadingMode) => void;
  autoRotate: boolean;
  onAutoRotateChange: (v: boolean) => void;
  showOverlays: boolean;
  onToggleOverlays: () => void;
  onResetCamera: () => void;
}

export function BlenderToolRail({
  shadingMode,
  onShadingModeChange,
  autoRotate,
  onAutoRotateChange,
  showOverlays,
  onToggleOverlays,
  onResetCamera,
}: BlenderToolRailProps) {
  const shadingTools: Array<{
    id: ShadingMode;
    label: string;
    icon: typeof Box;
  }> = [
    { id: 'pbr', label: 'Rendered PBR', icon: Sun },
    { id: 'clay', label: 'Solid Clay', icon: Box },
    { id: 'wireframe', label: 'Wireframe Topology', icon: Grid },
    { id: 'normals', label: 'Surface Normals', icon: Compass },
    { id: 'uv_checker', label: 'UV Checker Grid', icon: Layers },
  ];

  return (
    <aside
      aria-label="Viewport Tools"
      className="w-11 bg-[#242424] border-r border-[#161616] flex flex-col items-center py-2.5 gap-1.5 shrink-0 select-none"
    >
      {shadingTools.map((tool) => {
        const Icon = tool.icon;
        const active = shadingMode === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onShadingModeChange(tool.id)}
            title={tool.label}
            aria-label={tool.label}
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer ${
              active
                ? 'bg-[#4772B3] text-white'
                : 'text-[#A0A0A0] hover:text-[#E5E5E5] hover:bg-[#323232]'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </button>
        );
      })}

      <div className="w-6 h-px bg-[#383838] my-1" />

      <button
        type="button"
        onClick={onToggleOverlays}
        title={showOverlays ? 'Hide Viewport Overlays' : 'Show Viewport Overlays'}
        aria-label="Toggle Viewport Overlays"
        className={`w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer ${
          showOverlays
            ? 'bg-[#323232] text-[#E5E5E5]'
            : 'text-[#808080] hover:text-[#E5E5E5] hover:bg-[#323232]'
        }`}
      >
        <Eye className="w-4 h-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={() => onAutoRotateChange(!autoRotate)}
        title={autoRotate ? 'Pause Turntable' : 'Start Turntable'}
        aria-label="Toggle Turntable Rotation"
        className={`w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer ${
          autoRotate
            ? 'bg-[#4772B3] text-white'
            : 'text-[#A0A0A0] hover:text-[#E5E5E5] hover:bg-[#323232]'
        }`}
      >
        <RotateCw className="w-4 h-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onResetCamera}
        title="Frame Asset (Perspective)"
        aria-label="Reset Camera View"
        className="w-8 h-8 rounded flex items-center justify-center text-[#A0A0A0] hover:text-[#E5E5E5] hover:bg-[#323232] transition-colors cursor-pointer"
      >
        <Compass className="w-4 h-4" aria-hidden="true" />
      </button>
    </aside>
  );
}

interface BlenderViewportHeaderProps {
  meshQuality: MeshQualityView;
  onMeshQualityChange: (q: MeshQualityView) => void;
  cameraPreset: CameraPreset;
  onCameraPresetChange: (c: CameraPreset) => void;
  hdriPreset: HdriPreset;
  onHdriPresetChange: (h: HdriPreset) => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  selectedPartName: string | null;
}

export function BlenderViewportHeader({
  meshQuality,
  onMeshQualityChange,
  cameraPreset,
  onCameraPresetChange,
  hdriPreset,
  onHdriPresetChange,
  inspectorOpen,
  onToggleInspector,
  selectedPartName,
}: BlenderViewportHeaderProps) {
  return (
    <div className="h-9 px-3 bg-[#242424] border-b border-[#161616] flex items-center justify-between gap-4 text-xs shrink-0 select-none">
      {/* Left: Blender Mode + Mesh Stage Switch */}
      <div className="flex items-center gap-3 overflow-x-auto">
        <span className="font-medium text-[#E5E5E5] whitespace-nowrap shrink-0">
          Object Mode
        </span>
        <span className="text-[#555555]" aria-hidden="true">
          |
        </span>
        <div className="flex items-center bg-[#1A1A1A] border border-[#383838] rounded p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onMeshQualityChange('optimized')}
            className={`px-2 py-0.5 rounded-[2px] text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              meshQuality === 'optimized'
                ? 'bg-[#4772B3] text-white'
                : 'text-[#9B9B9B] hover:text-[#E5E5E5]'
            }`}
          >
            QEM Mesh
          </button>
          <button
            type="button"
            onClick={() => onMeshQualityChange('raw')}
            className={`px-2 py-0.5 rounded-[2px] text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              meshQuality === 'raw'
                ? 'bg-[#4772B3] text-white'
                : 'text-[#9B9B9B] hover:text-[#E5E5E5]'
            }`}
          >
            Raw High-Poly
          </button>
        </div>

        {selectedPartName && (
          <>
            <span className="text-[#555555] hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline text-[#E88D2A] font-medium truncate max-w-[200px]">
              {selectedPartName}
            </span>
          </>
        )}
      </div>

      {/* Right: Axis Quick-Views, HDRI World, Outliner Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden md:flex items-center bg-[#1A1A1A] border border-[#383838] rounded p-0.5">
          {(
            [
              ['perspective', 'Persp'],
              ['front', 'Z Front'],
              ['side', 'X Side'],
              ['top', 'Y Top'],
            ] as Array<[CameraPreset, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onCameraPresetChange(id)}
              className={`px-2 py-0.5 rounded-[2px] text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                cameraPreset === id
                  ? 'bg-[#383838] text-[#E5E5E5]'
                  : 'text-[#9B9B9B] hover:text-[#E5E5E5]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={hdriPreset}
          onChange={(e) => onHdriPresetChange(e.target.value as HdriPreset)}
          aria-label="World Lighting Rig"
          className="bg-[#1A1A1A] border border-[#383838] text-[11px] text-[#D8D8D8] rounded px-2 py-1 focus:outline-none focus:border-[#5680C2] cursor-pointer"
        >
          <option value="studio">World: Studio</option>
          <option value="sunset">World: Sunset</option>
          <option value="warehouse">World: Warehouse</option>
          <option value="noir">World: Noir Rim</option>
        </select>

        <button
          type="button"
          onClick={onToggleInspector}
          title={inspectorOpen ? 'Hide Outliner & Properties' : 'Show Outliner & Properties'}
          aria-label="Toggle Scene Outliner"
          className="p-1.5 rounded bg-[#1A1A1A] border border-[#383838] text-[#B8B8B8] hover:text-[#E5E5E5] hover:border-[#525252] transition-colors cursor-pointer"
        >
          {inspectorOpen ? (
            <PanelRightClose className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
