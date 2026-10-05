import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Repeat2 } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";

export default function WhileNode({ data, selected }: NodeProps<WorkflowNode>) {
  return <div className={`flow-node flex min-w-[150px] items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-[#e5e7eb]"}`}><Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /><span className="flex size-9 items-center justify-center rounded-xl bg-[#e1f1ff] text-[#2a6797]"><Repeat2 className="size-4" /></span><span className="min-w-0"><span className="block text-[12px] font-medium text-[#273142]">{data.label || "While"}</span><span className="block max-w-[115px] truncate text-[9px] text-[#8790a0]">{data.condition || "Loop condition"}</span></span><Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /></div>;
}
