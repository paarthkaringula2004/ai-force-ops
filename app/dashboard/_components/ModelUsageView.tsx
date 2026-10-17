"use client";

import { useEffect, useState } from "react";
import ThemedSelect from "@/components/themed-select";

type Billing = {
    estimatedCostUsd: number | null;
    chargeUsd: number | null;
    chargeInr: number | null;
    tickets: number | null;
    costBasis: string;
    historicalEstimate?: boolean;
    pricingRecovered?: boolean;
};
type Data = {
    totals: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        requests: number;
        localReplies: number;
        estimatedCostUsd: number;
        chargeUsd: number;
        chargeInr: number;
        tickets: number;
        unpricedRequests: number;
        fxUnavailableRequests: number;
        estimatedRequests: number;
    };
    events: {
        id: string;
        source: string;
        modelId: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cachedInputTokens: number | null;
        cacheWriteTokens: number | null;
        usageKind: string;
        createdAt: string;
        billing: Billing;
    }[];
    pricing: { fx: { usdInr: number; date: string; source: string } | null; verifiedAt: string };
};
function amount(value: number | null | undefined, prefix = "") {
    if (value == null) return "Price unavailable";
    if (value > 0 && value < 0.00000001) return `<${prefix}0.00000001`;
    return (
        prefix +
        new Intl.NumberFormat("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
        }).format(value)
    );
}
const fmt = (value: number) => new Intl.NumberFormat("en-IN").format(value);

export default function ModelUsageView() {
    const [days, setDays] = useState("30"),
        [data, setData] = useState<Data | null>(null),
        [error, setError] = useState(""),
        [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        const refresh = () =>
            fetch(`/api/usage?days=${days}`, { cache: "no-store", signal: controller.signal })
                .then(async (response) => {
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    setData(result);
                    setUpdatedAt(new Date());
                    setError("");
                })
                .catch((error) => {
                    if (!controller.signal.aborted)
                        setError(error instanceof Error ? error.message : "Could not load usage.");
                });
        void refresh();
        const timer = window.setInterval(() => void refresh(), 5000);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [days]);
    const t = data?.totals;
    const metrics = [
        { label: "Model tokens", value: t && fmt(t.totalTokens) },
        { label: "Input tokens", value: t && fmt(t.inputTokens) },
        { label: "Output tokens", value: t && fmt(t.outputTokens) },
        { label: "Model requests", value: t && fmt(t.requests) },
        { label: "Local replies", value: t && fmt(t.localReplies) },
        { label: "Usage charge (USD) · estimated", value: t && amount(t.chargeUsd, "$") },
        {
            label: "Usage charge in INR · estimated",
            value:
                t &&
                (t.fxUnavailableRequests ? "Conversion unavailable" : amount(t.chargeInr, "₹")),
        },
        {
            label: "Equivalent tickets · estimated",
            value: t && (t.fxUnavailableRequests ? "Conversion unavailable" : amount(t.tickets)),
        },
    ];
    return (
        <div className="mx-auto w-full max-w-[1440px] p-5 text-slate-800 sm:p-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="text-[10px] uppercase tracking-widest text-indigo-600">
                        Consumption & pricing
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold">Usage</h1>
                    <p className="mt-2 text-xs text-slate-500">
                        Track model usage, estimated charges, and ticket equivalents across your
                        workspace.
                    </p>
                </div>
                <ThemedSelect
                    value={days}
                    onChange={(event) => setDays(event.currentTarget.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs"
                >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last 12 months</option>
                </ThemedSelect>
            </div>
            {error && (
                <p role="alert" className="mb-4 text-sm text-rose-700">
                    {error}
                </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                    <div
                        key={metric.label}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                        <p className="text-[11px] text-slate-500">{metric.label}</p>
                        <p className="mt-2 break-all text-xl font-semibold">
                            {metric.value ?? "—"}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">Last {days} days</p>
                    </div>
                ))}
            </div>
            {t && (
                <p className="mt-3 text-[11px] leading-6 text-slate-500">
                    {t.localReplies} local replies · {t.unpricedRequests} requests with unavailable
                    pricing · {t.estimatedRequests} requests with historical or incomplete price
                    data. Unpriced requests are excluded from cost totals; totals may be incomplete.
                </p>
            )}
            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="text-sm font-semibold">Recent model activity</h2>
                    <p className="mt-1 text-[11px] text-slate-500">
                        Your 100 latest requests. Updates every 5 seconds.
                    </p>
                </div>
                {!data ? (
                    <p className="p-8 text-center text-xs text-slate-500">Loading usage…</p>
                ) : !data.events.length ? (
                    <p className="p-8 text-center text-xs text-slate-500">
                        No tracked requests yet.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-left text-[11px]">
                            <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                    {[
                                        "Source / model",
                                        "Input",
                                        "Cached / written",
                                        "Output",
                                        "Total tokens",
                                        "Usage charge (USD)",
                                        "Tickets equivalent",
                                        "Recorded (IST)",
                                    ].map((label) => (
                                        <th key={label} className="px-4 py-3 font-medium">
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.events.map((event) => (
                                    <tr
                                        key={event.id}
                                        className="border-t border-slate-100 text-slate-600"
                                    >
                                        <td className="px-4 py-3">
                                            <span className="capitalize">
                                                {event.source.replaceAll("-", " ")}
                                            </span>
                                            <span className="mt-1 block text-slate-400">
                                                {event.usageKind === "local"
                                                    ? "Local reply · no model call"
                                                    : event.modelId}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 tabular-nums">
                                            {fmt(event.inputTokens)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums">
                                            {event.cachedInputTokens == null
                                                ? "Unknown"
                                                : fmt(event.cachedInputTokens)}{" "}
                                            /{" "}
                                            {event.cacheWriteTokens == null
                                                ? "—"
                                                : fmt(event.cacheWriteTokens)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums">
                                            {fmt(event.outputTokens)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums">
                                            {fmt(event.totalTokens)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums">
                                            {amount(event.billing.chargeUsd, "$")}
                                            {(event.billing.historicalEstimate ||
                                                event.billing.costBasis === "cache-unknown") && (
                                                <span className="mt-1 block text-[10px] text-amber-600">
                                                    Historical estimate
                                                </span>
                                            )}
                                            {event.billing.chargeUsd !== null && (
                                                <span className="mt-1 block text-slate-400">
                                                    {event.billing.chargeInr == null
                                                        ? "INR conversion unavailable"
                                                        : amount(event.billing.chargeInr, "₹")}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums">
                                            {amount(event.billing.tickets)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {new Date(event.createdAt).toLocaleString("en-IN", {
                                                timeZone: "Asia/Kolkata",
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            <p className="mt-4 text-[11px] leading-6 text-slate-500">
                Model tokens include instructions, conversation context, and generated output.
                Ticket equivalents are calculated from the estimated usage charge. Estimates are not
                invoices or payment receipts.
            </p>
            {updatedAt && (
                <p role="status" className="mt-2 text-[11px] text-slate-500">
                    Last updated{" "}
                    {updatedAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                </p>
            )}
        </div>
    );
}
