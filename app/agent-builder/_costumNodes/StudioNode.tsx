"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Database, Info, Plus, Plug, Wrench, Cpu, UserRound, Headset, ChartColumn } from "lucide-react";

import { useWorkflow } from "@/context/WorkflowContext";

import type { WorkflowNode } from "@/types/workflow";



export default function StudioNode({ id, type, data, selected, actual = false }: NodeProps<WorkflowNode> & { actual?: boolean }) {

  const { openAttachments } = useWorkflow();

  const kind = type === "AgentsNode" ? "agents" : type === "ToolsNode" ? "tools" : type === "MemoryNode" ? "memory" : null;

  const integration = data.referenceKind === "builtin" && typeof data.referenceId === "string" && data.referenceId.startsWith("integration:");

  const Icon = integration ? Plug : data.referenceKind === "builtin" && data.referenceId === "agent_assist" ? Headset : data.referenceKind === "builtin" && data.referenceId === "chart_visualizer" ? ChartColumn : type === "ModelNode" ? Cpu : type === "MemoryNode" ? Database : type === "AgentsNode" ? Plus : type === "ToolsNode" ? Plus : data.referenceKind === "agent" ? UserRound : data.referenceKind === "knowledge" ? Database : data.referenceKind === "info" ? Info : Wrench;

  const color = type === "MemoryNode" || data.referenceKind === "knowledge" ? "text-amber-600" : data.referenceKind === "agent" ? "text-orange-500" : "text-[#6550ed]";

  return <div className={`flow-node relative flex min-h-[66px] min-w-[155px] max-w-[245px] items-center gap-3 rounded-xl border bg-white px-5 py-3 shadow-sm ${selected ? "border-[#816dff] ring-4 ring-purple-100" : "border-[#d9dce6]"}`}>

    {!actual && <Handle type="target" position={Position.Top} id="attachment" className="!rounded-none !bg-[#555]" />}

    <Handle type="target" position={Position.Left} id="input" className="!rounded-none !bg-[#555]" />

    <Icon className={`size-5 shrink-0 ${color}`} />

    <div className="min-w-0"><span className="block text-[13px] font-medium text-[#29334a]">{type === "ModelNode" ? String(data.modelId || "Choose model") : data.label}</span>{Boolean(data.referenceKind) && <span className="mt-1 block text-[9px] text-slate-400">{data.referenceKind === "agent" ? "Connected agent" : data.referenceKind === "knowledge" ? "Knowledge source" : data.referenceKind === "builtin" ? integration ? "Integration tool" : "Project tool" : data.referenceKind === "tool" ? "Library tool" : "Agent information"}</span>}</div>

    {kind && openAttachments && <button type="button" aria-label={`Choose ${kind}`} title={`Choose ${kind}`} onClick={(event) => { event.stopPropagation(); openAttachments(id, kind); }} className="nodrag absolute inset-0 rounded-xl hover:bg-purple-50/40" />}

    <Handle type="source" position={Position.Right} id="output" className="!bg-[#555]" />

    {!actual && <Handle type="source" position={Position.Bottom} id="children" className="!bg-[#555]" />}

  </div>;

}

export function ActualStudioNode(props: NodeProps<WorkflowNode>) {
  return <StudioNode {...props} actual />;
}
