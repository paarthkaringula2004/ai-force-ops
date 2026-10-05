import type { RecordRow, RunData } from "./types";
export function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * fraction) - 1),
    )
  ];
}
export function runsInWindow(records: RecordRow[], hours: number) {
  const cutoff = Date.now() - hours * 3600000;
  return records
    .filter((r) => r.kind === "run" && Date.parse(r.created_at) >= cutoff)
    .map((r) => ({ ...r, run: r.data as unknown as RunData }));
}
export function summarize(runs: RunData[]) {
  const latencies = runs
    .map((r) => r.latency)
    .filter((v): v is number => typeof v === "number");
  const complete = runs.filter((r) => r.status !== "pending");
  return {
    count: runs.length,
    tokens: runs.reduce((a, r) => a + r.totalTokens, 0),
    medianTokens: percentile(
      runs.map((r) => r.totalTokens),
      0.5,
    ),
    errorRate: complete.length
      ? (100 * complete.filter((r) => r.status === "error").length) /
        complete.length
      : null,
    streaming: runs.length
      ? (100 * runs.filter((r) => r.streamed).length) / runs.length
      : null,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    success: complete.length
      ? (100 * complete.filter((r) => r.status === "success").length) /
        complete.length
      : null,
  };
}
export function series(
  runs: RunData[],
  hours: number,
  measure: (runs: RunData[]) => number | null,
) {
  const end = Date.now(),
    step = (hours * 3600000) / 24;
  return Array.from({ length: 24 }, (_, i) => {
    const from = end - (24 - i) * step,
      to = from + step;
    return {
      time: new Date(to).toISOString(),
      value: measure(
        runs.filter(
          (r) => Date.parse(r.start) >= from && Date.parse(r.start) < to,
        ),
      ),
    };
  });
}
