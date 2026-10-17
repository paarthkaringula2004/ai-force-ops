import type { ReviewReading } from "./review-data";

export default function GeoHealthTable({
    records,
    country,
    search,
}: {
    records: ReviewReading[];
    country: string;
    search: string;
}) {
    const fields = [
        "device",
        "ipAddress",
        "site",
        "category",
        "country",
        "vendor",
        "status",
        "description",
    ];
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const rows = records.filter(
        (r) =>
            (country === "All" || r.payload.country === country) &&
            fields
                .map((k) => text(r.payload[k]))
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase()),
    );
    return (
        <>
            <p className="mb-4 text-[11px] leading-5 text-slate-500">
                IP geography estimates the public endpoint location; it may represent a CDN or
                proxy. Source labels take priority. Vendor is the IP network owner when no vendor
                label is supplied. Private endpoints cannot be publicly geolocated.
            </p>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-[11px]">
                    <thead>
                        <tr className="text-slate-400">
                            {[
                                "Device",
                                "IP Address",
                                "Site",
                                "Category",
                                "Country",
                                "Vendor",
                                "Status",
                                "Description",
                            ].map((h) => (
                                <th key={h} className="px-2 py-3 font-medium">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const p = r.payload,
                                meta = (
                                    p.enrichment && typeof p.enrichment === "object"
                                        ? p.enrichment
                                        : {}
                                ) as Record<string, unknown>;
                            const status = text(p.status),
                                bad = /down|error|critical|degraded/i.test(status);
                            return (
                                <tr
                                    key={r.recordKey}
                                    className="border-t border-slate-100 align-top text-slate-600"
                                >
                                    {fields.map((field, i) => (
                                        <td
                                            key={field}
                                            className={`px-2 py-3 ${i === 7 ? "min-w-[270px] max-w-[420px] whitespace-normal leading-5" : "whitespace-nowrap"}`}
                                        >
                                            {i === 6 ? (
                                                <span
                                                    className={`inline-block rounded px-2 py-1 text-[10px] font-semibold ${bad ? "bg-rose-50 text-rose-700" : status === "Healthy" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}`}
                                                >
                                                    {status || "Unknown"}
                                                </span>
                                            ) : (
                                                text(p[field]) || "Not reported"
                                            )}
                                            {i === 7 && (
                                                <>
                                                    {text(p.operationalError) && (
                                                        <p className="mt-2 break-words text-rose-600">
                                                            Source error: {text(p.operationalError)}
                                                        </p>
                                                    )}
                                                    <details className="mt-2 text-[10px] text-slate-400">
                                                        <summary className="cursor-pointer">
                                                            {text(meta.descriptionSource) ===
                                                            "OpenAI"
                                                                ? "AI description · "
                                                                : ""}
                                                            {text(meta.state) ||
                                                                "Awaiting enrichment"}{" "}
                                                            · Sources & freshness
                                                        </summary>
                                                        <div className="mt-1 space-y-1">
                                                            <p>
                                                                IP checked:{" "}
                                                                {text(meta.checkedAt) ||
                                                                    "Not yet checked"}
                                                            </p>
                                                            <p>
                                                                Geography:{" "}
                                                                {text(meta.geographySource) ||
                                                                    "Source labels"}
                                                            </p>
                                                            <p>
                                                                Location checked:{" "}
                                                                {text(meta.geoCheckedAt) ||
                                                                    "Not available"}
                                                            </p>
                                                            <p>
                                                                Site:{" "}
                                                                {text(meta.siteSource) ||
                                                                    "Source labels"}
                                                            </p>
                                                            <p>
                                                                Vendor:{" "}
                                                                {text(meta.vendorSource) ||
                                                                    "Source labels"}
                                                            </p>
                                                            {Boolean(meta.aiGeneratedAt) && (
                                                                <p>
                                                                    AI generated:{" "}
                                                                    {text(meta.aiGeneratedAt)} ·{" "}
                                                                    {text(meta.model)}
                                                                </p>
                                                            )}
                                                            {Boolean(meta.error) && (
                                                                <p className="text-amber-700">
                                                                    {text(meta.error)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </details>
                                                </>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!rows.length && (
                    <p className="py-8 text-center text-[11px] text-slate-400">
                        No matching PostgreSQL health records.
                    </p>
                )}
            </div>
        </>
    );
}
