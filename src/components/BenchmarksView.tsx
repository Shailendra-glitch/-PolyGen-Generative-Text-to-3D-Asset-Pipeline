import type { AssetBlueprint, PipelineMetrics } from '../types/polygen';

interface BenchmarksViewProps {
  blueprint: AssetBlueprint | null;
  metrics: PipelineMetrics | null;
}

export default function BenchmarksView({ blueprint, metrics }: BenchmarksViewProps) {
  if (!blueprint || !metrics) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-[#9B9B9B] bg-[#1D1F24]">
        Run the pipeline to inspect QEM polygon reduction benchmarks and stage timings.
      </div>
    );
  }

  const stageRows = [
    { label: '01. AI Blueprint Synthesis', ms: metrics.timingsMs.blueprint },
    { label: '02. Procedural Mesh Generation', ms: metrics.timingsMs.meshGen },
    { label: '03. QEM Decimation & UV Unwrap', ms: metrics.timingsMs.qemOpt },
    { label: '04. PBR Texture Map Synthesis', ms: metrics.timingsMs.pbrSynth },
  ];
  const maxStageMs = Math.max(1, ...stageRows.map((s) => s.ms));

  return (
    <div className="h-full overflow-y-auto px-6 py-8 bg-[#1D1F24]">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="border-b border-[#323232] pb-6">
          <h1 className="font-display text-2xl font-semibold text-[#E5E5E5] tracking-tight">
            Topology Statistics & Pipeline Benchmarks
          </h1>
          <p className="mt-1.5 text-sm text-[#9B9B9B]">
            {blueprint.title} · {blueprint.category} · {blueprint.designNotes}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#242424] border border-[#383838] rounded-md p-4">
            <div className="text-xs text-[#9B9B9B] mb-1">Raw Triangles</div>
            <div className="font-mono-tabular text-2xl font-semibold text-[#E5E5E5]">
              {metrics.rawFaces.toLocaleString()}
            </div>
            <div className="text-xs text-[#7C7C7C] font-mono-tabular mt-1">
              {metrics.rawVertices.toLocaleString()} vertices
            </div>
          </div>

          <div className="bg-[#242424] border border-[#383838] rounded-md p-4">
            <div className="text-xs text-[#9B9B9B] mb-1">QEM Optimized</div>
            <div className="font-mono-tabular text-2xl font-semibold text-[#89B4FA]">
              {metrics.optimizedFaces.toLocaleString()}
            </div>
            <div className="text-xs text-[#7C7C7C] font-mono-tabular mt-1">
              {metrics.optimizedVertices.toLocaleString()} vertices
            </div>
          </div>

          <div className="bg-[#242424] border border-[#383838] rounded-md p-4">
            <div className="text-xs text-[#9B9B9B] mb-1">Polygon Reduction</div>
            <div className="font-mono-tabular text-2xl font-semibold text-[#E88D2A]">
              {metrics.polygonReductionPct}%
            </div>
            <div className="text-xs text-[#7C7C7C] mt-1">
              Garland-Heckbert QEM
            </div>
          </div>

          <div className="bg-[#242424] border border-[#383838] rounded-md p-4">
            <div className="text-xs text-[#9B9B9B] mb-1">Total Execution</div>
            <div className="font-mono-tabular text-2xl font-semibold text-[#E5E5E5]">
              {(metrics.timingsMs.total / 1000).toFixed(2)}s
            </div>
            <div className="text-xs text-[#7C7C7C] font-mono-tabular mt-1">
              ~{metrics.estimatedGlbKb} KB .GLB
            </div>
          </div>
        </div>

        <section>
          <h2 className="font-display text-base font-semibold text-[#E5E5E5] mb-4">
            Stage Latency Breakdown
          </h2>
          <div className="bg-[#242424] border border-[#383838] rounded-md p-5 space-y-4">
            {stageRows.map((row) => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#D4D4D4]">{row.label}</span>
                  <span className="font-mono-tabular text-[#E5E5E5]">{row.ms} ms</span>
                </div>
                <div className="h-2 bg-[#181818] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#5680C2] rounded-full"
                    style={{ width: `${Math.max(3, (row.ms / maxStageMs) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-[#E5E5E5] mb-4">
            Per-Part Topology & Material Allocation
          </h2>
          <div className="overflow-x-auto border border-[#383838] rounded-md bg-[#242424]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#323232] bg-[#2B2B2B] text-[#B8B8B8]">
                  <th className="py-2.5 px-4 font-medium">Mesh Object</th>
                  <th className="py-2.5 px-4 font-medium">Tier</th>
                  <th className="py-2.5 px-4 font-medium">Shader Pattern</th>
                  <th className="py-2.5 px-4 font-medium text-right">Raw Tris</th>
                  <th className="py-2.5 px-4 font-medium text-right">Optimized Tris</th>
                  <th className="py-2.5 px-4 font-medium text-right">Roughness</th>
                  <th className="py-2.5 px-4 font-medium text-right">Metallic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2E2E2E]">
                {metrics.partBreakdown.map((part) => (
                  <tr key={part.id} className="text-[#D4D4D4] hover:bg-[#2F2F2F]">
                    <td className="py-2.5 px-4 font-medium">{part.name}</td>
                    <td className="py-2.5 px-4 text-[#9B9B9B] capitalize">{part.tier}</td>
                    <td className="py-2.5 px-4 text-[#9B9B9B]">
                      {part.pattern.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular text-[#8E8E8E]">
                      {part.rawFaces.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular text-[#89B4FA]">
                      {part.optimizedFaces.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular">
                      {part.roughness.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular">
                      {part.metalness.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
