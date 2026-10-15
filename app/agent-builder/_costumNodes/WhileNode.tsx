import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Repeat2 } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";

export default function WhileNode({ data, selected }: NodeProps<WorkflowNode>) {
  return <div className={`flow-node min-w-[180px] rounded-2xl border bg-white p-3 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-[#e5e7eb]"}`}><Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-white !bg-[#262d3a]" /><div className="flow-node-header flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-[#e1f1ff] text-[#2a6797]"><Repeat2 className="size-4" /></span><span className="text-xs font-medium">{data.label || "While"}</span></div><div className="mt-2 space-y-2 text-[10px] text-slate-500"><p>Body · repeat</p><p>Done · condition false</p></div><Handle id="body" type="source" position={Position.Right} style={{top:'65%'}}/><Handle id="done" type="source" position={Position.Right} style={{top:'85%'}}/></div>;
}
