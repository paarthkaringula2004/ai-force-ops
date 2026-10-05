"use client";

import { X } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";
import AgentSettings from "@/app/agent-builder/_nodeSettings/AgentSettings";
import ApiSettings from "@/app/agent-builder/_nodeSettings/ApiSettings";
import EndSettings from "@/app/agent-builder/_nodeSettings/EndSettings";
import IfElseSettings from "@/app/agent-builder/_nodeSettings/IfElseSettings";
import UserApproval from "@/app/agent-builder/_nodeSettings/UserApproval";
import WhileSettings from "@/app/agent-builder/_nodeSettings/WhileSettings";

export default function SettingPanel({ node, onClose, onChange }: {
  node: WorkflowNode | null;
  onClose: () => void;
  onChange: (id: string, updates: Partial<WorkflowNode["data"]>) => void;
}) {
  const title = node?.data.label || "Workflow";
  const update = (updates: Partial<WorkflowNode["data"]>) => node && onChange(node.id, updates);
  let settings = <div className="rounded-xl border border-dashed border-[#e0e4ec] bg-[#fafbfc] p-4 text-[10px] leading-5 text-[#7f8999]">Select a node on the canvas to edit its settings. Drag nodes from AI Agent Tools to add a step.</div>;

  if (node?.type === "AgentNode") settings = <AgentSettings key={node.id} data={node.data} onChange={update} />;
  else if (node?.type === "ApiNode") settings = <ApiSettings key={node.id} data={node.data} onChange={update} />;
  else if (node?.type === "IfElseNode") settings = <IfElseSettings data={node.data} onChange={update} />;
  else if (node?.type === "WhileNode") settings = <WhileSettings data={node.data} onChange={update} />;
  else if (node?.type === "UserApprovalNode") settings = <UserApproval data={node.data} onChange={update} />;
  else if (node?.type === "EndNode") settings = <EndSettings data={node.data} onChange={update} />;
  else if (node?.type === "StartNode") settings = <p className="text-[10px] leading-5 text-[#7f8999]">Every workflow begins here. Add a connection from Start to the first step.</p>;

  return <aside className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[350px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-[18px] border border-[#e8eaf0] bg-white/95 shadow-[0_10px_32px_rgba(29,36,52,0.09)] backdrop-blur-sm">
    <header className="flex shrink-0 items-center justify-between border-b border-[#eef0f4] px-4 py-3"><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#8176e7]">Settings</p><h2 className="mt-1 truncate text-[12px] font-semibold text-[#344054]">{node ? title : "Workflow"}</h2></div>{node && <button type="button" onClick={onClose} aria-label="Close settings" className="flex size-7 items-center justify-center rounded-lg text-[#7c8593] hover:bg-[#f2f3f6]"><X className="size-4" /></button>}</header>
    <div className="overflow-y-auto p-4">{settings}{node && <div className="mt-4 border-t border-[#eef0f4] pt-3 text-[9px] text-[#9aa2af]">Node ID · {node.id}</div>}</div>
  </aside>;
}
