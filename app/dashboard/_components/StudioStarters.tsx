"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Users, Workflow, LoaderCircle } from "lucide-react";
export default function StudioStarters() {
  const router = useRouter(), [busy, setBusy] = useState(""), [error, setError] = useState("");
  async function create(preset: string) {
    setBusy(preset); setError("");
    try { const response = await fetch("/api/agents/studio-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); router.push(`/agent-builder/${result.agentId}`); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not create starter."); } finally { setBusy(""); }
  }
  return <section className="mt-5 rounded-2xl border border-purple-100 bg-gradient-to-r from-[#f5f1ff] to-white p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-sm font-semibold text-slate-800">Build from your meeting</h2><p className="mt-1 text-xs text-slate-500">Ready-to-edit agent diagrams with connected specialists and project tools.</p></div><div className="flex flex-wrap gap-2">{[{ id: "cyber", label: "CyberOpsAgent", Icon: Shield }, { id: "workplace", label: "DWP-MAIN-AGENT", Icon: Users }, { id: "actionable", label: "ActionableAgent", Icon: Workflow }].map(({ id, label, Icon }) => <button key={id} disabled={Boolean(busy)} onClick={() => void create(id)} className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-4 py-3 text-xs font-semibold text-[#6550ed] hover:bg-purple-50 disabled:opacity-50">{busy === id ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}{label}</button>)}</div></div>{error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}</section>;
}
