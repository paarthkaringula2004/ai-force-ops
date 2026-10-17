"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, LoaderCircle, RefreshCw } from "lucide-react";
import ThemedSelect from "@/components/themed-select";
type Tool = {
    id: string;
    name: string;
    purpose: string;
    provider: string;
    operation: string;
    defaults: Record<string, unknown>;
};
type Provider = {
    id: string;
    name: string;
    configured: boolean;
    operations: { id: string; label: string; write: boolean; example: Record<string, unknown> }[];
};
type Builtin = {
    id: string;
    name: string;
    purpose: string;
    capabilityPurpose: string;
    enabled: boolean;
    defaultRequest: string;
};
type Data = {
    builtin: Builtin[];
    removedBuiltin: Builtin[];
    tools: Tool[];
    canManage: boolean;
    integrations: Provider[];
    removed: { id: string; name: string }[];
};
const control =
    "mt-2 h-10 w-full rounded-xl border border-[#dfe2ee] bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#a9a2f2] focus:ring-2 focus:ring-[#6255e8]/10";
const button =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#6255e8] px-4 text-xs font-semibold text-white disabled:opacity-50";
export default function ProjectToolCatalog() {
    const [data, setData] = useState<Data | null>(null),
        [error, setError] = useState(""),
        [open, setOpen] = useState(false),
        [busy, setBusy] = useState(false),
        [form, setForm] = useState({
            id: "",
            name: "",
            purpose: "",
            provider: "",
            operation: "",
            defaults: "{}",
        });
    const retryAfter = useRef(0);
    const dialog = useRef<HTMLDialogElement>(null),
        builtinDialog = useRef<HTMLDialogElement>(null),
        deleteDialog = useRef<HTMLDialogElement>(null);
    const [builtin, setBuiltin] = useState<Builtin | null>(null),
        [removing, setRemoving] = useState<{ id: string; name: string; builtin: boolean } | null>(
            null,
        ),
        [notice, setNotice] = useState("");
    async function load(signal?: AbortSignal) {
        const r = await fetch("/api/tools/project", { cache: "no-store", signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
    }
    useEffect(() => {
        const c = new AbortController();
        let pending = false;
        const refresh = () => {
            if (pending || Date.now() < retryAfter.current) return;
            pending = true;
            fetch("/api/tools/project", { cache: "no-store", signal: c.signal })
                .then(async (r) => {
                    const d = await r.json();
                    if (!r.ok) {
                        if (r.status === 429)
                            retryAfter.current =
                                Date.now() +
                                Math.max(60, Number(r.headers.get("Retry-After")) || 60) * 1000;
                        throw new Error(d.error);
                    }
                    if (!c.signal.aborted) {
                        setData(d);
                        setError("");
                    }
                })
                .catch((e) => {
                    if (!c.signal.aborted) setError(e.message);
                })
                .finally(() => {
                    pending = false;
                });
        };
        refresh();
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") refresh();
        }, 15000);
        window.addEventListener("focus", refresh);
        window.addEventListener("project-tools-changed", refresh);
        window.addEventListener("integration-catalog-changed", refresh);
        return () => {
            c.abort();
            clearInterval(timer);
            window.removeEventListener("focus", refresh);
            window.removeEventListener("project-tools-changed", refresh);
            window.removeEventListener("integration-catalog-changed", refresh);
        };
    }, []);
    useEffect(() => {
        if (open) dialog.current?.showModal();
        else dialog.current?.close();
    }, [open]);
    useEffect(() => {
        if (builtin) builtinDialog.current?.showModal();
        else builtinDialog.current?.close();
    }, [builtin]);
    useEffect(() => {
        if (removing) deleteDialog.current?.showModal();
        else deleteDialog.current?.close();
    }, [removing]);
    async function change(action: string, id?: string) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const payload =
                action === "save_builtin"
                    ? { action, ...builtin }
                    : action === "save"
                      ? { action, ...form, defaults: JSON.parse(form.defaults) }
                      : { action, id };
            const r = await fetch("/api/tools/project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            await load();
            setOpen(false);
            setBuiltin(null);
            setRemoving(null);
            setNotice(
                action.includes("restore")
                    ? "Tool restored. Built-in tools remain disabled until you enable them."
                    : action.includes("delete")
                      ? "Tool deleted. Existing agent connections will report it unavailable. You can restore it below."
                      : "Project tool configuration saved.",
            );
            window.dispatchEvent(new Event("project-tools-changed"));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save project tool.");
        } finally {
            setBusy(false);
        }
    }
    const provider = data?.integrations.find((p) => p.id === form.provider);
    return (
        <section className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-sm font-semibold text-[#6550ed]">Project tools</h2>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
                        Connect workspace capabilities and your own API operations to agents through
                        + Tools. Custom tools use their integration’s credentials and connection
                        state.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        aria-label="Refresh project tools"
                        onClick={() => void load().catch((e) => setError(e.message))}
                        className="rounded-xl border border-purple-100 bg-white p-3 text-[#6550ed]"
                    >
                        <RefreshCw className="size-4" />
                    </button>
                    {data?.canManage && (
                        <button
                            className={button}
                            onClick={() => {
                                setForm({
                                    id: "",
                                    name: "",
                                    purpose: "",
                                    provider: "",
                                    operation: "",
                                    defaults: "{}",
                                });
                                setError("");
                                setOpen(true);
                            }}
                        >
                            <Plus className="size-4" />
                            Add project tool
                        </button>
                    )}
                </div>
            </div>
            {notice && (
                <p
                    role="status"
                    className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"
                >
                    {notice}
                </p>
            )}
            {error && !open && !builtin && !removing && (
                <p role="alert" className="mt-3 text-xs text-rose-600">
                    {error}
                </p>
            )}
            {!data && !error && (
                <p className="mt-4 text-xs text-slate-500">Loading project tools…</p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data?.builtin.map((t) => (
                    <article
                        key={t.id}
                        className="flex flex-col rounded-xl border border-purple-100 bg-white p-4"
                    >
                        <h3 className="text-xs font-semibold">{t.name}</h3>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{t.purpose}</p>
                        <div className="mt-auto pt-4">
                            <span
                                className={`inline-block rounded-full px-2 py-1 text-[10px] ${t.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                            >
                                {t.enabled ? "Enabled" : "Disabled"}
                            </span>
                            <p className="mt-2 text-[10px] text-slate-400">
                                Workspace capability · Access checked when used
                            </p>
                            {data.canManage && (
                                <div className="mt-3 flex items-center justify-between border-t border-purple-50 pt-3">
                                    <button
                                        disabled={busy}
                                        onClick={() => {
                                            setError("");
                                            setBuiltin({ ...t });
                                        }}
                                        aria-label={`Configure project tool ${t.name}`}
                                        className="inline-flex items-center gap-2 text-xs font-semibold text-[#6255e8]"
                                    >
                                        <Pencil className="size-3.5" />
                                        Configure
                                    </button>
                                    <button
                                        disabled={busy}
                                        onClick={() => {
                                            setError("");
                                            setRemoving({ id: t.id, name: t.name, builtin: true });
                                        }}
                                        aria-label={`Delete project tool ${t.name}`}
                                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </article>
                ))}
                {data?.tools.map((t) => {
                    const integration = data.integrations.find((p) => p.id === t.provider);
                    const operation = integration?.operations.find((o) => o.id === t.operation);
                    const configured = integration?.configured && !!operation;
                    return (
                        <article
                            key={t.id}
                            className="rounded-xl border border-purple-100 bg-white p-4"
                        >
                            <div className="flex items-start gap-2">
                                <h3 className="min-w-0 flex-1 text-xs font-semibold">{t.name}</h3>
                                <button
                                    disabled={busy}
                                    aria-label={`Edit project tool ${t.name}`}
                                    onClick={() => {
                                        setForm({
                                            ...t,
                                            defaults: JSON.stringify(t.defaults, null, 2),
                                        });
                                        setError("");
                                        setOpen(true);
                                    }}
                                    className="text-slate-400 hover:text-[#6550ed]"
                                >
                                    <Pencil className="size-3.5" />
                                </button>
                                <button
                                    disabled={busy}
                                    aria-label={`Delete project tool ${t.name}`}
                                    onClick={() => {
                                        setError("");
                                        setRemoving({ id: t.id, name: t.name, builtin: false });
                                    }}
                                    className="text-slate-400 hover:text-rose-600"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-500">{t.purpose}</p>
                            <p className="mt-3 text-[10px] text-[#8073bf]">
                                {integration?.name || "Integration unavailable"} ·{" "}
                                {operation?.label || t.operation}
                            </p>
                            <span
                                className={`mt-3 inline-block rounded-full px-2 py-1 text-[10px] ${configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                            >
                                {configured ? "Configured" : "Not configured"}
                            </span>
                            {operation?.write && (
                                <p className="mt-2 text-[10px] text-amber-700">
                                    External changes require approval.
                                </p>
                            )}
                        </article>
                    );
                })}
            </div>
            {!!(data?.removed.length || data?.removedBuiltin?.length) && (
                <details className="mt-4 text-xs text-slate-500">
                    <summary className="cursor-pointer">
                        Deleted project tools (
                        {data.removed.length + (data.removedBuiltin?.length || 0)})
                    </summary>
                    {[
                        ...data.removed.map((t) => ({ ...t, builtin: false })),
                        ...(data.removedBuiltin || []).map((t) => ({ ...t, builtin: true })),
                    ].map((t) => (
                        <div key={t.id} className="mt-2 flex items-center justify-between">
                            <span>{t.name}</span>
                            <button
                                disabled={busy}
                                onClick={() =>
                                    void change(t.builtin ? "restore_builtin" : "restore", t.id)
                                }
                                className="font-semibold text-[#6550ed]"
                            >
                                Restore
                            </button>
                        </div>
                    ))}
                </details>
            )}
            <dialog
                ref={builtinDialog}
                onCancel={(e) => {
                    if (busy) e.preventDefault();
                    else setBuiltin(null);
                }}
                onClose={() => setBuiltin(null)}
                aria-label="Configure workspace capability"
                className="fixed inset-0 m-auto max-h-[90dvh] w-[min(640px,94vw)] overflow-y-auto rounded-2xl border border-[#e5e2f0] bg-white p-6 text-slate-700 shadow-2xl backdrop:bg-slate-900/35"
            >
                {builtin && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void change("save_builtin");
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Configure {builtin.name}</h2>
                            <button
                                type="button"
                                disabled={busy}
                                aria-label="Close capability configuration"
                                onClick={() => setBuiltin(null)}
                                className="p-2"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                            Settings apply to your workspace tools and existing agent connections.
                            Source permissions and read-only limits are enforced by the server.
                        </p>
                        {error && (
                            <p role="alert" className="mt-3 text-xs text-rose-600">
                                {error}
                            </p>
                        )}
                        <fieldset disabled={busy} className="mt-5 space-y-4">
                            <label className="block text-xs">
                                Display name
                                <input
                                    required
                                    maxLength={100}
                                    autoComplete="off"
                                    className={control}
                                    value={builtin.name}
                                    onChange={(e) =>
                                        setBuiltin({ ...builtin, name: e.target.value })
                                    }
                                />
                            </label>
                            <label className="block text-xs">
                                Description
                                <textarea
                                    maxLength={2000}
                                    className="mt-2 min-h-24 w-full rounded-xl border border-[#dfe2ee] p-3 text-xs leading-5"
                                    value={builtin.purpose}
                                    onChange={(e) =>
                                        setBuiltin({ ...builtin, purpose: e.target.value })
                                    }
                                />
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={builtin.enabled}
                                    onChange={(e) =>
                                        setBuiltin({ ...builtin, enabled: e.target.checked })
                                    }
                                />
                                Enable this project tool
                            </label>
                            {["meeting_rooms", "chart_visualizer", "incidents"].includes(
                                builtin.id,
                            ) && (
                                <label className="block text-xs">
                                    Default request (optional)
                                    <textarea
                                        className="mt-2 min-h-24 w-full rounded-xl border border-[#dfe2ee] bg-[#fafbff] p-3 font-mono text-xs leading-5"
                                        value={builtin.defaultRequest}
                                        onChange={(e) =>
                                            setBuiltin({
                                                ...builtin,
                                                defaultRequest: e.target.value,
                                            })
                                        }
                                    />
                                    <span className="mt-1 block leading-5 text-slate-500">
                                        {builtin.id === "chart_visualizer"
                                            ? 'Example: {"source":"requests"}. Supported sources: requests, incidents, scan_reports.'
                                            : builtin.id === "meeting_rooms"
                                              ? "Optional JSON with attendees, or start/end ISO dates with timezones. Empty lists configured rooms."
                                              : "An INC number, or empty for the incident list."}{" "}
                                        Used only when the agent supplies no request.
                                    </span>
                                </label>
                            )}
                            <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 text-xs leading-5 text-slate-500">
                                <strong className="text-slate-700">
                                    Source and capability limits
                                </strong>
                                <p className="mt-1">{builtin.capabilityPurpose}</p>
                                {builtin.id === "meeting_rooms" && (
                                    <Link
                                        href="/dashboard/meeting-rooms"
                                        className="mt-2 inline-block text-[#6255e8]"
                                    >
                                        Manage meeting rooms →
                                    </Link>
                                )}
                                {["profile", "requests"].includes(builtin.id) && (
                                    <p className="mt-2">
                                        Reads the signed-in person’s authorized workspace records.
                                        No external API credentials are needed.
                                    </p>
                                )}
                            </div>
                            <button className={button} disabled={busy}>
                                {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}Save
                                configuration
                            </button>
                        </fieldset>
                    </form>
                )}
            </dialog>
            <dialog
                ref={deleteDialog}
                onCancel={(e) => {
                    if (busy) e.preventDefault();
                    else setRemoving(null);
                }}
                onClose={() => setRemoving(null)}
                aria-label="Delete project tool"
                className="fixed inset-0 m-auto w-[min(480px,94vw)] rounded-2xl border border-[#e5e2f0] bg-white p-6 text-slate-700 shadow-2xl backdrop:bg-slate-900/35"
            >
                <h2 className="text-lg font-semibold">Delete {removing?.name}?</h2>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                    This removes the tool from your picker and blocks existing agent connections to
                    it. Source records and agents are preserved. Restore it from Deleted project
                    tools.
                </p>
                {error && (
                    <p role="alert" className="mt-3 text-xs text-rose-600">
                        {error}
                    </p>
                )}
                <div className="mt-5 flex gap-3">
                    <button
                        disabled={busy}
                        onClick={() =>
                            removing &&
                            void change(removing.builtin ? "delete_builtin" : "delete", removing.id)
                        }
                        className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white"
                    >
                        Delete tool
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => setRemoving(null)}
                        className="rounded-xl border border-[#dfe2ee] px-4 py-2.5 text-xs font-semibold"
                    >
                        Cancel
                    </button>
                </div>
            </dialog>
            <dialog
                ref={dialog}
                onCancel={() => setOpen(false)}
                onClose={() => setOpen(false)}
                aria-label={form.id ? "Edit project tool" : "Add project tool"}
                className="fixed inset-0 m-auto max-h-[90dvh] w-[min(640px,94vw)] overflow-y-auto rounded-2xl border border-[#e5e2f0] bg-white p-6 text-slate-700 shadow-2xl backdrop:bg-slate-900/35"
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void change("save");
                    }}
                >
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            {form.id ? "Edit project tool" : "Add project tool"}
                        </h2>
                        <button
                            type="button"
                            aria-label="Close project tool form"
                            onClick={() => setOpen(false)}
                            className="p-2"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                        Choose an integration and a named operation. Its saved credentials are used
                        automatically; no keys belong in these inputs.
                    </p>
                    {error && (
                        <p role="alert" className="mt-3 text-xs text-rose-600">
                            {error}
                        </p>
                    )}
                    <div className="mt-5 space-y-4">
                        <label className="block text-xs">
                            Tool name
                            <input
                                required
                                maxLength={100}
                                autoComplete="off"
                                className={control}
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </label>
                        <label className="block text-xs">
                            Purpose
                            <textarea
                                maxLength={2000}
                                className="mt-2 min-h-20 w-full rounded-xl border border-[#dfe2ee] p-3 text-xs"
                                value={form.purpose}
                                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                            />
                        </label>
                        <label className="block text-xs">
                            Integration
                            <ThemedSelect
                                portalContainer={dialog}
                                value={form.provider}
                                className={control}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        provider: e.target.value,
                                        operation: "",
                                        defaults: "{}",
                                    })
                                }
                            >
                                <option value="">Select an integration</option>
                                {data?.integrations.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                        {p.configured ? " · Configured" : " · Not configured"}
                                    </option>
                                ))}
                            </ThemedSelect>
                        </label>
                        <label className="block text-xs">
                            Operation
                            <ThemedSelect
                                portalContainer={dialog}
                                value={form.operation}
                                className={control}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        operation: e.target.value,
                                        defaults: JSON.stringify(
                                            provider?.operations.find(
                                                (o) => o.id === e.target.value,
                                            )?.example || {},
                                            null,
                                            2,
                                        ),
                                    })
                                }
                            >
                                <option value="">Select an operation</option>
                                {provider?.operations.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.label}
                                        {o.write ? " · approval required" : " · read"}
                                    </option>
                                ))}
                            </ThemedSelect>
                        </label>
                        {provider && !provider.operations.length && (
                            <p className="text-xs leading-5 text-amber-700">
                                Set up this integration’s API operation mappings first. Then refresh
                                Project tools.
                            </p>
                        )}
                        <label className="block text-xs">
                            Default operation inputs (JSON)
                            <textarea
                                value={form.defaults}
                                onChange={(e) => setForm({ ...form, defaults: e.target.value })}
                                className="mt-2 min-h-28 w-full rounded-xl border border-[#dfe2ee] bg-[#fafbff] p-3 font-mono text-xs leading-5"
                            />
                        </label>
                        <button
                            disabled={busy || !form.provider || !form.operation}
                            className={button}
                        >
                            {busy ? (
                                <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                                <Plus className="size-4" />
                            )}
                            {form.id ? "Save changes" : "Create project tool"}
                        </button>
                    </div>
                </form>
            </dialog>
        </section>
    );
}
