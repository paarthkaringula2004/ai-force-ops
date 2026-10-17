"use client";
import ModelIdSelect from "@/components/model-id-select";
import { NodeField } from "./NodeField";
import type { WorkflowNodeData } from "@/types/workflow";

export default function StudioSettings({
    type,
    data,
    onChange,
}: {
    type: string;
    data: WorkflowNodeData;
    onChange: (data: Partial<WorkflowNodeData>) => void;
}) {
    return (
        <div className="space-y-5 text-xs text-slate-600">
            {type === "ModelNode" ? (
                <>
                    <ModelIdSelect
                        value={String(data.modelId || "gpt-4.1-mini")}
                        onChange={(modelId) => onChange({ modelId })}
                    />
                    <label className="block">
                        Maximum output tokens:{" "}
                        <strong>{Number(data.maxOutputTokens || 2048)}</strong>
                        <input
                            aria-label="Maximum output tokens"
                            type="range"
                            min={256}
                            max={8000}
                            step={16}
                            value={Number(data.maxOutputTokens || 2048)}
                            onChange={(e) => onChange({ maxOutputTokens: Number(e.target.value) })}
                            className="mt-3 w-full accent-[#6550ed]"
                        />
                    </label>
                    <label className="block">
                        Conversation history:{" "}
                        <strong>{Number(data.historyMessages ?? 20)} messages</strong>
                        <input
                            aria-label="Conversation history"
                            type="range"
                            min={0}
                            max={50}
                            value={Number(data.historyMessages ?? 20)}
                            onChange={(e) => onChange({ historyMessages: Number(e.target.value) })}
                            className="mt-3 w-full accent-[#6550ed]"
                        />
                    </label>
                    {/^(gpt-4\.1|gpt-4o)(-|$)/.test(String(data.modelId || "")) && (
                        <label className="block">
                            Temperature: <strong>{Number(data.temperature ?? 0.3)}</strong>
                            <input
                                aria-label="Temperature"
                                type="range"
                                min={0}
                                max={1}
                                step={0.1}
                                value={Number(data.temperature ?? 0.3)}
                                onChange={(e) => onChange({ temperature: Number(e.target.value) })}
                                className="mt-3 w-full accent-[#6550ed]"
                            />
                        </label>
                    )}
                    {/^(gpt-4\.1|gpt-4o)(-|$)/.test(String(data.modelId || "")) && (
                        <>
                            {(
                                [
                                    ["topP", "Top P", 0.01, 1, 1],
                                    ["frequencyPenalty", "Frequency penalty", -2, 2, 0],
                                    ["presencePenalty", "Presence penalty", -2, 2, 0],
                                ] as const
                            ).map(([field, label, min, max, fallback]) => (
                                <label key={field} className="block">
                                    {label}: <strong>{Number(data[field] ?? fallback)}</strong>
                                    <input
                                        aria-label={label}
                                        type="range"
                                        min={min}
                                        max={max}
                                        step={0.01}
                                        value={Number(data[field] ?? fallback)}
                                        onChange={(e) =>
                                            onChange({ [field]: Number(e.target.value) })
                                        }
                                        className="mt-3 w-full accent-[#6550ed]"
                                    />
                                </label>
                            ))}
                        </>
                    )}
                    <p>
                        Settings apply when you Play this agent. Available settings depend on the
                        selected model.
                    </p>
                </>
            ) : type === "ReferenceNode" ? (
                <>
                    <NodeField
                        label="Display name"
                        value={data.label}
                        onChange={(label) => onChange({ label })}
                    />
                    <NodeField
                        label="When to use this connection"
                        multiline
                        value={String(data.purpose || "")}
                        onChange={(purpose) => onChange({ purpose })}
                    />
                    <p>
                        {data.referenceKind === "agent"
                            ? "The connected agent uses its own saved instructions, model and dependencies. It does not inherit extra permissions."
                            : data.referenceKind === "knowledge"
                              ? "Searches this selected project’s indexed documents and returns passages with source names."
                              : data.referenceKind === "tool"
                                ? "Uses the saved Tool Library endpoint. Configure authentication in API settings below. External origins must be approved in the server configuration."
                                : "Reads authorized project records. Missing connections are reported as missing."}
                    </p>
                </>
            ) : (
                <p>
                    Click the + button on this node to choose existing{" "}
                    {type === "AgentsNode"
                        ? "agents"
                        : type === "MemoryNode"
                          ? "knowledge projects"
                          : "tools"}
                    . Each selection appears on the canvas with its connection.
                </p>
            )}
        </div>
    );
}
