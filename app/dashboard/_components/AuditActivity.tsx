"use client";
import { useState } from "react";
import { Clock3, History, Search } from "lucide-react";

type Audit = {
    id: string;
    action: string;
    actor_name: string | null;
    target_name: string | null;
    created_at: string;
};
const labels: Record<string, string> = {
    "tickets.topped_up": "Tickets allocated",
    "member.employment_confirmed": "Employment confirmed",
    "member.updated": "Member updated",
    "request.deleted": "Request deleted",
    "request.submitted": "Request submitted",
    "request.approve": "Request approved",
    "request.reject": "Request rejected",
    "request.cancel": "Request cancelled",
    "request.fulfil": "Fulfilment recorded",
    "admin.bootstrap": "Admin initialized",
    "organization.settings": "Organization settings updated",
    "organization.vacancy": "Position updated",
};
function label(action: string) {
    return labels[action] || action.replaceAll(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase());
}
export default function AuditActivity({
    entries,
    loading,
}: {
    entries: Audit[];
    loading: boolean;
}) {
    const [search, setSearch] = useState("");
    const filtered = entries.filter((a) =>
        [label(a.action), a.action, a.actor_name, a.target_name]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
    );
    return (
        <section
            id="audit-activity"
            aria-labelledby="audit-activity-title"
            className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_4px_24px_rgba(31,41,55,.025)]"
        >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#edeef5] p-5 sm:px-6">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-[#f1eeff] text-[#6255e8]">
                        <History className="size-5" />
                    </span>
                    <div>
                        <h2
                            id="audit-activity-title"
                            className="text-base font-semibold text-[#283144]"
                        >
                            Recent audit activity
                        </h2>
                        <p className="mt-1 text-[11px] text-[#8792a4]">
                            Recorded changes to members, requests and organization settings.
                        </p>
                    </div>
                </div>
                <label className="flex w-full items-center gap-2 rounded-xl border border-[#e6e8f0] bg-[#fbfbfe] px-3 py-2.5 sm:w-60">
                    <Search className="size-4 shrink-0 text-[#9aa3b2]" />
                    <input
                        aria-label="Search audit activity"
                        placeholder="Search activity or member…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full min-w-0 bg-transparent text-xs outline-none"
                    />
                </label>
            </div>
            <div className="max-h-[480px] overflow-auto">
                <table className="w-full min-w-[650px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#f9f9fc]">
                        <tr>
                            {["Action", "Actor", "Member", "Recorded · IST"].map((name) => (
                                <th
                                    key={name}
                                    className="border-b border-[#e9ebf3] px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#8b95a6]"
                                >
                                    {name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((a) => (
                            <tr key={a.id} className="transition hover:bg-[#faf9ff]">
                                <td className="border-b border-[#f0f1f6] px-5 py-4">
                                    <span
                                        title={a.action}
                                        className="inline-flex items-center gap-2 font-medium text-[#49566c]"
                                    >
                                        <span
                                            className={
                                                "size-1.5 rounded-full " +
                                                (a.action.includes("deleted") ||
                                                a.action.includes("reject")
                                                    ? "bg-rose-400"
                                                    : a.action.includes("confirmed") ||
                                                        a.action.includes("approve")
                                                      ? "bg-emerald-400"
                                                      : "bg-[#9a8fec]")
                                            }
                                        />
                                        {label(a.action)}
                                    </span>
                                </td>
                                <td className="border-b border-[#f0f1f6] px-5 py-4 text-[#6c7890]">
                                    {a.actor_name || "System"}
                                </td>
                                <td className="border-b border-[#f0f1f6] px-5 py-4 text-[#6c7890]">
                                    {a.target_name || "—"}
                                </td>
                                <td className="whitespace-nowrap border-b border-[#f0f1f6] px-5 py-4 text-[11px] text-[#8994a6]">
                                    {new Date(a.created_at).toLocaleString("en-IN", {
                                        timeZone: "Asia/Kolkata",
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                    })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!filtered.length && (
                    <p className="px-5 py-10 text-center text-xs text-[#8792a4]">
                        {loading ? "Loading audit activity…" : "No activity matches this view."}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-2 border-t border-[#edeef5] bg-[#fcfcfe] px-5 py-3 text-[10px] text-[#929cad]">
                <Clock3 className="size-3.5" />
                Showing {filtered.length} of {entries.length} recent records · Times in IST
            </div>
        </section>
    );
}
