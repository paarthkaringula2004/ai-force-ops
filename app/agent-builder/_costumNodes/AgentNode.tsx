import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";

export default function AgentNode({ data, selected }: NodeProps<WorkflowNode>) {
  return <div className={`flow-node flex min-w-[150px] items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-[#e5e7eb]"}`}><Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /><span className="flex size-9 items-center justify-center rounded-xl bg-[#d8f9e7] text-[#206e48]"><Bot className="size-4" /></span><span className="min-w-0"><span className="block max-w-[190px] truncate text-[12px] font-medium text-[#273142]">{data.label || "Agent"}</span><span className="mt-0.5 block text-[10px] text-[#8790a0]">Agent</span></span><Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /></div>;
}
