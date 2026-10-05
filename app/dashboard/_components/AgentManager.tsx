"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { readLocalAgentDrafts, type AgentRecord } from "@/lib/agent-store";
import { readLocalWorkflow } from "@/lib/workflow-store";
const accents = [
  "from-violet-500 to-indigo-600",
  "from-cyan-500 to-blue-600",
  "from-rose-500 to-orange-500",
  "from-emerald-500 to-teal-600",
  "from-fuchsia-500 to-violet-600",
];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AG";
}

function accentFor(id: string) {
  const seed = Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0);
  return accents[seed % accents.length];
}

function relativeTime(value: string | null | undefined, now: number) {
  if (!value || !now) return "just now";
  const difference = (Date.parse(value) - now) / 1000;
  const absolute = Math.abs(difference);
  const [unit, seconds] = absolute < 60 ? ["second", 1] : absolute < 3600 ? ["minute", 60] : absolute < 86400 ? ["hour", 3600] : absolute < 2_592_000 ? ["day", 86400] : absolute < 31_536_000 ? ["month", 2_592_000] : ["year", 31_536_000];
  const amount = Math.round(difference / seconds);
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(amount, unit as Intl.RelativeTimeFormatUnit);
}

function retentionRemaining(purgeAt: string | null | undefined, now: number) {
  if (!purgeAt || !now) return "30 days left";
  const days = Math.max(0, Math.ceil((Date.parse(purgeAt) - now) / 86_400_000));
  return days === 1 ? "1 day left" : `${days} days left`;
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.6" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function AgentGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true"><path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ConfigureGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.6" /><path d="M19.2 13.6a1.4 1.4 0 0 0 .9-2.4 1.4 1.4 0 0 0-.9-2.4 1.4 1.4 0 0 1-.9-2.4 1.4 1.4 0 1 0-2-2 1.4 1.4 0 0 1-2.4-.9 1.4 1.4 0 1 0-2.8 0 1.4 1.4 0 0 1-2.4.9 1.4 1.4 0 1 0-2 2 1.4 1.4 0 0 1-.9 2.4 1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 1 .9 2.4 1.4 1.4 0 1 0 2 2 1.4 1.4 0 0 1 2.4.9 1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 1 2.4-.9 1.4 1.4 0 1 0 2-2 1.4 1.4 0 0 1 .9-2.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}

function CreateAgentDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Enter a name for your agent to continue.");
      return;
    }
    setBusy(true);
    try {
      await onCreate(cleanName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this agent to PostgreSQL.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="create-agent-title" className="agent-dialog-enter relative w-full max-w-[510px] overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_32px_100px_rgba(24,31,56,0.28)]">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400" />
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-full border border-[#edf0f5] text-[#7b8494] transition hover:bg-[#f6f7fb]"><CloseIcon /></button>
        <div className="p-7 sm:p-9">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 text-indigo-600"><AgentGlyph /></div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">New agent · Step 1 of 1</p>
          <h2 id="create-agent-title" className="mt-2 text-[25px] font-semibold tracking-[-0.045em] text-[#20283a]">Give your agent a name</h2>
          <p className="mt-2 max-w-[390px] text-[13px] leading-6 text-[#7e8798]">Start with an identity. You can add its purpose, model, and instructions in Configure.</p>
          <form onSubmit={submit} className="mt-7">
            <label htmlFor="new-agent-name" className="mb-2 block text-[12px] font-semibold text-[#384154]">Agent name <span className="text-rose-500">*</span></label>
            <input autoFocus id="new-agent-name" value={name} onChange={(event) => { setName(event.currentTarget.value); setError(""); }} maxLength={64} placeholder="Enter agent name" className="h-[50px] w-full rounded-xl border border-[#dfe3ec] bg-[#fbfcff] px-4 text-[14px] text-[#283144] outline-none transition placeholder:text-[#a7aebc] focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10" />
            <div className="mt-2 flex min-h-5 justify-between text-[10px] text-[#929aaa]"><span role="alert" className="text-rose-500">{error}</span><span className="ml-auto">{name.length}/64</span></div>
            <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button type="button" disabled={busy} onClick={onClose} className="rounded-xl px-4 py-3 text-[12px] font-medium text-[#707a8b] transition hover:bg-[#f5f6f8] disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#171923] px-5 py-3 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(29,31,48,0.18)] transition hover:bg-[#302e48] disabled:cursor-wait disabled:opacity-60">{busy ? "Saving…" : "Create agent"} <span aria-hidden="true">→</span></button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function ConfigureAgentDialog({ agent, onClose, onSave }: { agent: AgentRecord; onClose: () => void; onSave: (updated: AgentRecord) => Promise<void> }) {
  const [draft, setDraft] = useState(agent);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save configuration to PostgreSQL.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 p-3 backdrop-blur-[3px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="configure-agent-title" className="agent-dialog-enter flex max-h-[min(92vh,900px)] w-full max-w-[790px] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-[#fbfcff] shadow-[0_32px_100px_rgba(24,31,56,0.3)]">
        <header className="flex shrink-0 items-center justify-between border-b border-[#e9ebf2] bg-white px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3"><div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${accentFor(agent.id)} text-[12px] font-bold text-white shadow-md shadow-indigo-950/10`}>{initials(agent.name)}</div><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-indigo-500">Draft configuration</p><h2 id="configure-agent-title" className="mt-0.5 text-[18px] font-semibold tracking-[-0.03em] text-[#252c3b]">Configure agent</h2></div></div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-9 items-center justify-center rounded-full border border-[#e9ebf0] text-[#737d8e] transition hover:bg-[#f4f5f8]"><CloseIcon /></button>
        </header>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto p-6 sm:p-8">
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-[#f4f2ff] via-white to-[#f0fbff] p-4 sm:p-5"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-500">01 · Agent identity</p><p className="mt-1 text-[12px] leading-5 text-[#778194]">Name the agent and describe the work you want it to help with.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#424c5f]">Agent name <span className="text-rose-500">*</span></span><input required maxLength={64} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} className="h-10 w-full rounded-lg border border-[#dfe3eb] bg-white px-3 text-[12px] text-[#30394b] outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/10" /></label>
                <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#424c5f]">Purpose <span className="font-normal text-[#9aa2b0]">(optional)</span></span><input value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.currentTarget.value })} placeholder="What should this agent help with?" className="h-10 w-full rounded-lg border border-[#dfe3eb] bg-white px-3 text-[12px] text-[#30394b] outline-none placeholder:text-[#a7aebc] focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/10" /></label>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e8eaf0] bg-white p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-500">02 · Model</p><p className="mt-1 text-[12px] leading-5 text-[#778194]">Set the model identifier when you are ready to choose one.</p></div><span className="rounded-full bg-[#f2f3f7] px-2.5 py-1 text-[9px] font-semibold text-[#7e8796]">Optional</span></div>
              <label className="mt-4 block"><span className="mb-1.5 block text-[11px] font-semibold text-[#424c5f]">OpenAI model ID</span><input value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.currentTarget.value })} placeholder="For example, enter a model ID" className="h-10 w-full rounded-lg border border-[#dfe3eb] bg-[#fcfcfe] px-3 text-[12px] text-[#30394b] outline-none placeholder:text-[#a7aebc] focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/10" /></label>
            </div>

            <div className="rounded-2xl border border-[#e8eaf0] bg-white p-4 sm:p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-500">03 · Instructions</p><p className="mt-1 text-[12px] leading-5 text-[#778194]">Describe the agent’s role and the kind of response you expect.</p></div>
              <label htmlFor="agent-instructions" className="sr-only">Agent instructions</label><textarea id="agent-instructions" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.currentTarget.value })} rows={5} placeholder="You are an AIForce.Ops agent. Describe your responsibilities, context, and response style..." className="mt-4 w-full resize-y rounded-lg border border-[#dfe3eb] bg-[#fcfcfe] px-3.5 py-3 text-[12px] leading-5 text-[#30394b] outline-none placeholder:text-[#a7aebc] focus:border-indigo-400 focus:ring-3 focus:ring-indigo-500/10" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-dashed border-[#d9dce7] bg-[#f8f9fc] p-4"><p className="text-[11px] font-semibold text-[#3e485a]">Tools</p><p className="mt-1 text-[10px] leading-4 text-[#8992a1]">No tools connected. Tool selection will be configured in a later step.</p></div>
              <div className="rounded-xl border border-dashed border-[#d9dce7] bg-[#f8f9fc] p-4"><p className="text-[11px] font-semibold text-[#3e485a]">Knowledge</p><p className="mt-1 text-[10px] leading-4 text-[#8992a1]">No knowledge sources added.</p></div>
            </div>
            {error && <p role="alert" className="text-[10px] leading-4 text-rose-700">{error}</p>}
            <p className="text-[10px] leading-4 text-[#929aaa]">Draft settings are saved to your PostgreSQL account. Launch opens the visual workflow editor.</p>
          </div>
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e9ebf2] bg-white px-6 py-4 sm:flex-row sm:justify-end sm:px-8"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl px-5 py-3 text-[11px] font-semibold text-[#737d8d] transition hover:bg-[#f5f6f9] disabled:opacity-50">Cancel</button><button type="submit" disabled={busy} className="rounded-xl bg-[#171923] px-5 py-3 text-[11px] font-semibold text-white shadow-md shadow-slate-900/10 transition hover:bg-[#302e48] disabled:cursor-wait disabled:opacity-60">{busy ? "Saving…" : "Save configuration"}</button></footer>
        </form>
      </section>
    </div>
  );
}

export default function AgentManager() {
  const router = useRouter();
  const [dataError, setDataError] = useState("");
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [binAgents, setBinAgents] = useState<AgentRecord[]>([]);
  const [accountHydrated, setAccountHydrated] = useState(false);
  const [now, setNow] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All agents" | "Bin">("All agents");
  const [configuredAgent, setConfiguredAgent] = useState<AgentRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ agent: AgentRecord; action: "bin" | "permanent" | "restore" } | null>(null);
  const [processingAgentId, setProcessingAgentId] = useState<string | null>(null);
  const [emptyBinOpen, setEmptyBinOpen] = useState(false);
  const [emptyBinBusy, setEmptyBinBusy] = useState(false);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAgents() {
      try {
        const response = await fetch("/api/agents", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load your agents.");

        const importKey = `aiforce-ops:postgres-import:v1:${data.userId ?? "current-user"}`;
        if (window.localStorage.getItem(importKey) !== "done") {
          const localAgents = readLocalAgentDrafts();
          if (localAgents.length) {
            const workflows = localAgents.flatMap((agent) => {
              const graph = readLocalWorkflow(agent.id);
              return graph ? [{ agentId: agent.id, graph }] : [];
            });
            const imported = await fetch("/api/agents/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agents: localAgents, workflows }),
              signal: controller.signal,
            });
            const importData = await imported.json();
            if (!imported.ok) throw new Error(importData.error || "Could not import saved browser drafts.");
            window.localStorage.setItem(importKey, "done");
            const refreshed = await fetch("/api/agents", { signal: controller.signal });
            const refreshedData = await refreshed.json();
            if (!refreshed.ok) throw new Error(refreshedData.error || "Could not reload imported agents.");
            setAgents(Array.isArray(refreshedData.agents) ? refreshedData.agents : []);
          } else {
            window.localStorage.setItem(importKey, "done");
            setAgents(Array.isArray(data.agents) ? data.agents : []);
          }
        } else {
          setAgents(Array.isArray(data.agents) ? data.agents : []);
        }
        const binResponse = await fetch("/api/agents?view=bin", { signal: controller.signal });
        const binData = await binResponse.json();
        if (!binResponse.ok) throw new Error(binData.error || "Could not load your Bin.");
        setBinAgents(Array.isArray(binData.agents) ? binData.agents : []);
        setDataError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setDataError(error instanceof Error ? error.message : "Could not load agents from PostgreSQL.");
      } finally {
        if (!controller.signal.aborted) setAccountHydrated(true);
      }
    }
    void loadAgents();
    return () => controller.abort();
  }, []);

  const filteredAgents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (filter === "Bin" ? binAgents : agents).filter((agent) => !term || `${agent.name} ${agent.purpose}`.toLowerCase().includes(term));
  }, [agents, binAgents, filter, search]);

  async function createAgent(name: string) {
    try {
      const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The agent could not be saved to PostgreSQL.");
      setAgents((current) => [data.agent as AgentRecord, ...current]);
      setDataError("");
      setCreateOpen(false);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "The agent could not be saved to PostgreSQL.");
      throw error;
    }
  }

  async function saveAgent(updated: AgentRecord) {
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(updated.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Configuration could not be saved to PostgreSQL.");
      setAgents((current) => current.map((agent) => agent.id === updated.id ? data.agent as AgentRecord : agent));
      setDataError("");
      setConfiguredAgent(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Configuration could not be saved to PostgreSQL.");
      throw error;
    }
  }

  async function performAction(agent: AgentRecord, action: "bin" | "permanent" | "restore") {
    setProcessingAgentId(agent.id);
    setDataError("");
    try {
      const response = action === "bin"
        ? await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" })
        : action === "permanent"
          ? await fetch(`/api/agents/${encodeURIComponent(agent.id)}?permanent=true`, { method: "DELETE" })
          : await fetch(`/api/agents/${encodeURIComponent(agent.id)}/restore`, { method: "POST" });
      const data = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(data.error || "The requested agent action could not be completed.");
      if (action === "bin") {
        setAgents((current) => current.filter((item) => item.id !== agent.id));
        setBinAgents((current) => [{ ...agent, deletedAt: data.deletedAt, purgeAt: data.purgeAt }, ...current]);
        setConfiguredAgent((current) => current?.id === agent.id ? null : current);
      } else if (action === "restore") {
        setBinAgents((current) => current.filter((item) => item.id !== agent.id));
        setAgents((current) => [{ ...agent, deletedAt: null, purgeAt: null }, ...current]);
      } else {
        setBinAgents((current) => current.filter((item) => item.id !== agent.id));
      }
      setConfirmAction(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "The requested agent action could not be completed.");
    } finally {
      setProcessingAgentId(null);
    }
  }

  async function performConfirmedAction() {
    if (confirmAction) await performAction(confirmAction.agent, confirmAction.action);
  }

  async function emptyBin() {
    setEmptyBinBusy(true);
    setDataError("");
    try {
      const response = await fetch("/api/agents/bin", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not empty the Bin.");
      setBinAgents([]);
      setEmptyBinOpen(false);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not empty the Bin.");
    } finally {
      setEmptyBinBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
      <div className="mx-auto min-h-full w-full max-w-[1500px] bg-white px-5 py-6 sm:px-8 sm:py-8 xl:px-10">
        <div className="relative overflow-hidden rounded-[24px] border border-[#e9eaf2] bg-white shadow-[0_8px_32px_rgba(31,41,55,0.045)]">
          <div className="pointer-events-none absolute -right-20 -top-32 size-[350px] rounded-full bg-[radial-gradient(circle,rgba(112,98,239,0.12),transparent_68%)]" />
          <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7">
            <div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500"><span className="size-1.5 rounded-full bg-indigo-500" />Agent workspace</div><h1 className="mt-2 text-[27px] font-semibold tracking-[-0.045em] text-[#20283a] sm:text-[32px]">{filter === "Bin" ? "Bin" : "Agents"}</h1><p className="mt-1.5 max-w-[550px] text-[12px] leading-5 text-[#828b9b]">{filter === "Bin" ? "Deleted agents stay here for 30 days. Restore them any time before they are permanently removed." : "Create and configure agents, then launch a visual workflow tailored to each agent."}</p>{filter === "Bin" && <button type="button" onClick={() => setEmptyBinOpen(true)} disabled={binAgents.length === 0} className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"><Trash2 className="size-4" />Empty Recycle Bin</button>}</div>
            {filter === "All agents" && <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#171923] px-4 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(29,31,48,0.16)] transition hover:-translate-y-0.5 hover:bg-[#302e48] hover:shadow-lg"><PlusIcon />Add New Agent</button>}
          </div>
          <div className="relative flex flex-col gap-3 border-t border-[#eff0f4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-2"><button type="button" onClick={() => { setFilter("All agents"); setSearch(""); }} className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${filter === "All agents" ? "bg-[#efedff] text-[#5b50d8]" : "text-[#7f8898] hover:bg-[#f4f5f8]"}`}>All agents <span className="ml-1 opacity-70">{agents.length}</span></button><button type="button" onClick={() => { setFilter("Bin"); setSearch(""); }} className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${filter === "Bin" ? "bg-[#efedff] text-[#5b50d8]" : "text-[#7f8898] hover:bg-[#f4f5f8]"}`}>Bin <span className="ml-1 opacity-70">{binAgents.length}</span></button></div>
            <label className="relative block w-full sm:max-w-[280px]"><span className="sr-only">Search agents</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa2b1]"><SearchIcon /></span><input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder={filter === "Bin" ? "Search Bin" : "Search agents"} className="h-10 w-full rounded-xl border border-[#e3e6ed] bg-[#fcfcfe] pl-10 pr-3 text-[11px] text-[#354052] outline-none transition placeholder:text-[#a3aab7] focus:border-indigo-300 focus:bg-white focus:ring-3 focus:ring-indigo-500/10" /></label>
          </div>
        </div>

        {dataError && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] leading-5 text-rose-700">{dataError}</div>}
        {!accountHydrated ? <div className="mt-6 h-52 animate-pulse rounded-2xl border border-[#eceef3] bg-white" /> : filter === "All agents" && agents.length === 0 ? (
          <section className="relative mt-6 overflow-hidden rounded-[24px] border border-[#e9eaf1] bg-white px-6 py-12 text-center shadow-[0_8px_32px_rgba(31,41,55,0.035)] sm:py-16">
            <div className="pointer-events-none absolute -left-20 -top-20 size-64 rounded-full bg-[radial-gradient(circle,rgba(89,209,229,0.11),transparent_70%)]" /><div className="pointer-events-none absolute -bottom-28 -right-10 size-72 rounded-full bg-[radial-gradient(circle,rgba(121,99,244,0.12),transparent_68%)]" />
            <div className="relative mx-auto flex size-[76px] items-center justify-center rounded-[25px] bg-gradient-to-br from-violet-100 via-indigo-50 to-cyan-50 text-indigo-600 shadow-[0_12px_30px_rgba(99,87,217,0.12)]"><AgentGlyph /><span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-white"><PlusIcon /></span></div>
            <p className="relative mt-6 text-[10px] font-bold uppercase tracking-[0.17em] text-indigo-500">Your agent studio starts here</p><h2 className="relative mt-2 text-[23px] font-semibold tracking-[-0.04em] text-[#20283a] sm:text-[27px]">Create your first agent</h2><p className="relative mx-auto mt-2 max-w-[440px] text-[12px] leading-6 text-[#818a9a]">Give the agent a name, then define its purpose, model, and instructions. Launch opens an empty workflow canvas with only the Start node, ready for you to shape.</p>
            <button type="button" onClick={() => setCreateOpen(true)} className="relative mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#6255e8] px-5 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(98,85,232,0.25)] transition hover:-translate-y-0.5 hover:bg-[#5146d2]"><PlusIcon />Create an agent</button>
            <p className="relative mt-4 text-[10px] text-[#a1a8b5]">Agents and workflow definitions are saved to your PostgreSQL account.</p>
          </section>
        ) : filteredAgents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#dfe3eb] bg-white px-6 py-14 text-center"><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-[#f1f0ff] text-indigo-600"><SearchIcon /></div><h2 className="mt-4 text-[16px] font-semibold text-[#30394b]">{filter === "Bin" && !search ? "Your Bin is empty" : `No ${filter === "Bin" ? "binned agents" : "agents"} match that search`}</h2><p className="mt-1 text-[11px] text-[#8b94a3]">{filter === "Bin" && !search ? "Agents you delete will stay here for 30 days." : "Try another name or purpose."}</p></div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredAgents.map((agent) => <article key={agent.id} className="group relative flex min-h-[280px] flex-col overflow-hidden rounded-[21px] border border-[#e8eaf1] bg-white p-5 shadow-[0_5px_20px_rgba(31,41,55,0.035)] transition duration-200 hover:-translate-y-1 hover:border-indigo-100 hover:shadow-[0_18px_38px_rgba(53,48,111,0.1)] sm:p-6">
              <div className={`pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-gradient-to-br ${accentFor(agent.id)} opacity-[0.07] blur-2xl transition group-hover:opacity-[0.14]`} />
              <div className="relative flex items-start justify-between gap-3"><div className={`flex size-[50px] items-center justify-center rounded-[17px] bg-gradient-to-br ${accentFor(agent.id)} text-[13px] font-bold tracking-wide text-white shadow-md shadow-indigo-950/10`}>{initials(agent.name)}</div><div className="flex items-center gap-2">{filter === "Bin" ? <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-rose-700"><span className="size-1.5 rounded-full bg-rose-400" />In Bin</span> : <><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-700"><span className="size-1.5 rounded-full bg-amber-400" />Draft</span><button type="button" onClick={() => setConfirmAction({ agent, action: "bin" })} aria-label={`Move ${agent.name} to Bin`} title={`Move ${agent.name} to Bin`} className="flex size-8 items-center justify-center rounded-lg border border-rose-100 bg-white text-rose-600 transition hover:border-rose-200 hover:bg-rose-50"><Trash2 className="size-4" /></button></>}</div></div>
              <div className="relative mt-4"><h2 className="truncate text-[17px] font-semibold tracking-[-0.025em] text-[#263044]" title={agent.name}>{agent.name}</h2><p className="mt-1 text-[10px] text-[#8b94a3]">{filter === "Bin" ? `Deleted ${relativeTime(agent.deletedAt, now)}` : `Created ${relativeTime(agent.createdAt, now)}`}</p>{filter === "Bin" && <p className="mt-1 text-[10px] font-medium text-rose-600">Auto-deletes in {retentionRemaining(agent.purgeAt, now)}</p>}<p className="mt-3 min-h-10 text-[11px] leading-5 text-[#758092]">{agent.purpose || "Purpose not added yet. Configure this draft to define what it should help with."}</p></div>
              <div className="relative mt-auto grid grid-cols-2 gap-2 border-t border-[#eef0f4] pt-4"><div className="rounded-xl bg-[#f8f9fc] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#98a0ae]">Model</p><p className="mt-1 truncate text-[10px] font-medium text-[#596376]">{agent.modelId || "Not selected"}</p></div><div className="rounded-xl bg-[#f8f9fc] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#98a0ae]">Instructions</p><p className="mt-1 text-[10px] font-medium text-[#596376]">{agent.instructions ? "Added" : "Not added"}</p></div></div>
              {filter === "Bin" ? <div className="relative mt-4 flex gap-2"><button type="button" onClick={() => void performAction(agent, "restore")} disabled={processingAgentId === agent.id} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#171923] px-3 text-[11px] font-semibold text-white transition hover:bg-[#302e48] disabled:opacity-50"><RotateCcw className="size-4" />Restore</button><button type="button" onClick={() => setConfirmAction({ agent, action: "permanent" })} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50"><Trash2 className="size-4" />Delete permanently</button></div> : <div className="relative mt-4 flex gap-2"><button type="button" onClick={() => setConfiguredAgent(agent)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#171923] px-3 text-[11px] font-semibold text-white transition hover:bg-[#302e48]"><ConfigureGlyph />Configure</button><button type="button" onClick={() => router.push(`/agent-builder/${encodeURIComponent(agent.id)}`)} title={`Open ${agent.name} workflow`} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#e2e5ed] bg-white px-3 text-[11px] font-semibold text-[#343b4a] transition hover:border-indigo-200 hover:bg-[#f8f7ff] hover:text-[#554bd4]"><span aria-hidden="true">↗</span>Launch</button></div>}
            </article>)}
          </div>
        )}
        <div className="mt-5 flex items-center justify-center gap-2 pb-2 text-[10px] text-[#a0a7b4]"><span className={`size-1.5 rounded-full ${filter === "Bin" ? "bg-rose-400" : "bg-emerald-400"}`} />{filter === "Bin" ? "Agents in Bin are automatically removed after 30 days" : "Agents sync to your account"}</div>
      </div>

      {createOpen && <CreateAgentDialog onClose={() => setCreateOpen(false)} onCreate={createAgent} />}
      {configuredAgent && <ConfigureAgentDialog agent={configuredAgent} onClose={() => setConfiguredAgent(null)} onSave={saveAgent} />}
      {confirmAction && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#101522]/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !processingAgentId) setConfirmAction(null); }}><section role="alertdialog" aria-modal="true" aria-labelledby="agent-trash-title" aria-describedby="agent-trash-description" className="w-full max-w-[430px] rounded-2xl border border-[#e7e9ef] bg-white p-6 shadow-[0_24px_80px_rgba(16,21,34,.24)]"><div className="flex size-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Trash2 className="size-5" /></div><h2 id="agent-trash-title" className="mt-4 text-[17px] font-semibold text-[#252c3b]">{confirmAction.action === "bin" ? "Move this agent to the Bin?" : "Delete this agent permanently?"}</h2><p id="agent-trash-description" className="mt-2 text-[12px] leading-5 text-[#697386]">{confirmAction.action === "bin" ? <><span className="font-semibold text-[#384153]">{confirmAction.agent.name}</span> will be kept in the Bin for 30 days. You can restore it any time before it is permanently deleted.</> : <>This permanently deletes <span className="font-semibold text-[#384153]">{confirmAction.agent.name}</span>, including its workflow and saved conversations. This cannot be undone.</>}</p>{dataError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{dataError}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={Boolean(processingAgentId)} onClick={() => { setConfirmAction(null); setDataError(""); }} className="h-10 rounded-xl border border-[#e0e3e9] px-4 text-[11px] font-semibold text-[#465064] hover:bg-[#f8f9fb] disabled:opacity-50">Cancel</button><button type="button" disabled={Boolean(processingAgentId)} onClick={() => void performConfirmedAction()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{processingAgentId ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{confirmAction.action === "bin" ? "Move to Bin" : "Delete permanently"}</button></div></section></div>}
      {emptyBinOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#101522]/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !emptyBinBusy) setEmptyBinOpen(false); }}><section role="alertdialog" aria-modal="true" aria-labelledby="empty-bin-title" aria-describedby="empty-bin-description" className="w-full max-w-[430px] rounded-2xl border border-[#e7e9ef] bg-white p-6 shadow-[0_24px_80px_rgba(16,21,34,.24)]"><div className="flex size-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Trash2 className="size-5" /></div><h2 id="empty-bin-title" className="mt-4 text-[17px] font-semibold text-[#252c3b]">Empty the Recycle Bin?</h2><p id="empty-bin-description" className="mt-2 text-[12px] leading-5 text-[#697386]">This permanently deletes all {binAgents.length} agent{binAgents.length === 1 ? "" : "s"} in the Bin, including their workflows and saved conversations. This cannot be undone.</p>{dataError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{dataError}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={emptyBinBusy} onClick={() => { setEmptyBinOpen(false); setDataError(""); }} className="h-10 rounded-xl border border-[#e0e3e9] px-4 text-[11px] font-semibold text-[#465064] hover:bg-[#f8f9fb] disabled:opacity-50">Cancel</button><button type="button" disabled={emptyBinBusy} onClick={() => void emptyBin()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{emptyBinBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Empty Recycle Bin</button></div></section></div>}
    </div>
  );
}
