"use client";

import { FileJson } from "lucide-react";
import { useState } from "react";
import type { WorkflowNodeData } from "@/types/workflow";
import { NodeField } from "@/app/agent-builder/_components/NodeField";

type Props = { data: WorkflowNodeData; onChange: (updates: Partial<WorkflowNodeData>) => void };
type ApiForm = { name: string; method: "GET" | "POST"; url: string; includeApiKey: boolean; apiKeyDraft: string; apiKeyLocation: "query" | "header"; apiKeyName: string; apiKeyPrefix: string; bodyParams: string; apiKeyConfigured: boolean; clearApiKey: boolean };

function legacySettings(data: WorkflowNodeData) {
  return data.settings && typeof data.settings === "object" ? data.settings as Record<string, unknown> : {};
}

function initialForm(data: WorkflowNodeData): ApiForm {
  const legacy = legacySettings(data);
  return {
    name: data.label || "",
    method: (data.method ?? legacy.method) === "POST" ? "POST" : "GET",
    url: typeof data.url === "string" ? data.url : typeof legacy.url === "string" ? legacy.url : "",
    includeApiKey: typeof data.includeApiKey === "boolean" ? data.includeApiKey : typeof legacy.includeApiKey === "boolean" ? legacy.includeApiKey : true,
    apiKeyDraft: typeof data.apiKeyDraft === "string" ? data.apiKeyDraft : typeof data.apiKey === "string" ? data.apiKey : "",
    apiKeyLocation: (data.apiKeyLocation ?? legacy.apiKeyLocation) === "header" ? "header" : "query",
    apiKeyName: typeof data.apiKeyName === "string" ? data.apiKeyName : typeof legacy.apiKeyName === "string" ? legacy.apiKeyName : "key",
    apiKeyPrefix: typeof data.apiKeyPrefix === "string" ? data.apiKeyPrefix : typeof legacy.apiKeyPrefix === "string" ? legacy.apiKeyPrefix : "",
    bodyParams: typeof data.bodyParams === "string" ? data.bodyParams : typeof legacy.bodyParams === "string" ? legacy.bodyParams : "",
    apiKeyConfigured: data.apiKeyConfigured === true,
    clearApiKey: false,
  };
}

export default function ApiSettings({ data, onChange }: Props) {
  const [form, setForm] = useState(() => initialForm(data));
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof ApiForm>(key: K, value: ApiForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  function save() {
    onChange({
      label: form.name,
      method: form.method,
      url: form.url,
      includeApiKey: form.includeApiKey,
      apiKeyDraft: form.apiKeyDraft,
      apiKeyLocation: form.apiKeyLocation,
      apiKeyName: form.apiKeyName,
      apiKeyPrefix: form.apiKeyPrefix,
      bodyParams: form.bodyParams,
      clearApiKey: form.clearApiKey,
    });
    setForm((current) => ({ ...current, apiKeyDraft: "", apiKeyConfigured: current.apiKeyConfigured || Boolean(current.apiKeyDraft.trim()), clearApiKey: false }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return <div className="space-y-4">
    <div><h3 className="text-[15px] font-bold text-[#171923]">API Agent</h3><p className="mt-1 text-[12px] leading-5 text-[#667085]">Call an external API endpoint with your chosen method</p></div>
    <NodeField label="Name" value={form.name} onChange={(value) => update("name", value)} placeholder="API agent name" />
    <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-[#202331]">Request Method</span><select value={form.method} onChange={(event) => update("method", event.currentTarget.value as ApiForm["method"])} className="h-9 rounded-lg border border-[#dfe2e9] bg-white px-3 text-[12px] text-[#273142] outline-none focus:border-indigo-300"><option value="GET">GET</option><option value="POST">POST</option></select></label>
    <div><NodeField label="API URL" value={form.url} onChange={(value) => update("url", value)} placeholder="https://api.example.com/data?city={{city}}" /><p className="mt-1.5 text-[11px] leading-4 text-[#667085]">Use placeholders like {"{{city}}"} for values the agent should ask the user for, and {"{{apiKey}}"} to insert the saved key into the URL.</p></div>
    <label className="flex items-center justify-between gap-3"><span className="text-[12px] font-medium text-[#202331]">Include API Key</span><input type="checkbox" role="switch" checked={form.includeApiKey} onChange={(event) => update("includeApiKey", event.currentTarget.checked)} className="peer sr-only" /><span aria-hidden="true" className={`relative h-6 w-10 rounded-full transition ${form.includeApiKey ? "bg-[#171717]" : "bg-[#e5e7eb]"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${form.includeApiKey ? "left-5" : "left-1"}`} /></span></label>
    {form.includeApiKey && <div className="space-y-3 rounded-xl border border-[#eceef2] bg-[#fbfcfe] p-3">
      <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[#202331]">API Key</span><input type="password" autoComplete="new-password" value={form.apiKeyDraft} onChange={(event) => update("apiKeyDraft", event.currentTarget.value)} placeholder={form.apiKeyConfigured ? "Saved securely · enter a new key to replace" : "Enter API Key"} className="h-9 w-full rounded-lg border border-[#e4e7ee] bg-white px-3 text-[11px] outline-none placeholder:text-[#a0a7b3] focus:border-indigo-300" /></label>
      <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[#202331]">Send API Key In</span><select value={form.apiKeyLocation} onChange={(event) => update("apiKeyLocation", event.currentTarget.value as ApiForm["apiKeyLocation"])} className="h-9 w-full rounded-lg border border-[#dfe2e9] bg-white px-3 text-[11px] outline-none focus:border-indigo-300"><option value="query">URL query parameter</option><option value="header">Request header</option></select></label>
      <NodeField label={form.apiKeyLocation === "header" ? "Header Name" : "Query Parameter Name"} value={form.apiKeyName} onChange={(value) => update("apiKeyName", value)} placeholder={form.apiKeyLocation === "header" ? "Authorization" : "key"} />
      {form.apiKeyLocation === "header" && <div><NodeField label="Optional Header Prefix" value={form.apiKeyPrefix} onChange={(value) => update("apiKeyPrefix", value)} placeholder="Bearer " /><p className="mt-1.5 text-[10px] text-[#667085]">For example, enter Bearer followed by a space for an Authorization header.</p></div>}
      {form.apiKeyConfigured && <button type="button" onClick={() => update("clearApiKey", true)} className="text-[10px] font-medium text-rose-700 hover:underline">{form.clearApiKey ? "Saved key will be removed" : "Remove saved API key"}</button>}
    </div>}
    {form.method === "POST" && <div className="space-y-2"><NodeField label="Body Parameters (JSON)" value={form.bodyParams} onChange={(value) => update("bodyParams", value)} multiline placeholder={'{ "param1": "value1", "param2": "value2" }'} /><p className="flex items-center gap-2 px-1 text-[11px] text-[#202331]">Add Body Params<FileJson className="size-3.5" /></p></div>}
    <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] leading-4 text-emerald-800">API keys are encrypted before they are stored in PostgreSQL and are excluded from workflow exports.</p>
    <button type="button" onClick={save} className="h-10 w-full rounded-xl bg-[#171717] text-[12px] font-semibold text-white transition hover:bg-[#303030]">{saved ? "Saved" : "Save"}</button>
  </div>;
}
