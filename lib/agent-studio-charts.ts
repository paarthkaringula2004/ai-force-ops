export type StudioChart = { id: string; title: string; source: string; observedAt: string | null; points: { label: string; value: number }[] };
export type ChartSource = "scan_reports" | "incidents" | "requests";
export function chartCounts(source: ChartSource, evidence: unknown): Omit<StudioChart, "id"> | null {
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const report = object(evidence);
  const rows = source === "scan_reports" ? report.findings : source === "incidents" && Array.isArray(report.records) ? report.records : evidence;
  if (!Array.isArray(rows) || !rows.length) return null;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const record = object(row), data = source === "incidents" ? object(record.data) : record;
    const raw = source === "scan_reports" ? data.severity ?? object(data.facts).severity : source === "incidents" ? data.priority : data.status;
    const label = typeof raw === "string" || typeof raw === "number" ? String(raw).slice(0, 80) : "Unspecified";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const dates = source === "scan_reports" ? [report.completedAt] : rows.map(row => object(row).observedAt ?? object(row).createdAt);
  const validDates = dates.map(value => new Date(String(value)).getTime()).filter(Number.isFinite);
  return { title: source === "scan_reports" ? "Latest scan findings by severity" : source === "incidents" ? "Recent incidents by priority" : "Recent requests by status", source: source === "scan_reports" ? "Latest completed scan" : source === "incidents" ? report.mode === "live" ? "Live ServiceNow incident read (up to 20)" : "Saved ServiceNow incidents (up to 20; not live)" : "Your latest 20 workplace requests", observedAt: validDates.length ? new Date(Math.max(...validDates)).toISOString() : null, points: [...counts].map(([label, value]) => ({ label, value })) };
}
