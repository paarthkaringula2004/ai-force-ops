import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Webhook } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";

export default function ApiNode({ data, selected }: NodeProps<WorkflowNode>) {
  return <div className={`flow-node flex min-w-[155px] items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-[#e5e7eb]"}`}><Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /><span className="flex size-9 items-center justify-center rounded-xl bg-[#d9f3ff] text-[#286c91]"><Webhook className="size-4" /></span><span className="min-w-0"><span className="block max-w-[155px] truncate text-[12px] font-medium text-[#273142]">{data.label || "API Request"}</span><span className="mt-0.5 block max-w-[155px] truncate text-[9px] text-[#8790a0]">{data.method || "GET"} · {data.url || "Endpoint not set"}</span></span><Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /></div>;
}
