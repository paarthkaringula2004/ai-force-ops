import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ThumbsUp } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";

export default function UserApprovalNode({ data, selected }: NodeProps<WorkflowNode>) {
  return <div className={`flow-node min-w-[155px] rounded-2xl border bg-white p-2.5 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-[#e5e7eb]"}`}><Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /><div className="mb-2 flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-[#efe1fc] text-[#76539b]"><ThumbsUp className="size-4" /></span><span className="text-[12px] font-medium text-[#273142]">{data.label || "User Approval"}</span></div><div className="space-y-1.5"><div className="rounded-md border border-[#e9eaf0] px-2 py-1 text-[9px] text-[#758092]">Approve</div><div className="rounded-md border border-[#e9eaf0] px-2 py-1 text-[9px] text-[#758092]">Reject</div></div><Handle id="approve" type="source" position={Position.Right} style={{ top: "58%" }} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /><Handle id="reject" type="source" position={Position.Right} style={{ top: "83%" }} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /></div>;
}
