"use client";

import { FileJson } from "lucide-react";
import { useState } from "react";
import type { WorkflowNodeData } from "@/types/workflow";
import { NodeField } from "@/app/agent-builder/_components/NodeField";

const supportedModels = [
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
];

type Props = { data: WorkflowNodeData; onChange: (updates: Partial<WorkflowNodeData>) => void };
type AgentForm = { name: string; instructions: string; includeHistory: boolean; modelId: string; output: "Text" | "Json"; schema: string; context: string };

function legacySettings(data: WorkflowNodeData) {
  return data.settings && typeof data.settings === "object" ? data.settings as Record<string, unknown> : {};
}

function initialForm(data: WorkflowNodeData): AgentForm {
  const legacy = legacySettings(data);
  const model = typeof data.modelId === "string" ? data.modelId : typeof legacy.model === "string" ? legacy.model : "gpt-4.1-mini";
  return {
    name: data.label || "",
    instructions: typeof data.instructions === "string" ? data.instructions : typeof legacy.instruction === "string" ? legacy.instruction : "",
    includeHistory: typeof data.includeHistory === "boolean" ? data.includeHistory : typeof legacy.includeHistory === "boolean" ? legacy.includeHistory : true,
    modelId: supportedModels.some((item) => item.value === model) ? model : "gpt-4.1-mini",
    output: (data.output ?? legacy.output) === "Json" ? "Json" : "Text",
    schema: typeof data.schema === "string" ? data.schema : typeof legacy.schema === "string" ? legacy.schema : "",
    context: typeof data.context === "string" ? data.context : typeof legacy.context === "string" ? legacy.context : "",
  };
}

export default function AgentSettings({ data, onChange }: Props) {
  const [form, setForm] = useState(() => initialForm(data));
  const [contextOpen, setContextOpen] = useState(() => Boolean(initialForm(data).context));
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  function save() {
    onChange({ label: form.name, instructions: form.instructions, includeHistory: form.includeHistory, modelId: form.modelId, output: form.output, schema: form.schema, context: form.context });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return <div className="space-y-4">
    <div><h3 className="text-[15px] font-bold text-[#171923]">Agent</h3><p className="mt-1 text-[12px] leading-5 text-[#667085]">Call the AI model with your instruction</p></div>
    <NodeField label="Name" value={form.name} onChange={(value) => update("name", value)} placeholder="Agent name" />
    <NodeField label="Instruction" value={form.instructions} onChange={(value) => update("instructions", value)} multiline placeholder="Describe what this agent should do…" />
    <div>
      <button type="button" onClick={() => setContextOpen((open) => !open)} className="flex items-center gap-2 px-1 text-[12px] font-medium text-[#202331] hover:text-[#6255e8]">{form.context ? "Edit Context" : "Add Context"}<FileJson className="size-3.5" /></button>
      {contextOpen && <div className="mt-2"><NodeField label="Context" value={form.context} onChange={(value) => update("context", value)} multiline placeholder="Add reference context for this agent…" /></div>}
    </div>
    <label className="flex items-center justify-between gap-3"><span className="text-[12px] font-medium text-[#202331]">Include Chat History</span><input type="checkbox" role="switch" checked={form.includeHistory} onChange={(event) => update("includeHistory", event.currentTarget.checked)} className="peer sr-only" /><span aria-hidden="true" className={`relative h-6 w-10 rounded-full transition ${form.includeHistory ? "bg-[#171717]" : "bg-[#d0d5dd]"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${form.includeHistory ? "left-5" : "left-1"}`} /></span></label>
    <label className="flex items-center justify-between gap-3"><span className="text-[12px] font-medium text-[#202331]">Model</span><select value={form.modelId} onChange={(event) => update("modelId", event.currentTarget.value)} className="h-9 min-w-[150px] rounded-lg border border-[#dfe2e9] bg-white px-2.5 text-[12px] text-[#273142] outline-none focus:border-indigo-300">{supportedModels.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label>
    <div className="space-y-2"><span className="text-[12px] font-medium text-[#202331]">Output Format</span><div className="flex w-fit rounded-xl bg-[#f1f2f5] p-1"><button type="button" onClick={() => update("output", "Text")} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium ${form.output === "Text" ? "bg-white text-[#171923] shadow-sm" : "text-[#667085]"}`}>Text</button><button type="button" onClick={() => update("output", "Json")} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium ${form.output === "Json" ? "bg-white text-[#171923] shadow-sm" : "text-[#667085]"}`}>Json</button></div>
      {form.output === "Json" ? <NodeField label="Enter Json Schema" value={form.schema} onChange={(value) => update("schema", value)} multiline placeholder="{title:string}" /> : <p className="text-[12px] text-[#667085]">Output will be Text</p>}
    </div>
    <button type="button" onClick={save} className="h-10 w-full rounded-xl bg-[#171717] text-[12px] font-semibold text-white transition hover:bg-[#303030]">{saved ? "Saved" : "Save"}</button>
  </div>;
}
