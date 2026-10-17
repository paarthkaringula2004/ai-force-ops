import type { ReviewSource, ReviewWorker } from "./review-data";
export default function ManagerSources({
    sources,
    worker,
}: {
    sources: ReviewSource[];
    worker: ReviewWorker;
}) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
            <h2 className="font-semibold">Organization data sources</h2>
            <p className="mt-2 text-slate-500">
                Read-only overview of the organization’s connected collectors. Updates refresh
                automatically. The Admin maintains these connections.
            </p>
            <p className="mt-3 text-xs">
                Background collector: {worker.active ? "Running" : "No recent heartbeat"}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {sources.map((s) => (
                    <article key={s.id} className="rounded-xl border p-4">
                        <h3 className="font-medium">{s.name}</h3>
                        <p className="mt-2 text-xs">
                            {!s.enabled ? "Disabled" : s.stale ? "Needs attention" : "Fresh"} ·{" "}
                            {s.readingCount} readings
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                            Last imported:{" "}
                            {s.importedAt ? new Date(s.importedAt).toLocaleString() : "Not yet"}
                        </p>
                    </article>
                ))}
            </div>
            {!sources.length && (
                <p className="mt-4 text-slate-500">
                    No organization sources have been connected yet.
                </p>
            )}
        </section>
    );
}
