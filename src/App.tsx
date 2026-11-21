import { useCallback, useEffect, useRef, useState } from 'react';
import BenchmarksView from './components/BenchmarksView';
import {
  BlenderToolRail,
  BlenderViewportHeader,
} from './components/BlenderViewportHeader';
import BottomDock from './components/BottomDock';
import LibraryView from './components/LibraryView';
import OutlinerInspector from './components/OutlinerInspector';
import PBRMapsView from './components/PBRMapsView';
import TopBar from './components/TopBar';
import Viewport3D, { type MaterialOverride } from './components/Viewport3D';
import { exportAssetAsGLB, exportAssetAsOBJ } from './pipeline/assetExporter';
import { buildAssetPipeline, type BuiltAssetBundle } from './pipeline/pipelineRunner';
import { PRESET_BLUEPRINTS } from './pipeline/presets';
import type {
  AssetBlueprint,
  CameraPreset,
  HdriPreset,
  MeshQualityView,
  PipelineStage,
  SavedAssetEntry,
  ShadingMode,
  StudioTab,
} from './types/polygen';

const STORAGE_KEY = 'polygen_saved_assets_v1';

function loadSavedAssets(): SavedAssetEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('viewport');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showOverlays, setShowOverlays] = useState(true);

  const [prompt, setPrompt] = useState(PRESET_BLUEPRINTS[0].prompt);
  const [referenceImage, setReferenceImage] = useState<{
    mimeType: string;
    data: string;
    name: string;
  } | null>(null);

  const [blueprint, setBlueprint] = useState<AssetBlueprint>(PRESET_BLUEPRINTS[0]);
  const [targetFaces, setTargetFaces] = useState<number>(
    PRESET_BLUEPRINTS[0].recommendedFaces
  );
  const [bundle, setBundle] = useState<BuiltAssetBundle | null>(null);
  const bundleRef = useRef<BuiltAssetBundle | null>(null);

  const [selectedPartId, setSelectedPartId] = useState<string | null>(
    PRESET_BLUEPRINTS[0].parts[0]?.id ?? null
  );
  const [hiddenPartIds, setHiddenPartIds] = useState<string[]>([]);
  const [materialOverrides, setMaterialOverrides] = useState<
    Record<string, MaterialOverride>
  >({});

  const [stage, setStage] = useState<PipelineStage>('completed');
  const [stageMessage, setStageMessage] = useState('Asset ready for inspection.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [shadingMode, setShadingMode] = useState<ShadingMode>('pbr');
  const [hdriPreset, setHdriPreset] = useState<HdriPreset>('studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
  const [cameraTrigger, setCameraTrigger] = useState(0);
  const [meshQuality, setMeshQuality] = useState<MeshQualityView>('optimized');
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [savedAssets, setSavedAssets] = useState<SavedAssetEntry[]>(() =>
    loadSavedAssets()
  );

  const rendererCapsRef = useRef({
    maxAnisotropy: 4,
    isSoftwareGl: false,
    ready: false,
  });

  const lastBlueprintMsRef = useRef(0);

  const rebuildBundle = useCallback(
    (bp: AssetBlueprint, faces: number, blueprintTimeMs = 0) => {
      const next = buildAssetPipeline(bp, faces, {
        maxAnisotropy: rendererCapsRef.current.maxAnisotropy,
        isSoftwareGl: rendererCapsRef.current.isSoftwareGl,
        blueprintTimeMs,
      });

      const prev = bundleRef.current;
      bundleRef.current = next;
      setBundle(next);
      if (prev) {
        prev.dispose();
      }
      return next;
    },
    []
  );

  const handleRendererReady = useCallback(
    (info: { maxAnisotropy: number; isSoftwareGl: boolean }) => {
      rendererCapsRef.current = { ...info, ready: true };
      rebuildBundle(blueprint, targetFaces, lastBlueprintMsRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    return () => {
      bundleRef.current?.dispose();
    };
  }, []);

  // Keyboard shortcut 'H' to toggle Bottom Dock, 'N' to toggle Inspector
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (isInput) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'n' || e.key === 'N') {
        setInspectorOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const targetChangeTimerRef = useRef<number | null>(null);
  const handleTargetFacesChange = (faces: number) => {
    setTargetFaces(faces);
    if (targetChangeTimerRef.current) {
      window.clearTimeout(targetChangeTimerRef.current);
    }
    targetChangeTimerRef.current = window.setTimeout(() => {
      rebuildBundle(blueprint, faces, lastBlueprintMsRef.current);
    }, 160);
  };

  const handleGenerate = async () => {
    setErrorMessage(null);
    setStage('blueprint');
    setStageMessage('Synthesizing multi-part 3D geometry blueprint...');
    const t0 = performance.now();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          referenceImage: referenceImage
            ? { mimeType: referenceImage.mimeType, data: referenceImage.data }
            : undefined,
        }),
      });

      const payload = (await res.json()) as {
        blueprint?: AssetBlueprint;
        error?: string;
      };

      if (!res.ok || !payload.blueprint) {
        throw new Error(payload.error || 'Blueprint generation failed.');
      }

      const bpMs = Math.round(performance.now() - t0);
      lastBlueprintMsRef.current = bpMs;
      const nextBp = payload.blueprint;
      const nextFaces = nextBp.recommendedFaces || targetFaces;

      setStage('mesh_gen');
      setStageMessage('Constructing procedural high-poly sub-parts...');
      await new Promise((r) => setTimeout(r, 40));

      setStage('qem_opt');
      setStageMessage('Running Garland-Heckbert QEM decimation & UV mapping...');
      await new Promise((r) => setTimeout(r, 40));

      setStage('pbr_synth');
      setStageMessage('Baking Albedo, Normal, Roughness & Metalness maps...');
      await new Promise((r) => setTimeout(r, 40));

      setBlueprint(nextBp);
      setTargetFaces(nextFaces);
      setExplodeAmount(0);
      setMeshQuality('optimized');
      setSelectedPartId(nextBp.parts[0]?.id ?? null);
      setHiddenPartIds([]);
      setMaterialOverrides({});
      const built = rebuildBundle(nextBp, nextFaces, bpMs);

      const newEntry: SavedAssetEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        targetFaces: nextFaces,
        blueprint: nextBp,
        metrics: built.metrics,
      };
      setSavedAssets((prev) => {
        const updated = [newEntry, ...prev].slice(0, 16);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore storage quota issues
        }
        return updated;
      });

      setStage('completed');
      setStageMessage('3D asset ready for inspection and export.');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unexpected pipeline failure.';
      setStage('failed');
      setErrorMessage(msg);
    }
  };

  const handleLoadBlueprint = (bp: AssetBlueprint, faces?: number) => {
    const nextFaces = faces ?? bp.recommendedFaces ?? 10000;
    lastBlueprintMsRef.current = 0;
    setErrorMessage(null);
    setBlueprint(bp);
    setPrompt(bp.prompt);
    setTargetFaces(nextFaces);
    setExplodeAmount(0);
    setMeshQuality('optimized');
    setSelectedPartId(bp.parts[0]?.id ?? null);
    setHiddenPartIds([]);
    setMaterialOverrides({});
    rebuildBundle(bp, nextFaces, 0);
    setStage('completed');
    setActiveTab('viewport');
  };

  const handleDeleteSaved = (id: string) => {
    setSavedAssets((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage error
      }
      return updated;
    });
  };

  const handleTogglePartVisibility = (id: string) => {
    setHiddenPartIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleUpdatePartMaterial = (id: string, next: MaterialOverride) => {
    setMaterialOverrides((prev) => ({
      ...prev,
      [id]: next,
    }));
  };

  const handleResetPartMaterial = (id: string) => {
    setMaterialOverrides((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    // Trigger rebuild of material defaults for that part
    rebuildBundle(blueprint, targetFaces, lastBlueprintMsRef.current);
  };

  const handleExportGLB = async () => {
    if (!bundle || exporting) return;
    setExporting(true);
    try {
      const targetGroup =
        meshQuality === 'raw' ? bundle.rawGroup : bundle.optimizedGroup;
      await exportAssetAsGLB(targetGroup, blueprint.title);
    } finally {
      setExporting(false);
    }
  };

  const handleExportOBJ = () => {
    if (!bundle || exporting) return;
    const targetGroup =
      meshQuality === 'raw' ? bundle.rawGroup : bundle.optimizedGroup;
    exportAssetAsOBJ(targetGroup, blueprint.title);
  };

  const handleCameraPresetChange = (preset: CameraPreset) => {
    setCameraPreset(preset);
    setCameraTrigger((c) => c + 1);
  };

  const selectedPartName =
    blueprint.parts.find((p) => p.id === selectedPartId)?.name ?? null;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#181818] text-[#E5E5E5] overflow-hidden">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportGLB={handleExportGLB}
        exporting={exporting}
        hasAsset={Boolean(bundle)}
      />

      <main className="relative flex-1 min-h-0 flex overflow-hidden">
        {/* Persistent Blender Layout Workspace (Left Tool Rail + Center 3D Viewport + Right Outliner/Properties) */}
        <div
          className={`absolute inset-0 flex ${
            activeTab === 'viewport'
              ? 'visible pointer-events-auto'
              : 'invisible pointer-events-none'
          }`}
        >
          <BlenderToolRail
            shadingMode={shadingMode}
            onShadingModeChange={setShadingMode}
            autoRotate={autoRotate}
            onAutoRotateChange={setAutoRotate}
            showOverlays={showOverlays}
            onToggleOverlays={() => setShowOverlays((v) => !v)}
            onResetCamera={() => handleCameraPresetChange('perspective')}
          />

          <div className="relative flex-1 min-w-0 flex flex-col">
            <BlenderViewportHeader
              meshQuality={meshQuality}
              onMeshQualityChange={setMeshQuality}
              cameraPreset={cameraPreset}
              onCameraPresetChange={handleCameraPresetChange}
              hdriPreset={hdriPreset}
              onHdriPresetChange={setHdriPreset}
              inspectorOpen={inspectorOpen}
              onToggleInspector={() => setInspectorOpen((v) => !v)}
              selectedPartName={selectedPartName}
            />

            <div className="relative flex-1 min-h-0">
              <Viewport3D
                bundle={bundle}
                shadingMode={shadingMode}
                hdriPreset={hdriPreset}
                cameraPreset={cameraPreset}
                cameraTrigger={cameraTrigger}
                meshQuality={meshQuality}
                explodeAmount={explodeAmount}
                autoRotate={autoRotate}
                selectedPartId={selectedPartId}
                hiddenPartIds={hiddenPartIds}
                materialOverrides={materialOverrides}
                showOverlays={showOverlays}
                onSelectPart={setSelectedPartId}
                onRendererReady={handleRendererReady}
              />

              {/* Blender-style top-left viewport statistics text */}
              {activeTab === 'viewport' && showOverlays && (
                <div className="absolute top-3.5 left-4 z-10 pointer-events-none">
                  <div className="font-display text-sm font-semibold text-[#E5E5E5] tracking-tight">
                    {blueprint.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#A0A0A0] font-mono-tabular flex flex-wrap items-center gap-1.5">
                    <span>User Perspective</span>
                    <span aria-hidden="true">·</span>
                    <span>{blueprint.parts.length} Objects</span>
                    {bundle && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {(meshQuality === 'raw'
                            ? bundle.metrics.rawFaces
                            : bundle.metrics.optimizedFaces
                          ).toLocaleString()}{' '}
                          Triangles
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'viewport' && (
                <BottomDock
                  collapsed={dockCollapsed}
                  onToggleCollapse={() => setDockCollapsed((v) => !v)}
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  referenceImage={referenceImage}
                  onReferenceImageChange={setReferenceImage}
                  onGenerate={handleGenerate}
                  stage={stage}
                  stageMessage={stageMessage}
                  errorMessage={errorMessage}
                  targetFaces={targetFaces}
                  onTargetFacesChange={handleTargetFacesChange}
                  explodeAmount={explodeAmount}
                  onExplodeChange={setExplodeAmount}
                  metrics={bundle?.metrics ?? null}
                  onExportGLB={handleExportGLB}
                  onExportOBJ={handleExportOBJ}
                  exporting={exporting}
                />
              )}
            </div>
          </div>

          {inspectorOpen && (
            <OutlinerInspector
              blueprint={blueprint}
              metrics={bundle?.metrics ?? null}
              selectedPartId={selectedPartId}
              hiddenPartIds={hiddenPartIds}
              materialOverrides={materialOverrides}
              onSelectPart={setSelectedPartId}
              onToggleVisibility={handleTogglePartVisibility}
              onUpdateMaterial={handleUpdatePartMaterial}
              onResetMaterial={handleResetPartMaterial}
            />
          )}
        </div>

        {activeTab === 'pbr_maps' && (
          <div className="relative z-10 flex-1 h-full bg-[#1D1F24]">
            <PBRMapsView
              title={blueprint.title}
              previews={bundle?.pbrPreviews ?? []}
            />
          </div>
        )}

        {activeTab === 'benchmarks' && (
          <div className="relative z-10 flex-1 h-full bg-[#1D1F24]">
            <BenchmarksView
              blueprint={blueprint}
              metrics={bundle?.metrics ?? null}
            />
          </div>
        )}

        {activeTab === 'library' && (
          <div className="relative z-10 flex-1 h-full bg-[#1D1F24]">
            <LibraryView
              presets={PRESET_BLUEPRINTS}
              savedAssets={savedAssets}
              activeTitle={blueprint.title}
              onLoadBlueprint={handleLoadBlueprint}
              onDeleteSaved={handleDeleteSaved}
            />
          </div>
        )}
      </main>
    </div>
  );
}
