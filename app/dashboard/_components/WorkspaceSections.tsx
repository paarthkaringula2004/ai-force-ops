"use client";

import TokenCalculatorView from "./TokenCalculatorView";
import PaymentsView from "./PaymentsView";
import ModelUsageView from "./ModelUsageView";
import IntegrationCatalog from "./IntegrationCatalog";
import ProjectToolCatalog from "./ProjectToolCatalog";
import PlaygroundToolConnections from "./PlaygroundToolConnections";
import ToolLibraryKnowledge from "./ToolLibraryKnowledge";
import MarkdownEditor from "@/app/service-review-center/epace/markdown-editor";
import ThemedSelect from "@/components/themed-select";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
    ArrowDownToLine,
    Check,
    LoaderCircle,
    LockKeyhole,
    Plus,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    Trash2,
    Wrench,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getWorkspaceApiData } from "@/lib/workspace-api-cache";
import { ProfileImageEditor } from "./ProfileImageEditor";

type ToolRecord = {
    id: string;
    name: string;
    purpose: string;
    method: string;
    endpointUrl: string;
    summary: string | null;
    operations: string[] | null;
    modelId?: string;
    analyzedAt?: string | null;
};
const shellCard =
    "rounded-2xl border border-[#e7e9ef] bg-white shadow-[0_4px_18px_rgba(25,39,70,.035)]";
function PageHeading({
    eyebrow,
    title,
    description,
    action,
}: {
    eyebrow: string;
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#6255e8]">
                    {eyebrow}
                </p>
                <h1 className="mt-2 text-[25px] font-semibold tracking-[-.04em] text-[#202631]">
                    {title}
                </h1>
                <p className="mt-2 max-w-2xl text-[12px] leading-5 text-[#798394]">{description}</p>
            </div>
            {action}
        </div>
    );
}
function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
    return (
        <p
            role={error ? "alert" : "status"}
            className={`mb-4 rounded-xl border px-3.5 py-3 text-[11px] leading-5 ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
            {children}
        </p>
    );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[#475164]">{label}</span>
            {children}
        </label>
    );
}
const inputClass =
    "h-10 w-full rounded-lg border border-[#dfe2e9] bg-white px-3 text-[12px] text-[#374151] outline-none focus:border-[#a9a2f2] focus:ring-3 focus:ring-[#6255e8]/10";
const buttonPrimary =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#6255e8] px-4 text-[11px] font-semibold text-white transition hover:bg-[#5146d2] disabled:cursor-not-allowed disabled:opacity-50";

function ToolLibraryView() {
    const [editing, setEditing] = useState<string | null>(null);
    const cachedTools = getWorkspaceApiData<{ tools?: ToolRecord[] }>("/api/tools");
    const [tools, setTools] = useState<ToolRecord[]>(() => cachedTools?.tools ?? []);
    const [loading, setLoading] = useState(() => !cachedTools);
    const [adding, setAdding] = useState(false);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [form, setForm] = useState({ name: "", purpose: "", method: "GET", endpointUrl: "" });
    async function load() {
        try {
            const r = await fetch("/api/tools");
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setTools(d.tools ?? []);
            setError("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load tools.");
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/tools", { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                return data;
            })
            .then((data) => {
                setTools(data.tools ?? []);
                setError("");
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted)
                    setError(error instanceof Error ? error.message : "Could not load tools.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        const refreshLibrary = (event: Event) => {
            if ((event as CustomEvent<{ section: string }>).detail?.section === "Tool Library") void load();
        };
        window.addEventListener("workspace-library-updated", refreshLibrary);
        return () => {
            controller.abort();
            window.removeEventListener("workspace-library-updated", refreshLibrary);
        };
    }, []);
    async function addTool(event: FormEvent) {
        event.preventDefault();
        setAdding(true);
        setError("");
        setNotice("");
        try {
            const r = await fetch(editing ? `/api/tools/${editing}` : "/api/tools", {
                method: editing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setEditing(null);
            setForm({ name: "", purpose: "", method: "GET", endpointUrl: "" });
            const analysis = await fetch(`/api/tools/${d.tool.id}/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const analysisData = await analysis.json();
            setNotice(
                analysis.ok
                    ? "Tool saved and its knowledge summary was generated."
                    : `Tool saved. Knowledge analysis is pending: ${analysisData.error ?? "could not analyze this tool"}`,
            );
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save tool.");
        } finally {
            setAdding(false);
        }
    }
    async function removeTool(id: string) {
        if (!window.confirm("Remove this tool and its knowledge summary?")) return;
        const r = await fetch(`/api/tools/${id}`, { method: "DELETE" });
        const d = r.status === 204 ? {} : await r.json();
        if (!r.ok) setError(d.error || "Could not remove tool.");
        else {
            setTools((items) => items.filter((item) => item.id !== id));
            await load();
        }
    }
    async function analyzeTool(id: string) {
        setAnalyzing(id);
        setError("");
        try {
            const r = await fetch(`/api/tools/${id}/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setNotice(d.boundary);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Analysis failed.");
        } finally {
            setAnalyzing(null);
        }
    }
    return (
        <div className="mx-auto w-full max-w-[1200px] p-5 sm:p-8">
            <PageHeading
                eyebrow="Connections"
                title="Tool Library"
                description="Describe the HTTPS tools your workflows may use. Connect tools using + Tools in the agent builder. Play can call approved HTTPS endpoints; write requests require an exact preview and confirmation."
                action={
                    <span className="rounded-full border border-[#e6e8ee] bg-[#fafbfc] px-3 py-1.5 text-[10px] text-[#6d7787]">
                        {tools.length} tools
                    </span>
                }
            />
            {error && <Notice error>{error}</Notice>}
            {notice && <Notice>{notice}</Notice>}
            <PlaygroundToolConnections />
            <IntegrationCatalog />
            <ProjectToolCatalog />
            <h2 className="mb-4 mt-8 text-sm font-semibold tracking-wide text-[#6550ed]">
                CUSTOM TOOLS
            </h2>
            <div className="grid gap-5 xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
                <form onSubmit={addTool} className={`${shellCard} h-fit p-5`}>
                    <div className="mb-4 flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-[#f0eeff] text-[#6255e8]">
                            <Plus className="size-4" />
                        </span>
                        <div>
                            <h2 className="text-[13px] font-semibold text-[#283144]">
                                {editing ? "Edit tool" : "Add a tool"}
                            </h2>
                            <p className="mt-0.5 text-[10px] text-[#8992a2]">
                                Start with its purpose and endpoint.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <Field label="Tool name">
                            <input
                                required
                                maxLength={100}
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
                                placeholder="Incident lookup"
                                className={inputClass}
                            />
                        </Field>
                        <Field label="What should it do?">
                            <textarea
                                required
                                maxLength={4000}
                                rows={4}
                                value={form.purpose}
                                onChange={(e) =>
                                    setForm({ ...form, purpose: e.currentTarget.value })
                                }
                                placeholder="Describe its inputs, expected result, and when an agent should use it."
                                className="w-full resize-y rounded-lg border border-[#dfe2e9] px-3 py-2.5 text-[12px] leading-5 text-[#374151] outline-none focus:border-[#a9a2f2] focus:ring-3 focus:ring-[#6255e8]/10"
                            />
                        </Field>
                        <div className="grid grid-cols-[105px_1fr] gap-3">
                            <Field label="Method">
                                <ThemedSelect
                                    value={form.method}
                                    onChange={(e) =>
                                        setForm({ ...form, method: e.currentTarget.value })
                                    }
                                    className={inputClass}
                                >
                                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                                        <option key={method}>{method}</option>
                                    ))}
                                </ThemedSelect>
                            </Field>
                            <Field label="HTTPS endpoint">
                                <input
                                    required
                                    type="url"
                                    value={form.endpointUrl}
                                    onChange={(e) =>
                                        setForm({ ...form, endpointUrl: e.currentTarget.value })
                                    }
                                    placeholder="https://api.example.com/v1/incidents"
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <p className="-mt-2 text-[10px] leading-4 text-[#8b94a3]">
                            Do not put API keys or credentials in the URL. Connect it through +
                            Tools and configure its encrypted key on the tool node. Use path inputs
                            like {"{owner}"} and {"{repo}"}.
                        </p>
                        <button type="submit" disabled={adding} className={buttonPrimary}>
                            {adding ? (
                                <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                                <Plus className="size-4" />
                            )}
                            {editing ? "Update tool" : "Save tool"}
                        </button>
                        {editing && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditing(null);
                                    setForm({
                                        name: "",
                                        purpose: "",
                                        method: "GET",
                                        endpointUrl: "",
                                    });
                                }}
                                className="ml-3 text-xs text-[#6550ed]"
                            >
                                Cancel edit
                            </button>
                        )}
                    </div>
                </form>
                <section className="space-y-3">
                    {loading ? (
                        <div
                            className={`${shellCard} flex items-center justify-center gap-2 p-12 text-[11px] text-[#8992a2]`}
                        >
                            <LoaderCircle className="size-4 animate-spin" />
                            Loading Tool Library
                        </div>
                    ) : tools.length === 0 ? (
                        <div className={`${shellCard} p-8 text-center`}>
                            <Wrench className="mx-auto size-7 text-[#938ae9]" />
                            <h2 className="mt-3 text-[14px] font-semibold text-[#303846]">
                                Your Tool Library is ready
                            </h2>
                            <p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-[#818b9b]">
                                Create your first tool on the left. Its description can then be
                                turned into a Knowledge Management entry.
                            </p>
                        </div>
                    ) : (
                        tools.map((tool) => (
                            <article key={tool.id} className={`${shellCard} p-4 sm:p-5`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f7ff] text-[#2780a8]">
                                            <Wrench className="size-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-[13px] font-semibold text-[#293245]">
                                                    {tool.name}
                                                </h2>
                                                <span className="rounded-md bg-[#f3f4f7] px-2 py-0.5 text-[9px] font-semibold text-[#657083]">
                                                    {tool.method}
                                                </span>
                                            </div>
                                            <p className="mt-1 max-w-xl break-all text-[10px] text-[#7c8797]">
                                                {tool.endpointUrl}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditing(tool.id);
                                                setForm({
                                                    name: tool.name,
                                                    purpose: tool.purpose,
                                                    method: tool.method,
                                                    endpointUrl: tool.endpointUrl,
                                                });
                                            }}
                                            className="rounded-lg border border-purple-100 px-3 text-xs font-semibold text-[#6550ed]"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => void analyzeTool(tool.id)}
                                            disabled={analyzing === tool.id}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e4eb] px-2.5 text-[10px] font-semibold text-[#554bd1] hover:bg-[#f8f7ff] disabled:opacity-50"
                                        >
                                            {analyzing === tool.id ? (
                                                <LoaderCircle className="size-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="size-3.5" />
                                            )}
                                            Analyze
                                        </button>
                                        <button
                                            aria-label={`Remove ${tool.name}`}
                                            onClick={() => void removeTool(tool.id)}
                                            className="flex size-8 items-center justify-center rounded-lg text-[#969eaa] hover:bg-rose-50 hover:text-rose-600"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-3 text-[11px] leading-5 text-[#596477]">
                                    {tool.purpose}
                                </p>
                                {tool.summary && (
                                    <div className="mt-3 rounded-xl border border-[#eceafa] bg-[#faf9ff] p-3.5">
                                        <p className="text-[10px] font-semibold text-[#5048bd]">
                                            Knowledge summary · {tool.modelId}
                                        </p>
                                        <p className="mt-1.5 text-[11px] leading-5 text-[#596477]">
                                            {tool.summary}
                                        </p>
                                        {tool.operations?.length ? (
                                            <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] leading-4 text-[#707a8b]">
                                                {tool.operations.map((operation, index) => (
                                                    <li key={`${index}-${operation}`}>
                                                        {operation}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                    </div>
                                )}
                            </article>
                        ))
                    )}
                </section>
            </div>
            <p className="mt-5 text-[10px] leading-5 text-[#8b94a3]">
                AI analysis receives the tool name, declared purpose, and HTTP method only. It does
                not inspect or call the endpoint, and no API secret is sent to the model.
            </p>
        </div>
    );
}

function KnowledgeView() {
    const cachedTools = getWorkspaceApiData<{ tools?: ToolRecord[] }>("/api/tools");
    const [tools, setTools] = useState<ToolRecord[]>(() => cachedTools?.tools ?? []);
    const [loading, setLoading] = useState(() => !cachedTools);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    async function load() {
        const r = await fetch("/api/tools");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setTools(d.tools ?? []);
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/tools", { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                return data;
            })
            .then((data) => setTools(data.tools ?? []))
            .catch((error: unknown) => {
                if (!controller.signal.aborted)
                    setError(error instanceof Error ? error.message : "Could not load tools.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        const refreshLibrary = (event: Event) => {
            const section = (event as CustomEvent<{ section: string }>).detail?.section;
            if (section === "Tool Library" || section === "Knowledge Management") void load();
        };
        window.addEventListener("workspace-library-updated", refreshLibrary);
        return () => {
            controller.abort();
            window.removeEventListener("workspace-library-updated", refreshLibrary);
        };
    }, []);
    async function analyze(id: string) {
        setBusy(id);
        setError("");
        try {
            const r = await fetch(`/api/tools/${id}/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Analysis failed.");
        } finally {
            setBusy(null);
        }
    }
    const documented = tools.filter((tool) => tool.summary).length;
    return (
        <div className="mx-auto w-full max-w-[1120px] p-5 sm:p-8">
            <PageHeading
                eyebrow="Operational knowledge"
                title="Knowledge Management"
                description="Integrations, project tools and custom tools from your Tool Library, with current configuration status and documented capabilities."
                action={
                    <span className="rounded-full border border-[#e6e8ee] bg-[#fafbfc] px-3 py-1.5 text-[10px] text-[#6d7787]">
                        {documented} of {tools.length} custom tools documented
                    </span>
                }
            />
            {error && <Notice error>{error}</Notice>}
            <ToolLibraryKnowledge />
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-[#6550ed]">
                CUSTOM TOOLS
            </h2>
            {loading ? (
                <div
                    className={`${shellCard} flex items-center justify-center gap-2 p-12 text-[11px] text-[#8992a2]`}
                >
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading Knowledge Management
                </div>
            ) : !tools.length ? (
                <div className={`${shellCard} p-9 text-center`}>
                    <Sparkles className="mx-auto size-7 text-[#766ae3]" />
                    <h2 className="mt-3 text-[14px] font-semibold text-[#303846]">
                        Knowledge starts with your tools
                    </h2>
                    <p className="mx-auto mt-2 max-w-lg text-[11px] leading-5 text-[#818b9b]">
                        Add tools in Tool Library, then ask AIForce.Ops to summarize their stated
                        purpose and operations here.
                    </p>
                </div>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {tools.map((tool) => (
                        <article key={tool.id} className={`${shellCard} p-5`}>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#7c73da]">
                                        {tool.method} · {tool.name}
                                    </p>
                                    <h2 className="mt-2 text-[13px] font-semibold text-[#303846]">
                                        {tool.summary
                                            ? "Tool purpose and operations"
                                            : "Summary not generated"}
                                    </h2>
                                </div>
                                <button
                                    onClick={() => void analyze(tool.id)}
                                    disabled={busy === tool.id}
                                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#e2e4eb] px-2.5 text-[10px] font-semibold text-[#554bd1] hover:bg-[#f8f7ff] disabled:opacity-50"
                                >
                                    {busy === tool.id ? (
                                        <LoaderCircle className="size-3.5 animate-spin" />
                                    ) : (
                                        <RefreshCw className="size-3.5" />
                                    )}
                                    {tool.summary ? "Refresh" : "Analyze"}
                                </button>
                            </div>
                            <p className="mt-3 text-[11px] leading-5 text-[#647083]">
                                {tool.summary || tool.purpose}
                            </p>
                            {tool.operations?.map((operation, index) => (
                                <div
                                    key={`${tool.id}-${index}`}
                                    className="mt-2 flex gap-2 text-[10px] leading-4 text-[#778293]"
                                >
                                    <span className="mt-1 size-1 shrink-0 rounded-full bg-[#8479e5]" />
                                    {operation}
                                </div>
                            ))}
                            <p className="mt-4 border-t border-[#f0f1f4] pt-3 text-[9px] leading-4 text-[#9aa1ac]">
                                Based on configured metadata. Live endpoint behavior has not been
                                verified.
                            </p>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

function UsageView() {
    return <ModelUsageView />;
}

function GeneralInstructionsView() {
    const [instructions, setInstructions] = useState("");
    const [savedInstructions, setSavedInstructions] = useState("");
    const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/playground/state", { cache: "no-store", signal: controller.signal })
            .then(async (r) => {
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                setSettings(d.settings);
                setInstructions(d.settings.instructions || "");
                setSavedInstructions(d.settings.instructions || "");
            })
            .catch((e) => {
                if (!controller.signal.aborted)
                    setError(e instanceof Error ? e.message : "Could not load instructions.");
            });
        return () => controller.abort();
    }, []);
    async function save() {
        if (!settings) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const r = await fetch("/api/playground/state", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...settings, instructions }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setSavedInstructions(instructions);
            setNotice("Instructions saved to your Playground configuration.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mx-auto w-full max-w-[900px] p-5 sm:p-8">
            <PageHeading
                eyebrow="Agent behavior"
                title="General Instructions"
                description="Reusable system guidance applied by the Playground. Agent-specific instructions remain on each agent’s configuration."
            />
            {error && <Notice error>{error}</Notice>}
            {notice && <Notice>{notice}</Notice>}
            <section className={`${shellCard} p-5`}>
                <div>
                    <p className="mb-3 text-xs font-semibold text-slate-700">
                        Workspace instructions
                    </p>
                    <MarkdownEditor
                        documentMode
                        value={instructions}
                        onChange={(value) => {
                            setInstructions(value);
                            setNotice("");
                        }}
                        onSend={() => {
                            if (settings && !busy) void save();
                        }}
                        ariaLabel="Workspace instructions"
                        placeholder="Describe how your service operations assistant should respond, what context it has, and where it should be careful."
                    />
                </div>
                <div className="mt-3 flex items-center justify-between">
                    <span className="text-[9px] text-[#9299a6]">
                        {instructions.length.toLocaleString()} / 12,000 characters{" "}
                        {instructions === savedInstructions ? "· Up to date" : "· Unsaved changes"}
                    </span>
                    {instructions !== savedInstructions && (
                        <button
                            disabled={!settings || busy}
                            onClick={() => void save()}
                            className={buttonPrimary}
                        >
                            {busy ? (
                                <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                                <Check className="size-4" />
                            )}
                            Save instructions
                        </button>
                    )}
                </div>
            </section>
        </div>
    );
}

function ModelsView() {
    const [models, setModels] = useState<
        {
            id: string;
            usable: boolean;
            status: string;
            reason: string;
            rates?: { input: number; output: number } | null;
        }[]
    >([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    async function load() {
        try {
            const r = await fetch("/api/playground/models");
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setModels(d.entries ?? []);
            setError("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load models.");
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/playground/models", { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                return data;
            })
            .then((data) => {
                setModels(data.entries ?? []);
                setError("");
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted)
                    setError(error instanceof Error ? error.message : "Could not load models.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        const timer = window.setInterval(() => {
            void load();
        }, 60000);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, []);
    return (
        <div className="mx-auto w-full max-w-[1000px] p-5 sm:p-8">
            <PageHeading
                eyebrow="OpenAI connection"
                title="Models"
                description="Lowest budget first, ranked by equal input/output token cost; Astra last by preference. Live OpenAI catalog, checked against official text Responses documentation. Only compatible models can be selected; listing does not guarantee generation permissions or quota."
                action={
                    <button
                        onClick={() => {
                            setLoading(true);
                            void load();
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe2e9] px-3 text-[10px] font-medium text-[#596477]"
                    >
                        <RefreshCw className="size-3.5" />
                        Refresh list
                    </button>
                }
            />
            {error && <Notice error>{error}</Notice>}
            <div className={`${shellCard} overflow-hidden`}>
                <div className="grid grid-cols-[1fr_auto] border-b border-[#eef0f3] bg-[#fafbfc] px-5 py-3 text-[9px] font-semibold uppercase tracking-wide text-[#8992a2]">
                    <span>Model ID</span>
                    <span>Availability</span>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-[11px] text-[#8992a2]">
                        Loading models from OpenAI…
                    </div>
                ) : (
                    models.map((model, index) => (
                        <div
                            key={model.id}
                            className="flex items-center justify-between border-b border-[#f1f2f5] px-5 py-3 last:border-0"
                        >
                            <span className="font-mono text-[11px] text-[#394354]">
                                {model.usable ? `${index + 1}. ` : ""}
                                {model.id}
                                {model.rates && (
                                    <span className="ml-2 font-sans text-[10px] text-slate-500">
                                        ${model.rates.input} input / ${model.rates.output} output
                                        per 1M tokens
                                    </span>
                                )}
                                <span className="mt-1 block font-sans text-[10px] text-slate-500">
                                    {model.reason}
                                </span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[9px] text-slate-600">
                                <span className="size-1.5 rounded-full bg-slate-400" />
                                {model.status}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function SettingsView() {
    const { data } = authClient.useSession();
    const sessionImage = typeof data?.user?.image === "string" ? data.user.image : "";
    const [tab, setTab] = useState("profile");
    const [name, setName] = useState("");
    const [nameEdited, setNameEdited] = useState(false);
    const [phone, setPhone] = useState("");
    const [birthday, setBirthday] = useState("");
    const [profileImage, setProfileImage] = useState("");
    const [bannerImage, setBannerImage] = useState("");
    const [savedAppearance, setSavedAppearance] = useState({
        phone: "",
        birthday: "",
        profileImage: "",
        bannerImage: "",
    });
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/account/profile", { signal: controller.signal })
            .then(async (r) => {
                const d = await r.json();
                if (r.ok) {
                    const nextPhone = d.profile.phone ?? "";
                    const nextBirthday =
                        typeof d.profile.birthday === "string"
                            ? d.profile.birthday.slice(0, 10)
                            : "";
                    const nextPhoto = d.profile.profileImage || sessionImage;
                    const nextBanner = d.profile.bannerImage ?? "";
                    setPhone(nextPhone);
                    setBirthday(nextBirthday);
                    setProfileImage(nextPhoto);
                    setBannerImage(nextBanner);
                    setSavedAppearance({
                        phone: nextPhone,
                        birthday: nextBirthday,
                        profileImage: nextPhoto,
                        bannerImage: nextBanner,
                    });
                } else {
                    setSavedAppearance({
                        phone: "",
                        birthday: "",
                        profileImage: sessionImage,
                        bannerImage: "",
                    });
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setProfileImage(sessionImage);
                    setSavedAppearance({
                        phone: "",
                        birthday: "",
                        profileImage: sessionImage,
                        bannerImage: "",
                    });
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setProfileLoaded(true);
            });
        return () => controller.abort();
    }, [sessionImage]);
    useEffect(() => {
        if (tab !== "security") return;
        fetch("/api/account/sessions")
            .then(async (r) => {
                const d = await r.json();
                if (r.ok) setSessions(d.sessions ?? []);
                else setError(d.error);
            })
            .catch((e) => setError(e.message));
    }, [tab]);
    const displayName = nameEdited ? name.trim() : (data?.user?.name?.trim() ?? "");
    const profileChanged =
        profileLoaded &&
        (displayName !== (data?.user?.name?.trim() ?? "") ||
            phone !== savedAppearance.phone ||
            birthday !== savedAppearance.birthday ||
            (profileImage || sessionImage) !== savedAppearance.profileImage ||
            bannerImage !== savedAppearance.bannerImage);
    async function saveProfile(event: FormEvent) {
        event.preventDefault();
        if (!profileChanged) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const savedPhoto = profileImage.startsWith("data:image/jpeg;base64,")
                ? profileImage
                : "";
            const r = await fetch("/api/account/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: displayName,
                    image: profileImage || sessionImage || null,
                    phone,
                    birthday,
                    profileImage: savedPhoto,
                    bannerImage,
                }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            let sessionSyncFailed = false;
            try {
                const authResult = await authClient.updateUser({
                    name: displayName,
                    image: profileImage || sessionImage || null,
                });
                sessionSyncFailed = Boolean(authResult.error);
            } catch {
                sessionSyncFailed = true;
            }
            setName(displayName);
            setNameEdited(false);
            setSavedAppearance({ phone, birthday, profileImage, bannerImage });
            setNotice(
                sessionSyncFailed
                    ? "Your profile was saved. Refresh the page if the account menu still shows the previous photo or name."
                    : "Your profile and appearance have been saved.",
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update profile.");
        } finally {
            setBusy(false);
        }
    }
    async function changePassword(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await authClient.changePassword({
                currentPassword,
                newPassword,
                revokeOtherSessions: false,
            });
            if (result.error) throw new Error(result.error.message);
            setCurrentPassword("");
            setNewPassword("");
            setNotice("Password updated successfully.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not change password.");
        } finally {
            setBusy(false);
        }
    }
    async function revokeSession(id: string) {
        const r = await fetch("/api/account/sessions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        const d = await r.json();
        if (!r.ok) setError(d.error);
        else setSessions((items) => items.filter((session) => session.id !== id));
    }
    async function exportData() {
        const r = await fetch("/api/account/export");
        const d = await r.json();
        if (!r.ok) {
            setError(d.error);
            return;
        }
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "aiforce-ops-account-export.json";
        link.click();
        URL.revokeObjectURL(link.href);
    }
    async function clearHistory() {
        if (!window.confirm("Clear all Playground conversation messages from your account?"))
            return;
        const r = await fetch("/api/playground/state", { method: "DELETE" });
        const d = await r.json();
        if (!r.ok) setError(d.error);
        else setNotice("Playground conversation history cleared.");
    }
    const tabs = [
        { id: "profile", label: "Personal details" },
        { id: "security", label: "Password & security" },
        { id: "privacy", label: "Information & privacy" },
    ];
    return (
        <div style={{ zoom: 1.25 }} className="min-h-full w-full bg-[#f7f8fc] p-5 sm:px-8 sm:py-7">
            {error && <Notice error>{error}</Notice>}
            {notice && <Notice>{notice}</Notice>}
            <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
                <nav aria-label="Account settings" className={`${shellCard} h-fit p-2`}>
                    {tabs.map((item) => (
                        <button
                            key={item.id}
                            aria-current={tab === item.id ? "page" : undefined}
                            onClick={() => {
                                setTab(item.id);
                                setError("");
                                setNotice("");
                            }}
                            className={`w-full rounded-lg px-3 py-2.5 text-left text-[10px] font-medium ${tab === item.id ? "bg-[#efedff] text-[#554bd1]" : "text-[#667184] hover:bg-[#f7f8fa]"}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
                <section
                    className={
                        tab === "profile"
                            ? "min-w-0 space-y-5"
                            : `${shellCard} min-h-[420px] p-5 sm:p-6`
                    }
                >
                    {tab === "profile" ? (
                        <div className={`${shellCard} overflow-hidden`}>
                            <ProfileImageEditor
                                name={nameEdited ? name : (data?.user?.name ?? "")}
                                photo={profileImage}
                                banner={bannerImage}
                                onPhotoChange={setProfileImage}
                                onBannerChange={setBannerImage}
                            />
                            <div className="px-4 pb-5 pt-1 sm:px-5 sm:pb-6">
                                <form
                                    aria-label="Personal details"
                                    onSubmit={saveProfile}
                                    className="grid gap-4 sm:grid-cols-2"
                                >
                                    <Field label="Display name">
                                        <input
                                            required
                                            value={nameEdited ? name : (data?.user?.name ?? "")}
                                            onChange={(e) => {
                                                setNameEdited(true);
                                                setName(e.currentTarget.value);
                                            }}
                                            className={inputClass}
                                        />
                                    </Field>
                                    <Field label="Account email">
                                        <input
                                            readOnly
                                            value={data?.user?.email ?? ""}
                                            className={`${inputClass} bg-[#fafbfc] text-[#8992a2]`}
                                        />
                                    </Field>
                                    <div className="sm:col-span-2">
                                        <Field label="Your user_id">
                                            <div className="relative">
                                                <input
                                                    readOnly
                                                    value={data?.user?.id ?? ""}
                                                    className={`${inputClass} pr-16 font-mono`}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={!data?.user?.id}
                                                    onClick={async () => {
                                                        try {
                                                            if (data?.user?.id) {
                                                                await navigator.clipboard.writeText(
                                                                    data.user.id,
                                                                );
                                                                setNotice(
                                                                    "Your user_id was copied.",
                                                                );
                                                            }
                                                        } catch {
                                                            setError(
                                                                "Select the user_id and copy it manually.",
                                                            );
                                                        }
                                                    }}
                                                    className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-semibold text-[#6255e8] disabled:opacity-50"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </Field>
                                    </div>
                                    <Field label="Mobile phone">
                                        <input
                                            type="tel"
                                            maxLength={40}
                                            value={phone}
                                            onChange={(e) => setPhone(e.currentTarget.value)}
                                            placeholder="Add phone number"
                                            className={inputClass}
                                        />
                                    </Field>
                                    <Field label="Birthday">
                                        <input
                                            type="date"
                                            value={birthday}
                                            onChange={(e) => setBirthday(e.currentTarget.value)}
                                            className={inputClass}
                                        />
                                    </Field>
                                    {profileChanged && (
                                        <button
                                            disabled={busy}
                                            className={`${buttonPrimary} sm:col-span-2 sm:w-fit`}
                                        >
                                            {busy ? (
                                                <LoaderCircle className="size-4 animate-spin" />
                                            ) : (
                                                <Check className="size-4" />
                                            )}
                                            Save profile
                                        </button>
                                    )}
                                </form>
                            </div>
                        </div>
                    ) : tab === "security" ? (
                        <>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="size-4 text-[#6255e8]" />
                                <h2 className="text-[14px] font-semibold text-[#283144]">
                                    Password & security
                                </h2>
                            </div>
                            <p className="mt-1 text-[10px] text-[#8992a2]">
                                Change your password and review active login locations.
                            </p>
                            <form
                                onSubmit={changePassword}
                                className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2"
                            >
                                <Field label="Current password">
                                    <input
                                        required
                                        type="password"
                                        autoComplete="current-password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.currentTarget.value)}
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="New password">
                                    <input
                                        required
                                        minLength={8}
                                        type="password"
                                        autoComplete="new-password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.currentTarget.value)}
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="sm:col-span-2">
                                    <button disabled={busy} className={buttonPrimary}>
                                        <LockKeyhole className="size-4" />
                                        Update password
                                    </button>
                                </div>
                            </form>
                            <div className="mt-7 border-t border-[#eef0f3] pt-5">
                                <h3 className="text-[12px] font-semibold text-[#303846]">
                                    Active sessions
                                </h3>
                                <p className="mt-1 text-[10px] text-[#8a93a2]">
                                    Revoke a session to require sign-in again on that device.
                                </p>
                                <div className="mt-3 space-y-2">
                                    {sessions.length ? (
                                        sessions.map((session) => (
                                            <div
                                                key={String(session.id)}
                                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eceef2] p-3"
                                            >
                                                <div>
                                                    <p className="text-[10px] font-medium text-[#4b5668]">
                                                        {String(
                                                            session.userAgent || "Browser session",
                                                        )}
                                                    </p>
                                                    <p className="mt-1 text-[9px] text-[#8c95a3]">
                                                        {String(
                                                            session.ipAddress ||
                                                                "Location unavailable",
                                                        )}{" "}
                                                        ·{" "}
                                                        {new Date(
                                                            String(session.updatedAt),
                                                        ).toLocaleString()}
                                                    </p>
                                                </div>
                                                {session.isCurrent ? (
                                                    <span className="rounded-full bg-[#f0eeff] px-2.5 py-1 text-[9px] font-medium text-[#554bd1]">
                                                        Current session
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() =>
                                                            void revokeSession(String(session.id))
                                                        }
                                                        className="rounded-lg border border-[#e7e8ee] px-2.5 py-1.5 text-[9px] font-medium text-[#647083] hover:border-rose-200 hover:text-rose-700"
                                                    >
                                                        Revoke
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="rounded-xl bg-[#fafbfc] p-3 text-[10px] text-[#8992a2]">
                                            No active sessions found.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/70 p-3.5 text-[10px] leading-5 text-amber-900/75">
                                Two-factor authentication and login alert delivery are not
                                configured in this application yet.
                            </div>
                        </>
                    ) : (
                        <>
                            <h2 className="text-[14px] font-semibold text-[#283144]">
                                Your information & privacy
                            </h2>
                            <p className="mt-1 text-[10px] text-[#8992a2]">
                                Download or clear workspace information associated with your
                                account.
                            </p>
                            <div className="mt-5 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eceef2] p-4">
                                    <div>
                                        <p className="text-[11px] font-medium text-[#424c5d]">
                                            Download a copy of your data
                                        </p>
                                        <p className="mt-1 text-[9px] text-[#8b94a3]">
                                            Agents, workflows, tools, Playground messages, and usage
                                            history.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => void exportData()}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e4eb] px-3 text-[9px] font-semibold text-[#535d6e]"
                                    >
                                        <ArrowDownToLine className="size-3.5" />
                                        Export JSON
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eceef2] p-4">
                                    <div>
                                        <p className="text-[11px] font-medium text-[#424c5d]">
                                            Playground history
                                        </p>
                                        <p className="mt-1 text-[9px] text-[#8b94a3]">
                                            Remove your saved Playground messages.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => void clearHistory()}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-[9px] font-semibold text-rose-700"
                                    >
                                        <Trash2 className="size-3.5" />
                                        Clear history
                                    </button>
                                </div>
                                <div className="rounded-xl border border-[#eceef2] bg-[#fafbfc] p-4">
                                    <p className="text-[11px] font-medium text-[#424c5d]">
                                        Ad preferences
                                    </p>
                                    <p className="mt-1 text-[9px] leading-5 text-[#8b94a3]">
                                        AIForce.Ops does not currently use advertising or
                                        ad-targeting profiles, so there are no ad topics to manage.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

export function WorkspaceSection({ section }: { section: string }) {
    switch (section) {
        case "Tool Library":
            return <ToolLibraryView />;
        case "Knowledge Management":
            return <KnowledgeView />;
        case "Settings":
            return <SettingsView />;
        case "Usage":
            return <UsageView />;
        case "Token Calculator":
            return <TokenCalculatorView />;
        case "Payments":
            return <PaymentsView />;
        case "General Instructions":
            return <GeneralInstructionsView />;
        case "Models":
            return <ModelsView />;
        default:
            return (
                <div className="mx-auto max-w-2xl p-10 text-center">
                    <h1 className="text-lg font-semibold text-[#303846]">{section}</h1>
                    <p className="mt-2 text-[11px] text-[#818b9b]">
                        This workspace section is not available.
                    </p>
                </div>
            );
    }
}
