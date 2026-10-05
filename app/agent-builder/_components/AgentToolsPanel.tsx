"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Bot, GitFork, Repeat2, Square, ThumbsUp, Webhook } from "lucide-react";
import { useWorkflow } from "@/context/WorkflowContext";
import type { WorkflowNodeKind } from "@/types/workflow";

const tools: { label: string; kind: WorkflowNodeKind; color: string; icon: typeof Bot; description: string }[] = [
  { label: "Agent", kind: "AgentNode", color: "#d8f9e7", icon: Bot, description: "Reasoning step" },
  { label: "End", kind: "EndNode", color: "#ffe5e5", icon: Square, description: "Finish a path" },
  { label: "If / Else", kind: "IfElseNode", color: "#fff1c5", icon: GitFork, description: "Branch on a condition" },
  { label: "While", kind: "WhileNode", color: "#e1f1ff", icon: Repeat2, description: "Repeat a step" },
  { label: "User Approval", kind: "UserApprovalNode", color: "#efe1fc", icon: ThumbsUp, description: "Request a decision" },
  { label: "API", kind: "ApiNode", color: "#d9f3ff", icon: Webhook, description: "Call an endpoint" },
];

export default function AgentToolsPanel() {
  const { addNode, openToolLibrary } = useWorkflow();
  const [connectedTools, setConnectedTools] = useState<{ id: string; name: string; purpose: string; method: string; endpointUrl: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tools", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      setConnectedTools(Array.isArray(data.tools) ? data.tools : []);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return <section className="w-[208px] rounded-[20px] border border-[#e8eaf0] bg-white/95 p-3.5 shadow-[0_10px_32px_rgba(29,36,52,0.09)] backdrop-blur-sm">
    <h2 className="mb-2 px-1 text-[12px] font-semibold text-[#344054]">AI Agent Tools</h2>
    <p className="mb-3 px-1 text-[9px] leading-4 text-[#8a93a2]">Click or drag a step onto the canvas.</p>
    <div className="space-y-1">{tools.map((tool) => { const Icon = tool.icon; return <button key={tool.kind} type="button" draggable onClick={() => addNode(tool.kind)} onDragStart={(event) => { event.dataTransfer.setData("application/aiforce-node", tool.kind); event.dataTransfer.effectAllowed = "move"; }} className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-[#f5f6fa] active:scale-[0.99]"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: tool.color }}><Icon className="size-4 text-[#343b49]" /></span><span className="min-w-0"><span className="block text-[11px] font-medium text-[#374151]">{tool.label}</span><span className="block text-[9px] text-[#929aaa]">{tool.description}</span></span></button>; })}</div>
    <div className="mt-3 border-t border-[#edf0f4] pt-3"><div className="flex items-center justify-between px-1"><h3 className="text-[10px] font-semibold text-[#555f70]">Tool Library</h3><button type="button" onClick={openToolLibrary} className="inline-flex items-center gap-1 text-[9px] font-medium text-[#6255e8] hover:underline">Manage <ArrowUpRight className="size-3" /></button></div>{connectedTools.length ? <div className="mt-1.5 space-y-1">{connectedTools.slice(0, 3).map((tool) => <button key={tool.id} type="button" title={`Add ${tool.name} API step`} onClick={() => addNode("ApiNode", undefined, { label: tool.name, purpose: tool.purpose, method: tool.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: tool.endpointUrl, toolId: tool.id })} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-[#f5f6fa]"><span className="min-w-0"><span className="block truncate text-[10px] font-medium text-[#465064]">{tool.name}</span><span className="block text-[8px] text-[#929aaa]">{tool.method} · API</span></span><span className="text-[12px] text-[#6255e8]">+</span></button>)}</div> : <p className="px-1 pt-2 text-[9px] leading-4 text-[#929aaa]">No tools added yet. Add an HTTPS tool in Tool Library to place it on this canvas.</p>}</div>
  </section>;
}
