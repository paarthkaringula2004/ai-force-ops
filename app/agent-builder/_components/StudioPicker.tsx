"use client";
import { useEffect, useState } from "react";
import { Search, Plus, X, LoaderCircle } from "lucide-react";
import type { WorkflowNodeData } from "@/types/workflow";
import CreateAgentDialog, { type NewAgentInput } from "@/components/create-agent-dialog";
type Choice = {
    id: string;
    name: string;
    purpose: string;
    referenceKind: string;
    method?: string;
    endpointUrl?: string;
};
export default function StudioPicker({
    agentId,
    kind,
    onSelect,
    onClose,
}: {
    agentId: string;
    kind: "agents" | "tools" | "memory";
    onSelect: (data: WorkflowNodeData) => void;
    onClose: () => void;
}) {
    const [items, setItems] = useState<Choice[]>([]),
        [search, setSearch] = useState(""),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(true);
    const [creating, setCreating] = useState(false);
    async function create(input: NewAgentInput) {
        const response = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not create the agent.");
        setCreating(false);
        onSelect({
            label: result.agent.name,
            referenceKind: "agent",
            referenceId: result.agent.id,
            purpose: result.agent.purpose,
        });
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/agents/studio-options?kind=${kind}`, { signal: controller.signal })
            .then(async (response) => {
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                setItems(result.items);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
            });
        return () => controller.abort();
    }, [kind]);
    return (
        <aside
            role="dialog"
            aria-label={`Choose ${kind}`}
            className="absolute right-5 top-5 z-30 flex max-h-[calc(100%-40px)] w-[370px] max-w-[calc(100%-40px)] flex-col overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-xl"
        >
            <header className="flex items-center justify-between border-b border-purple-100 p-5">
                <div>
                    <h2 className="font-semibold text-slate-800">
                        Choose {kind === "memory" ? "knowledge" : kind}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        Connect an existing item to your agent.
                    </p>
                </div>
                <button aria-label="Close selection" onClick={onClose}>
                    <X className="size-5" />
                </button>
            </header>
            <label className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-slate-200 p-3">
                <Search className="size-4 text-slate-400" />
                <input
                    aria-label={`Search ${kind}`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${kind}…`}
                    className="min-w-0 flex-1 text-sm outline-none"
                />
            </label>
            {kind === "agents" && (
                <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="mx-4 mt-3 flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-3 text-sm font-semibold text-[#6550ed]"
                >
                    <Plus className="size-4" />
                    Create & connect an agent
                </button>
            )}
            {creating && (
                <CreateAgentDialog connect onClose={() => setCreating(false)} onCreate={create} />
            )}
            <div className="space-y-2 overflow-y-auto p-4">
                {busy ? (
                    <LoaderCircle className="m-auto size-5 animate-spin text-purple-500" />
                ) : error ? (
                    <p role="alert" className="text-xs text-rose-600">
                        {error}
                    </p>
                ) : (
                    items
                        .filter(
                            (item) =>
                                item.id !== agentId &&
                                `${item.name} ${item.purpose}`
                                    .toLowerCase()
                                    .includes(search.toLowerCase()),
                        )
                        .map((item) => (
                            <button
                                key={item.id}
                                onClick={() =>
                                    onSelect({
                                        label: item.name,
                                        referenceKind: item.referenceKind,
                                        referenceId: item.id,
                                        purpose: item.purpose,
                                        ...(item.method
                                            ? {
                                                  method: item.method as WorkflowNodeData["method"],
                                                  url: item.endpointUrl,
                                              }
                                            : {}),
                                    })
                                }
                                className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-purple-300 hover:bg-purple-50"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-700">
                                        {item.name}
                                    </p>
                                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                                        {item.purpose}
                                    </p>
                                </div>
                                <Plus className="size-4 shrink-0 text-purple-500" />
                            </button>
                        ))
                )}
                {!busy && !error && !items.length && (
                    <p className="text-xs leading-6 text-slate-500">
                        No items yet. Create{" "}
                        {kind === "agents"
                            ? "an agent in Agents"
                            : kind === "tools"
                              ? "a tool in Tool Library"
                              : "a project with uploaded documents in ePACE"}
                        , then return here.
                    </p>
                )}
            </div>
        </aside>
    );
}
