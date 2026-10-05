import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Square } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";

export default function EndNode({ data, selected }: NodeProps<WorkflowNode>) {
  return <div className={`flow-node flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-[#e5e7eb]"}`}><Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /><span className="flex size-9 items-center justify-center rounded-xl bg-[#ffe5e5] text-[#a84242]"><Square className="size-4" /></span><span className="text-[12px] font-medium text-[#273142]">{data.label || "End"}</span></div>;
}
