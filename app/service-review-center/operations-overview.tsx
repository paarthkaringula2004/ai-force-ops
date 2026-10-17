"use client";
import type { ReviewReading, ReviewSource } from "./review-data";

export default function OperationsOverview({
    records,
    sources,
    mode,
}: {
    records: ReviewReading[];
    sources: ReviewSource[];
    mode: string;
}) {
    const current = records.filter(
        (r) =>
            r.isCurrent !== false &&
            (!r.sourceId || sources.some((s) => s.id === r.sourceId && !s.stale)),
    );
    const latest = new Map<string, ReviewReading>();
    for (const r of current) if (!latest.has(r.recordKey)) latest.set(r.recordKey, r);
    const readings = [...latest.values()];
    const sum = (key: string) => {
        const matches = readings.filter(
            (r) => r.sourceId && r.recordType === "metric" && r.recordKey.endsWith(":" + key),
        );
        return matches.length ? matches.reduce((n, r) => n + Number(r.payload.value), 0) : null;
    };
    const metrics =
        mode === "aiops"
            ? [
                  [
                      "Successful tasks",
                      sum("successfulTasks"),
                      "Latest 200 collected tasks per project",
                  ],
                  ["Failed tasks", sum("failedTasks"), "Success, error and failed outcomes only"],
                  ["Running / queued", sum("runningTasks"), "Current state of collected tasks"],
                  [
                      "Awaiting approval",
                      sum("pendingTasks"),
                      "Waiting for confirmation in Semaphore",
                  ],
              ]
            : [
                  ["Monitored targets", sum("targets"), "Prometheus scrape targets"],
                  [
                      "Unavailable targets",
                      sum("unavailableTargets"),
                      "Targets currently reporting down",
                  ],
                  ["Current alerts", sum("activeAlerts"), "Includes suppressed alerts"],
                  ["Open incidents", sum("openIncidents"), "Requires ServiceNow"],
              ];
    const health = readings.filter((r) => r.recordType === "health"),
        availability = readings.filter(
            (r) => r.recordType === "availability" && r.sourceKind === "prometheus",
        ),
        rates = readings.filter(
            (r) => r.recordType === "metric" && r.recordKey.endsWith(":automationSuccess"),
        );
    const date = (s: string) => new Date(s).toLocaleString();
    return (
        <div className="space-y-5 text-sm text-slate-700">
            <p className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 leading-6">
                Measured readings from your connected sources. Unavailable or stale sources show
                “—”; they are never counted as healthy or zero. Different Prometheus sources can
                monitor the same target, so counts are per source.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map(([label, value, scope]) => (
                    <article
                        key={String(label)}
                        className="rounded-2xl border border-slate-200 bg-white p-5"
                    >
                        <p className="font-medium text-slate-600">{label}</p>
                        <p className="my-3 text-3xl font-semibold text-slate-900">
                            {value === null ? "—" : Number(value).toLocaleString()}
                        </p>
                        <p className="text-xs leading-5 text-slate-500">{scope}</p>
                    </article>
                ))}
            </div>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-semibold text-slate-900">
                    {mode === "aiops" ? "Automation results" : "Target health"}
                </h2>
                {mode === "aiops" ? (
                    <div className="mt-4 space-y-3">
                        {rates.map((r) => (
                            <div key={r.id} className="rounded-xl bg-slate-50 p-4">
                                <div className="flex justify-between gap-3">
                                    <strong>{r.sourceName}</strong>
                                    <strong className="text-indigo-700">
                                        {String(r.payload.value)}%
                                    </strong>
                                </div>
                                <p className="mt-2 text-xs">
                                    {String(r.payload.successful)} successful /{" "}
                                    {String(r.payload.completed)} completed tasks.{" "}
                                    {String(r.payload.scope)}
                                </p>
                                <p className="mt-2 text-xs text-slate-500">
                                    Observed {date(r.observedAt)}
                                </p>
                            </div>
                        ))}
                        {!rates.length && (
                            <p className="py-5 text-slate-500">
                                No completed automation results have been collected.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="text-xs text-slate-500">
                                <tr>
                                    {["Target", "Source", "Job", "Health", "Observed"].map((h) => (
                                        <th key={h} className="pb-3 pr-4">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {health.map((r) => (
                                    <tr key={r.id} className="border-t border-slate-100">
                                        <td className="py-3 pr-4">{String(r.payload.device)}</td>
                                        <td className="pr-4 text-xs">{r.sourceName}</td>
                                        <td className="pr-4 text-xs">
                                            {String(r.payload.category)}
                                        </td>
                                        <td className="pr-4">
                                            <span
                                                className={`rounded-full px-2 py-1 text-xs ${r.payload.status === "Healthy" ? "bg-indigo-50 text-indigo-700" : r.payload.status === "Down" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}
                                            >
                                                {String(r.payload.status)}
                                            </span>
                                        </td>
                                        <td className="text-xs text-slate-500">
                                            {date(r.observedAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!health.length && (
                            <p className="py-5 text-slate-500">
                                No fresh target health readings. Check Data sources.
                            </p>
                        )}
                    </div>
                )}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-semibold text-slate-900">
                    Observed healthy samples · last 24 hours
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                    This is the proportion of recorded successful scrapes, not a contractual uptime
                    calculation. Missing samples and unmonitored periods are excluded.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {availability.map((r) => (
                        <div key={r.id} className="rounded-xl border border-slate-100 p-4">
                            <div className="flex justify-between gap-3">
                                <span className="break-all">{String(r.payload.service)}</span>
                                <strong>{String(r.payload.availability)}%</strong>
                            </div>
                            <div className="my-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full bg-indigo-500"
                                    style={{ width: `${Number(r.payload.availability)}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                {r.sourceName} · {String(r.payload.samples ?? "Unknown")} recorded
                                samples · {date(r.observedAt)}
                            </p>
                        </div>
                    ))}
                </div>
                {!availability.length && (
                    <p className="py-5 text-slate-500">No availability samples collected yet.</p>
                )}
            </section>
            {(["inventory", "lifecycle", "forecast"] as const).map((type) => {
                const rows = readings.filter((r) => r.recordType === type);
                if (!rows.length) return null;
                return (
                    <section
                        key={type}
                        className="rounded-2xl border border-slate-200 bg-white p-5"
                    >
                        <h2 className="font-semibold text-slate-900">
                            {type === "inventory"
                                ? "Reported inventory"
                                : type === "lifecycle"
                                  ? "Reported event stages"
                                  : "Supplied capacity forecasts"}
                        </h2>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                            {type === "inventory"
                                ? "Counts supplied by the inventory system; monitoring targets are not an endpoint inventory."
                                : type === "lifecycle"
                                  ? "Independent reported counts. These do not establish a conversion funnel or causal relationship."
                                  : "Forecast bounds supplied by your collector; Review Center does not generate these predictions."}
                        </p>
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr>
                                        {(type === "inventory"
                                            ? ["Region", "Category", "Count", "Source", "Observed"]
                                            : type === "lifecycle"
                                              ? ["Stage", "Count", "Source", "Observed"]
                                              : [
                                                    "Environment",
                                                    "Period",
                                                    "Lower bound",
                                                    "Upper bound",
                                                    "Actual",
                                                    "Source",
                                                    "Observed",
                                                ]
                                        ).map((h) => (
                                            <th key={h} className="pb-3 pr-4 text-slate-500">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => {
                                        const fields =
                                            type === "inventory"
                                                ? ["region", "category", "count"]
                                                : type === "lifecycle"
                                                  ? ["stage", "count"]
                                                  : [
                                                        "environment",
                                                        "period",
                                                        "lowerBound",
                                                        "upperBound",
                                                        "actual",
                                                    ];
                                        return (
                                            <tr key={r.id} className="border-t border-slate-100">
                                                {fields.map((f) => (
                                                    <td key={f} className="py-3 pr-4">
                                                        {String(r.payload[f] ?? "—")}
                                                    </td>
                                                ))}
                                                <td className="pr-4">{r.sourceName}</td>
                                                <td>{date(r.observedAt)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                );
            })}
            {mode === "executive" && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="font-semibold">Coverage and business outcomes</h2>
                    <p className="mt-3 leading-6">
                        {sources.filter((s) => !s.stale).length} fresh sources out of{" "}
                        {sources.filter((s) => s.enabled).length} enabled. ServiceNow incidents,
                        endpoint inventory, compliance, cost savings and customer satisfaction
                        require those systems or an authenticated external collector. Monitoring
                        does not prove compliance or business value.
                    </p>
                </section>
            )}
        </div>
    );
}
