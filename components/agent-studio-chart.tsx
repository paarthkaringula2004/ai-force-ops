import type { StudioChart } from "@/lib/agent-studio-charts";

export default function AgentStudioChart({ chart }: { chart: StudioChart }) {
  const max = Math.max(1, ...chart.points.map(point => point.value));
  return <figure className="mt-4 min-w-[220px] rounded-xl border border-purple-200 bg-white p-4">
    <figcaption className="mb-4 font-semibold text-slate-800">{chart.title}</figcaption>
    <div role="img" aria-label={chart.points.map(point => `${point.label}: ${point.value}`).join(", ")} className="space-y-3">
      {chart.points.map(point => <div key={point.label}><div className="mb-1 flex justify-between gap-4 text-xs"><span>{point.label}</span><strong>{point.value}</strong></div><div className="h-3 overflow-hidden rounded-full bg-purple-50"><div style={{ width: `${point.value/max*100}%` }} className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" /></div></div>)}
    </div>
    <p className="mt-4 text-[10px] leading-4 text-slate-500">{chart.source}{chart.observedAt ? ` · Observed ${new Date(chart.observedAt).toLocaleString()}` : ""} · Recorded data</p>
  </figure>;
}
