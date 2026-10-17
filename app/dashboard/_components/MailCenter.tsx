"use client";
import { useEffect, useState } from "react";
import { Mail, Send, RefreshCw, Eye, CheckCircle2 } from "lucide-react";
import type { OfferDetails } from "@/lib/mail-templates";
type Entry = {
    id: string;
    kind: string;
    recipient: string;
    subject: string;
    status: string;
    created_at: string;
    last_error: string | null;
};
type State = {
    configured: boolean;
    sender: string;
    workerCheckedAt: string | null;
    messages: Entry[];
};
const empty: OfferDetails = {
    name: "",
    role: "",
    department: "",
    startDate: "",
    location: "",
    compensation: "",
    terms: "",
};
const field =
    "mt-1.5 w-full rounded-xl border border-[#e2e5ef] bg-[#fbfbfe] px-3 py-2.5 text-sm outline-none focus:border-[#aaa2ef] focus:ring-3 focus:ring-[#6255e8]/10";
const button =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#e2defa] px-4 py-2.5 text-xs font-semibold text-[#6255e8] transition hover:bg-[#f5f2ff] disabled:opacity-50";
export default function MailCenter() {
    const [data, setData] = useState<State | null>(null),
        [details, setDetails] = useState(empty),
        [to, setTo] = useState(""),
        [preview, setPreview] = useState<{ id: string; html: string } | null>(null),
        [busy, setBusy] = useState(false),
        [confirmed, setConfirmed] = useState(false),
        [notice, setNotice] = useState(""),
        [error, setError] = useState("");
    async function load() {
        try {
            const r = await fetch("/api/workspace/admin/mail", { cache: "no-store" }),
                b = await r.json();
            if (!r.ok) throw new Error(b.error);
            setData(b);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load email status.");
        }
    }
    useEffect(() => {
        let active = true;
        fetch("/api/workspace/admin/mail", { cache: "no-store" })
            .then(async (r) => {
                const b = await r.json();
                if (!r.ok) throw new Error(b.error);
                if (active) setData(b);
            })
            .catch((e) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
        };
    }, []);
    async function action(body: Record<string, unknown>) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const r = await fetch("/api/workspace/admin/mail", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }),
                b = await r.json();
            if (!r.ok) throw new Error(b.error);
            if (b.preview) {
                setPreview({ id: b.id, html: b.preview.html });
                setConfirmed(false);
            } else {
                setNotice(
                    b.queued
                        ? "Email queued. Refresh delivery activity to check SMTP acceptance."
                        : "This request was already recorded.",
                );
                if (body.action === "confirm-offer") {
                    setPreview(null);
                    setDetails(empty);
                    setTo("");
                }
            }
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Mail request failed.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <section
            id="mail-center"
            aria-label="Mail Center"
            className="overflow-hidden rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_4px_24px_rgba(31,41,55,.025)]"
        >
            <header className="flex flex-wrap items-start gap-3 border-b border-[#edeef5] bg-gradient-to-r from-[#faf9ff] to-white p-6">
                <span className="rounded-xl border border-[#e5e1ff] bg-white p-2.5 text-[#6255e8]">
                    <Mail className="size-5" />
                </span>
                <div>
                    <h2 className="font-semibold text-[#283144]">Mail Center</h2>
                    <p className="mt-1 text-xs text-slate-500">
                        Branded transactional emails and delivery activity.
                    </p>
                </div>
                <button type="button" onClick={() => void load()} className={`${button} ml-auto`}>
                    <RefreshCw className="size-3.5" />
                    Refresh
                </button>
            </header>
            <div className="space-y-5 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8e5fa] bg-[#faf9ff] p-4">
                    <div>
                        <p className="text-xs font-medium">
                            {data?.configured
                                ? "SMTP configured"
                                : "Mail configuration unavailable"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            {data?.sender || "Sender not configured"} · Gmail SMTP over TLS
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            Worker last checked:{" "}
                            {data?.workerCheckedAt
                                ? new Date(data.workerCheckedAt).toLocaleString("en-IN", {
                                      timeZone: "Asia/Kolkata",
                                  }) + " IST"
                                : "Not yet reported"}
                        </p>
                    </div>
                    <button
                        disabled={busy || !data?.configured}
                        className={button}
                        onClick={() =>
                            void action({ action: "test", requestId: crypto.randomUUID() })
                        }
                    >
                        <Send className="size-3.5" />
                        Send test to my email
                    </button>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                    Verification codes are sent at signup. Welcome emails follow successful
                    verification. Leave submissions notify the employee and reviewer; saved
                    decisions notify the employee. Offer letters require your review and
                    confirmation.
                </p>
                {error && (
                    <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                        {error}
                    </p>
                )}
                {notice && (
                    <p
                        role="status"
                        className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700"
                    >
                        {notice}
                    </p>
                )}
                <details className="rounded-xl border border-[#e5e7f0] p-4">
                    <summary className="cursor-pointer text-sm font-semibold">
                        Compose an offer letter
                    </summary>
                    {preview ? (
                        <div className="mt-5 space-y-4">
                            <p className="text-xs text-slate-500">
                                Review the exact email below. Preview expires after 10 minutes.
                                Changes require a new preview.
                            </p>
                            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium">
                                Recipient: {to}
                            </p>
                            <iframe
                                title="Offer letter email preview"
                                sandbox=""
                                srcDoc={preview.html}
                                className="h-[540px] w-full rounded-xl border border-[#e5e7f0]"
                            />
                            <label className="flex items-start gap-2 text-xs leading-5">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                    className="mt-1"
                                />
                                I reviewed the recipient, compensation and terms and authorize
                                sending this employment offer.
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    disabled={busy || !confirmed}
                                    className={`${button} bg-[#6255e8] text-white hover:bg-[#5346d2]`}
                                    onClick={() =>
                                        void action({
                                            action: "confirm-offer",
                                            id: preview.id,
                                            confirm: true,
                                        })
                                    }
                                >
                                    <CheckCircle2 className="size-4" />
                                    Confirm and queue offer
                                </button>
                                <button
                                    disabled={busy}
                                    className={button}
                                    onClick={() => setPreview(null)}
                                >
                                    Edit details
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form
                            className="mt-5"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void action({ action: "preview-offer", to, details });
                            }}
                        >
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="text-xs">
                                    Recipient email
                                    <input
                                        required
                                        type="email"
                                        className={field}
                                        maxLength={254}
                                        value={to}
                                        onChange={(e) => setTo(e.target.value)}
                                    />
                                </label>
                                {(
                                    [
                                        "name",
                                        "role",
                                        "department",
                                        "startDate",
                                        "location",
                                        "compensation",
                                    ] as const
                                ).map((key) => (
                                    <label key={key} className="text-xs">
                                        {
                                            {
                                                name: "Candidate name",
                                                role: "Position",
                                                department: "Department",
                                                startDate: "Start date",
                                                location: "Work location",
                                                compensation: "Approved compensation",
                                            }[key]
                                        }
                                        <input
                                            required
                                            type={key === "startDate" ? "date" : "text"}
                                            maxLength={300}
                                            className={field}
                                            value={details[key]}
                                            onChange={(e) =>
                                                setDetails({ ...details, [key]: e.target.value })
                                            }
                                        />
                                    </label>
                                ))}
                            </div>
                            <label className="mt-4 block text-xs">
                                Approved offer terms and next steps
                                <textarea
                                    required
                                    maxLength={6000}
                                    rows={5}
                                    className={field}
                                    value={details.terms}
                                    onChange={(e) =>
                                        setDetails({ ...details, terms: e.target.value })
                                    }
                                    placeholder="Enter the approved terms, conditions and acceptance instructions."
                                />
                            </label>
                            <button
                                disabled={busy || !data?.configured}
                                className={`${button} mt-4`}
                            >
                                <Eye className="size-4" />
                                Preview offer letter
                            </button>
                        </form>
                    )}
                </details>
                <div className="overflow-hidden rounded-xl border border-[#e5e7f0]">
                    <div className="border-b border-[#e5e7f0] bg-slate-50 px-4 py-3 text-xs font-semibold">
                        Recent delivery activity
                    </div>
                    <div className="max-h-80 overflow-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="text-slate-500">
                                <tr>
                                    {["Message", "Recipient", "Status", "Recorded · IST"].map(
                                        (h) => (
                                            <th className="px-4 py-3 font-medium" key={h}>
                                                {h}
                                            </th>
                                        ),
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data?.messages.map((item) => (
                                    <tr className="border-t border-slate-100" key={item.id}>
                                        <td className="px-4 py-3">{item.subject}</td>
                                        <td className="px-4 py-3">{item.recipient}</td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`whitespace-nowrap rounded-full px-2.5 py-1 ${item.status === "sent" ? "bg-emerald-50 text-emerald-700" : item.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-indigo-50 text-indigo-700"}`}
                                            >
                                                {item.status === "sent"
                                                    ? "SMTP accepted"
                                                    : item.status}
                                            </span>
                                            {item.last_error && (
                                                <p className="mt-2 text-[10px] text-rose-700">
                                                    {item.last_error}
                                                </p>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                            {new Date(item.created_at).toLocaleString("en-IN", {
                                                timeZone: "Asia/Kolkata",
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {data && !data.messages.length && (
                            <p className="p-5 text-xs text-slate-500">No messages recorded yet.</p>
                        )}
                    </div>
                </div>
                <p className="text-[11px] leading-5 text-slate-500">
                    SMTP acceptance confirms handoff to Gmail. Inbox placement and later bounces
                    require recipient/provider confirmation.
                </p>
            </div>
        </section>
    );
}
