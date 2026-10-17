"use client";
import { ArrowUpRight, MousePointer, Square, Merge, Repeat, ThumbsUp, Webhook } from "lucide-react";
import { useWorkflow } from "@/context/WorkflowContext";
import ActualToolLibrary from "./ActualToolLibrary";
import DraggableToolPanel from "./DraggableToolPanel";
export default function AgentToolsPanel({ actual = false }: { actual?: boolean }) {
    const { openToolLibrary, addNode } = useWorkflow();
    if (actual)
        return (
            <div className="nodrag nowheel flex w-max max-w-[calc(100vw-32px)] flex-wrap gap-3">
                <DraggableToolPanel title="AI Agent Tools">
                    {(
                        [
                            ["AgentNode", "Agent", MousePointer, "#CDF7E3"],
                            ["EndNode", "End", Square, "#FFE3E3"],
                            ["IfElseNode", "If/Else", Merge, "#FFF3CD"],
                            ["WhileNode", "While", Repeat, "#E3F2FD"],
                            ["UserApprovalNode", "User Approval", ThumbsUp, "#EADCF8"],
                            ["ApiNode", "API", Webhook, "#D1F0FF"],
                        ] as const
                    ).map(([kind, label, Icon, color]) => (
                        <button
                            key={kind}
                            type="button"
                            onClick={() => addNode(kind, undefined, { label, bgColor: color })}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-2 text-left hover:bg-gray-100"
                        >
                            <Icon
                                className="h-8 w-8 shrink-0 rounded-[10px] p-2"
                                style={{ backgroundColor: color }}
                            />
                            <span className="text-sm font-medium text-gray-700">{label}</span>
                        </button>
                    ))}
                </DraggableToolPanel>
                <ActualToolLibrary />
            </div>
        );
    return (
        <section className="w-[236px] rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-700">
                {actual ? "AI Agent Tools" : "Agent components"}
            </h2>
            <p className="mt-3 text-xs leading-6 text-slate-500">
                Select the model to configure it. Click + Memory for approved knowledge, + Tools for
                Tool Library items, and + Agents for existing specialists.
            </p>
            <button
                type="button"
                onClick={openToolLibrary}
                className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#6550ed]"
            >
                Manage Tool Library <ArrowUpRight className="size-4" />
            </button>
        </section>
    );
}
