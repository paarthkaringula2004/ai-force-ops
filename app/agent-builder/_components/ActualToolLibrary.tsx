"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Plus, Plug, RefreshCw, Wrench } from "lucide-react";
import { useWorkflow } from "@/context/WorkflowContext";
import type { WorkflowNodeData } from "@/types/workflow";
import DraggableToolPanel from "./DraggableToolPanel";

type Tool = { id: string; name: string; purpose?: string; referenceKind: "tool" | "builtin"; method?: WorkflowNodeData["method"]; endpointUrl?: string };

export default function ActualToolLibrary() {
  const { addAgentTool, openToolLibrary } = useWorkflow();
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const response = await fetch("/api/agents/studio-options?kind=tools", { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load tools.");
        if (!controller.signal.aborted) { setTools(result.items); setError(""); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load tools.");
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    refresh.current = () => { void load(); };
    void load();
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 5000);
    window.addEventListener("focus", refresh.current);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", refresh.current); };
  }, []);

  function add(tool: Tool) {
    try {
      if (!addAgentTool) throw new Error("Tool connections are unavailable.");
      addAgentTool({ label: tool.name, referenceId: tool.id, referenceKind: tool.referenceKind, purpose: tool.purpose, ...(tool.method ? { method: tool.method, url: tool.endpointUrl } : {}) });
      setConnectionError("");
    } catch (failure) { setConnectionError(failure instanceof Error ? failure.message : "Could not connect this tool."); }
  }

  return <>
    {([ ["project", "Project Tools"], ["tool", "Tool Library"], ["integration", "Integration catalog Tools"] ] as const).map(([kind, title]) => {
      const matches = tools.filter(tool => kind === "tool" ? tool.referenceKind === "tool" : tool.referenceKind === "builtin" && (kind === "integration" ? tool.id.startsWith("integration:") : !tool.id.startsWith("integration:")));
      const Icon = kind === "integration" ? Plug : Wrench;
      return <DraggableToolPanel key={kind} title={title}
        action={kind !== "project" ? <button type="button" aria-label={kind === "integration" ? "Refresh integration tools" : "Refresh tools"} onClick={() => refresh.current()} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><RefreshCw className="size-3.5"/></button> : undefined}
        footer={kind !== "project" ? <button type="button" onClick={openToolLibrary} className="mt-3 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600">{kind === "integration" ? "Manage integrations" : "Manage Tool Library"} <ArrowUpRight className="size-3.5"/></button> : undefined}>
          {loading ? <LoaderCircle aria-label="Loading tools" className="mx-auto size-4 animate-spin text-indigo-500"/> : matches.map(tool => <button key={tool.id} type="button" title={tool.purpose || tool.name} aria-label={`Add ${tool.name}`} onClick={() => add(tool)} className="flex w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-gray-100 focus-visible:outline-indigo-400"><Icon className={`size-8 shrink-0 rounded-[10px] p-2 ${kind === "tool" ? "bg-cyan-100" : kind === "integration" ? "bg-indigo-100" : "bg-purple-100"}`}/><span className="min-w-0 flex-1 text-xs font-medium leading-4 text-gray-700">{tool.name}</span><Plus className="size-3.5 shrink-0 text-indigo-500"/></button>)}
          {!loading && !matches.length && !error && <p className="text-xs leading-5 text-gray-500">{kind === "tool" ? "Create a tool in Tool Library to see it here." : kind === "integration" ? "No integrations available for your account." : "No project tools available for your account."}</p>}
          {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
          {connectionError && <p role="alert" className="mt-2 text-xs text-rose-600">{connectionError}</p>}
      </DraggableToolPanel>;
    })}
  </>;
}
