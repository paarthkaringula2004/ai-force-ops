import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Info, Play } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";

export default function StartNode({ data, selected }: NodeProps<WorkflowNode>) {
    if (data.workflowMode === "actual")
        return (
            <div
                className={`flow-node flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm ${selected ? "border-indigo-400" : "border-[#e5e7eb]"}`}
            >
                <span className="flex size-9 items-center justify-center rounded-xl bg-[#fff6c9]">
                    <Play className="size-4 text-[#171717]" />
                </span>
                <span className="text-[13px] font-medium text-[#171717]">Start</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!size-2 !border-2 !border-white !bg-[#262d3a]"
                />
            </div>
        );
    return (
        <div
            className={`flow-node flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm ${selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-[#e5e7eb]"}`}
        >
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#fff6c9] text-[#5f5200]">
                <Info className="size-4" />
            </span>
            <span className="text-[13px] font-medium text-[#273142]">{data.label || "Info"}</span>
            <Handle
                type="source"
                position={Position.Right}
                className="!size-2 !border-2 !border-white !bg-[#262d3a]"
            />
        </div>
    );
}
