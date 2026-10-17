"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Settings2, Trash2, RefreshCw, X, Wrench } from "lucide-react";
import ThemedSelect from "@/components/themed-select";
type Source = {
    kind: string;
    id: string;
    name: string;
    purpose: string;
    available: boolean;
    status: string;
};
type Connection = {
    id: string;
    source_kind: string;
    reference_id: string;
    name: string;
    purpose: string;
    enabled: boolean;
    shared_roles?: string[];
    shared?: boolean;
    source?: Source;
};
type Data = { sources: Source[]; connections: Connection[]; canShare: boolean };
const input =
    "mt-2 w-full rounded-xl border border-[#dfe2ee] bg-white px-3 py-3 text-sm outline-none focus:border-[#8475ee]";
const primary =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#6255e8] px-4 text-xs font-semibold text-white disabled:opacity-50";
export default function PlaygroundToolConnections() {
    const [data, setData] = useState<Data | null>(null),
        [error, setError] = useState(""),
        [notice, setNotice] = useState(""),
        [busy, setBusy] = useState(false),
        [open, setOpen] = useState(false),
        [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        sourceKind: "department",
        referenceId: "department_search",
        name: "Department Search",
        purpose:
            "Use when someone asks whether a company department exists or wants to list departments. Search the exact supplied name; never create or change a department.",
        enabled: true,
        sharedRoles: [] as string[],
    });
    const dialog = useRef<HTMLDialogElement>(null);
    async function refresh(signal?: AbortSignal) {
        const r = await fetch("/api/tools/playground", { cache: "no-store", signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
        setError("");
    }
    useEffect(() => {
        const c = new AbortController();
        const load = () => {
            fetch("/api/tools/playground", { cache: "no-store", signal: c.signal })
                .then(async (r) => {
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    return d;
                })
                .then((d) => {
                    if (!c.signal.aborted) {
                        setData(d);
                        setError("");
                    }
                })
                .catch((e) => {
                    if (!c.signal.aborted) setError(e.message);
                });
        };
        load();
        window.addEventListener("focus", load);
        window.addEventListener("project-tools-changed", load);
        window.addEventListener("integration-catalog-changed", load);
        return () => {
            c.abort();
            window.removeEventListener("focus", load);
            window.removeEventListener("project-tools-changed", load);
            window.removeEventListener("integration-catalog-changed", load);
        };
    }, []);
    useEffect(() => {
        if (open) dialog.current?.showModal();
        else dialog.current?.close();
    }, [open]);
    async function change(payload: Record<string, unknown>) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const r = await fetch("/api/tools/playground", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            await refresh();
            setOpen(false);
            setNotice(
                payload.action === "remove"
                    ? "Disconnected from Playground. The source tool is still saved."
                    : "Saved. Playground will use this connection on your next relevant question.",
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save the connection.");
        } finally {
            setBusy(false);
        }
    }
    function add() {
        setEditing(false);
        setForm({
            sourceKind: "department",
            referenceId: "department_search",
            name: "Department Search",
            purpose:
                "Use when someone asks whether a company department exists or wants to list departments. Search the exact supplied name; never create or change a department.",
            enabled: true,
            sharedRoles: [] as string[],
        });
        setError("");
        setOpen(true);
        void refresh().catch((e) => setError(e.message));
    }
    const shareable =
        form.sourceKind === "department" ||
        form.sourceKind === "tool" ||
        (form.sourceKind === "builtin" &&
            ["profile", "requests", "meeting_rooms"].includes(form.referenceId));
    const source = data?.sources.find(
        (s) => s.kind === form.sourceKind && s.id === form.referenceId,
    );
    return (
        <section
            id="playground-tools"
            className="mb-6 scroll-mt-6 rounded-2xl border border-[#ddd8fc] bg-[#faf9ff] p-5 sm:p-6"
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6550ed]">
                        Connected answers
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">Playground tools</h2>
                    <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
                        Connect a search or read tool, then ask naturally in Playground. The AI
                        chooses a relevant connection, reads its current result and explains the
                        answer.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        aria-label="Refresh Playground tools"
                        className="rounded-xl border border-purple-100 bg-white p-3 text-[#6255e8]"
                        onClick={() => void refresh().catch((e) => setError(e.message))}
                    >
                        <RefreshCw className="size-4" />
                    </button>
                    <button className={primary} onClick={add}>
                        <Plus className="size-4" />
                        Connect tool
                    </button>
                </div>
            </div>
            {notice && (
                <p
                    role="status"
                    className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"
                >
                    {notice}
                </p>
            )}
            {error && !open && (
                <p role="alert" className="mt-4 text-xs text-rose-700">
                    {error}
                </p>
            )}
            {!data && !error && (
                <p className="mt-4 text-xs text-slate-500">Loading your connections…</p>
            )}
            {data && !data.connections.length && (
                <div className="mt-5 rounded-xl border border-dashed border-purple-200 bg-white p-5">
                    <Wrench className="size-5 text-[#6255e8]" />
                    <h3 className="mt-2 text-sm font-semibold">Start with Department Search</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        Connect the built-in company catalog search, or create a GET tool or read
                        operation below and connect it here. Example: “Is SDE a department in our
                        organization?”
                    </p>
                    <button className="mt-3 text-xs font-semibold text-[#6255e8]" onClick={add}>
                        Set up a connection →
                    </button>
                </div>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {data?.connections.map((c) => {
                    const s = c.shared
                        ? c.source
                        : c.source ||
                          data.sources.find(
                              (s) => s.kind === c.source_kind && s.id === c.reference_id,
                          );
                    return (
                        <article
                            key={c.id}
                            className="rounded-xl border border-purple-100 bg-white p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <h3 className="text-sm font-semibold">{c.name}</h3>
                                <span
                                    className={`rounded-full px-2 py-1 text-[10px] ${c.enabled && s?.available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                                >
                                    {!s
                                        ? "Source unavailable"
                                        : !c.enabled
                                          ? "Disabled"
                                          : s.available
                                            ? "Connected"
                                            : "NULL · configure source"}
                                </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-500">{c.purpose}</p>
                            <p className="mt-3 text-[10px] text-slate-400">
                                Source: {s?.name || "Deleted or inaccessible"} · Read only ·{" "}
                                {c.shared ? "Shared by Admin" : "Your Playground"}
                            </p>
                            {!c.shared && !!c.shared_roles?.length && (
                                <p className="mt-2 text-[10px] text-[#6255e8]">
                                    Shared with:{" "}
                                    {c.shared_roles
                                        .map((r) => r[0].toUpperCase() + r.slice(1))
                                        .join(", ")}
                                </p>
                            )}
                            {c.shared ? (
                                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                                    Available in your Playground. Managed by Admin.
                                </p>
                            ) : (
                                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                                    <button
                                        disabled={busy}
                                        className="inline-flex items-center gap-2 text-xs font-semibold text-[#6255e8]"
                                        onClick={() => {
                                            setEditing(true);
                                            setForm({
                                                sourceKind: c.source_kind,
                                                referenceId: c.reference_id,
                                                name: c.name,
                                                purpose: c.purpose,
                                                enabled: c.enabled,
                                                sharedRoles: c.shared_roles || [],
                                            });
                                            setError("");
                                            setOpen(true);
                                        }}
                                    >
                                        <Settings2 className="size-3.5" />
                                        Configure
                                    </button>
                                    <button
                                        disabled={busy}
                                        aria-label={"Disconnect " + c.name}
                                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                        onClick={() => void change({ action: "remove", id: c.id })}
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
            <p className="mt-4 text-[10px] leading-5 text-slate-400">
                Connections use your permissions and selected Playground model. Tool inputs and
                results are sent to that model. API credentials stay in integration settings.
                Changes and external writes use their existing review and confirmation screens.
            </p>
            <dialog
                ref={dialog}
                aria-label="Configure Playground tool"
                onCancel={() => setOpen(false)}
                onClose={() => setOpen(false)}
                className="fixed inset-0 m-auto max-h-[90dvh] w-[min(600px,94vw)] overflow-y-auto rounded-2xl border border-purple-100 bg-white p-6 text-slate-700 shadow-2xl backdrop:bg-slate-900/35"
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void change({ action: "save", ...form });
                    }}
                >
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Connect a Playground tool</h2>
                        <button
                            type="button"
                            aria-label="Close Playground tool form"
                            onClick={() => setOpen(false)}
                        >
                            <X className="size-5" />
                        </button>
                    </div>
                    {error && (
                        <p role="alert" className="mt-3 text-xs text-rose-700">
                            {error}
                        </p>
                    )}
                    <label className="mt-5 block text-xs">
                        Source tool
                        <ThemedSelect
                            disabled={editing || busy}
                            portalContainer={dialog}
                            className={input}
                            value={form.sourceKind + ":" + form.referenceId}
                            onChange={(e) => {
                                const s = data?.sources.find(
                                    (s) => s.kind + ":" + s.id === e.target.value,
                                );
                                if (s)
                                    setForm({
                                        ...form,
                                        sourceKind: s.kind,
                                        referenceId: s.id,
                                        name: s.name,
                                        purpose: s.purpose,
                                        sharedRoles: [],
                                    });
                            }}
                        >
                            {data?.sources.map((s) => (
                                <option key={s.kind + ":" + s.id} value={s.kind + ":" + s.id}>
                                    {s.name} · {s.kind}
                                    {s.available ? "" : " · setup required"}
                                </option>
                            ))}
                        </ThemedSelect>
                    </label>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                        {source?.status || "Choose a current source. Deleted tools cannot run."}
                    </p>
                    <label className="mt-4 block text-xs">
                        Playground tool name
                        <input
                            required
                            className={input}
                            maxLength={100}
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                    </label>
                    <label className="mt-4 block text-xs">
                        When should Playground use this tool?
                        <textarea
                            required
                            className={input + " min-h-28"}
                            maxLength={2000}
                            value={form.purpose}
                            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                        />
                    </label>
                    <p className="mt-2 text-[10px] leading-5 text-slate-400">
                        Describe the questions it answers and the inputs it needs. These
                        instructions help the AI choose the source; they do not grant additional
                        permissions.
                    </p>
                    <label className="mt-4 flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={form.enabled}
                            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                        />
                        Enable this Playground connection
                    </label>
                    {data?.canShare && (
                        <fieldset className="mt-5 rounded-xl border border-purple-100 p-4">
                            <legend className="px-1 text-xs font-semibold">
                                Share this tool with
                            </legend>
                            <div className="flex flex-wrap gap-5">
                                {["manager", "employee", "user"].map((role) => (
                                    <label key={role} className="flex items-center gap-2 text-xs">
                                        <input
                                            type="checkbox"
                                            disabled={!shareable || busy}
                                            checked={form.sharedRoles.includes(role)}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    sharedRoles: e.target.checked
                                                        ? [...form.sharedRoles, role]
                                                        : form.sharedRoles.filter(
                                                              (r) => r !== role,
                                                          ),
                                                })
                                            }
                                        />
                                        {role[0].toUpperCase() + role.slice(1)}
                                    </label>
                                ))}
                            </div>
                            <p className="mt-3 text-[10px] leading-5 text-slate-500">
                                {shareable
                                    ? "Selected roles can use this connection in Playground after you save. Unchecking a role or disabling the connection revokes shared access. Personal workspace tools read each person’s own records."
                                    : "This source requires Admin permissions. Share Department Search, personal workspace reads, or a GET API tool with other roles."}
                            </p>
                        </fieldset>
                    )}
                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            type="button"
                            className="rounded-xl border px-4 py-2 text-xs"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </button>
                        <button disabled={busy || !source} className={primary}>
                            {busy ? "Saving…" : "Save connection"}
                        </button>
                    </div>
                </form>
            </dialog>
        </section>
    );
}
