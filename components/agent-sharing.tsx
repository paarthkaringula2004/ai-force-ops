"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole, Share2, Users, X, LoaderCircle } from "lucide-react";

import {UserAgentCopyButton} from "./user-agent-copy";

type Role = "user" | "manager" | "employee" | "admin";
export type SharedAgentCard = { id: string; name: string; purpose: string; ownerName: string; version: number };
export function useAgentSharing() {
  const [data, setData] = useState<{ canShare: boolean; shareMode: "roles" | "recipients" | "copy"; recipientScope?: "all" | "department"; ownerName: string; own: { id: string; shareId: string; roles: Role[]; recipientIds?: string[]; legacySharing?: boolean }[]; shared: SharedAgentCard[] }>({ canShare: false, shareMode: "roles", ownerName: "", own: [], shared: [] });
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { const response = await fetch("/api/agents/sharing", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); const expected=result.viewerRole==="user"?"copy":result.viewerRole==="admin"?"roles":["manager","employee"].includes(result.viewerRole)?"recipients":null; if(!expected||result.shareMode!==expected)throw new Error("Sharing settings are outdated. Refresh the page to load the current version."); setData(result); setError(""); }
    catch (error) { setData(previous=>({...previous,canShare:false})); setError(error instanceof Error ? error.message : "Could not load sharing."); }
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000); const visible = () => { if (document.visibilityState === "visible") void refresh(); }; document.addEventListener("visibilitychange", visible); return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", visible); }; }, [refresh]);
  return { ...data, error, refresh };
}

export function AgentShareButton({ agent, roles, recipientIds = [], shareMode = "copy", recipientScope = "department", legacySharing = false, canShare, ownerName, onSaved }: { agent: { id: string; name: string }; roles: Role[]; recipientIds?: string[]; shareMode?: "roles" | "recipients" | "copy"; recipientScope?: "all" | "department"; legacySharing?: boolean; canShare: boolean; ownerName: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<Role[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [recipientText,setRecipientText]=useState("");
  const direct=shareMode==="recipients", shared=legacySharing||roles.length>0||recipientIds.length>0;
  const selectedIds=[...new Set(recipientText.split(/[\s,]+/).filter(Boolean))];
  const dialog = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); button.current?.focus(); };
  useEffect(() => { if (!open) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; dialog.current?.querySelector<HTMLButtonElement>("button")?.focus(); return () => { document.body.style.overflow = previous; }; }, [open]);
  async function save() {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/agents/${agent.id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(direct?{roles:selected,recipientIds:selected.includes("user")?selectedIds:[]}:{roles:selected}) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await onSaved(); close(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save sharing."); } finally { setBusy(false); }
  }
  if (!canShare) return <button type="button" disabled aria-label={`Share ${agent.name}`} title="Sharing settings are loading or unavailable" className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] text-slate-500"><Share2 className="size-3.5"/>Share</button>;
  if (shareMode === "copy") return <UserAgentCopyButton agent={agent} onSaved={onSaved}/>;
  return <>
    <button ref={button} type="button" disabled={!canShare} aria-label={`Share ${agent.name}`} aria-haspopup="dialog" onClick={() => { setSelected(roles); setRecipientText(recipientIds.join("\n")); setError(""); setOpen(true); }} title={canShare ? "Manage preview sharing" : "Share access is unavailable for this account"} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold transition ${shared ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200"}`}><Share2 className="size-3.5" />{shared ? "Shared" : "Not shared"}</button>
    {open && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`share-title-${agent.id}`} className="w-full max-w-[510px] max-h-[90dvh] overflow-y-auto rounded-3xl border border-purple-100 bg-white p-6 text-slate-800 shadow-2xl" onKeyDown={event => { if (event.key === "Escape" && !busy) close(); if (event.key === "Tab") { const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)'); if (!focusable?.length) return; const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}>
        <div className="flex items-center justify-between gap-3"><h2 id={`share-title-${agent.id}`} className="text-xl font-semibold">Share ‘{agent.name}’</h2><button type="button" aria-label="Close sharing" disabled={busy} onClick={close} className="rounded-full p-2 text-slate-500 hover:bg-purple-50"><X className="size-5" /></button></div>
        <h3 className="mt-6 text-sm font-semibold">People with access</h3><div className="mt-3 flex items-center gap-3 border-b border-purple-100 pb-5"><span className="flex size-10 items-center justify-center rounded-full bg-purple-100 font-semibold text-[#6550ed]">{ownerName.slice(0, 1).toUpperCase() || "A"}</span><div className="flex-1 text-sm"><p className="font-medium">{ownerName || "Owner"} (you)</p><p className="mt-0.5 text-xs text-slate-500">Workflow owner</p></div><span className="text-xs text-slate-500">Owner</span></div>
        <h3 className="mt-5 text-sm font-semibold">General access</h3>
        <div className="mt-3 flex items-center gap-3"><span className="rounded-full bg-purple-50 p-2.5 text-[#6550ed]">{selected.length?<Users className="size-5"/>:<LockKeyhole className="size-5"/>}</span><div><p className="text-sm font-medium">{selected.length?"Selected access":"Restricted"}</p><p className="mt-1 text-xs leading-5 text-slate-500">{direct?(recipientScope==="department"?"Manager and Employee access is limited to your department. User access is limited to the IDs you enter.":"Staff role selections include current and future accounts in those roles. User access is limited to the IDs you enter."):"Selected roles include all current and future accounts, including Users."}</p></div></div>
        <fieldset disabled={busy} className="mt-4 flex flex-wrap gap-3"><legend className="sr-only">Share with roles</legend>{((direct&&recipientScope==="department"?["user","manager","employee"]:["user","manager","employee","admin"]) as Role[]).map(role=><label key={role} className="flex cursor-pointer items-center gap-2 rounded-xl border border-purple-100 bg-purple-50/40 px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(role)} onChange={event=>setSelected(event.target.checked?[...selected,role]:selected.filter(value=>value!==role))} className="size-4 accent-[#6550ed]"/>{role[0].toUpperCase()+role.slice(1)}</label>)}</fieldset>
        {direct&&selected.includes("user")&&<div className="mt-4"><label className="block text-sm font-medium">Enter user ID<textarea value={recipientText} onChange={event=>setRecipientText(event.target.value)} disabled={busy} maxLength={6500} rows={3} aria-describedby="recipient-rules" placeholder="Enter user ID" className="mt-2 w-full resize-y rounded-xl border border-purple-100 p-3 font-mono text-xs outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"/></label><p id="recipient-rules" className="mt-2 text-xs text-slate-500">Only these User accounts receive access. Enter up to 50 user_ids, separated by commas or new lines. Find user_id in Settings / Personal details.</p></div>}
        {legacySharing&&<p className="mt-3 text-xs text-amber-800">Existing individual grants remain active. Saving replaces those grants with the role selections and User IDs shown here.</p>}
        <p className="mt-4 text-xs leading-5 text-slate-500">Recipients use a read-only clone of this version with its connected project data. They can chat, but cannot edit the workflow or approve external changes. Done saves the current version. Clear all roles to remove access.</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-6 flex items-center justify-end"><button type="button" disabled={busy||(direct&&selected.includes("user")&&!selectedIds.length)} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-full bg-[#6550ed] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#5643d6] disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />}Done</button></div>
      </div>
    </div>, document.body)}
  </>;
}
