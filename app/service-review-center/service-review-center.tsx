"use client";


import "./review-theme.css";
import ThemedSelect from "@/components/themed-select";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpenCheck, Bot,
  ChartNoAxesCombined, CircleHelp, ClipboardList, Command,
  Cpu, Globe2, Layers3, Menu, Moon, Network, Search,
  ShieldCheck, Sparkles, Sun, Workflow, X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import WorkspaceUserMenu from "@/components/auth/WorkspaceUserMenu";
import WorkspaceLink from "@/components/workspace-link";
import {permitted, type WorkspaceAccess} from "@/lib/workspace-permissions";
import OperationsOverview from "./operations-overview";
import DataSources from "./data-sources";
import GeoHealthTable from "./geo-health-table";
import ReviewAssistant from "./review-assistant";
import ManagerAssistant from './manager-assistant';
import ManagerSources from './manager-sources';

import { latestHealthReadings, type ReviewSource, type ReviewReading, type ReviewWorker } from "./review-data";

type View = "services" | "value" | "observability" | "geo" | "aiops" | "executive" | "details" | "sources" | "vulnerabilities";
type Service = { title: string; short: string; detail: string; icon: typeof Activity; color: string; route: View };
type ReviewRecord = ReviewReading;

const services: Service[] = [
  { title: "Intelligent Full-stack Observability (IFSO)", short: "A holistic, real-time view across applications, infrastructure, and user experience.", detail: "Unify metrics, logs, events, and topology to detect anomalies early, identify root causes, and protect service continuity across hybrid environments.", icon: Activity, color: "#6351e9", route: "observability" },
  { title: "AI-driven Service Management (AISM)", short: "Use AI to automate service operations and surface actionable insights.", detail: "Connect incident, change, and request workflows with service intelligence, assisted triage, and automation recommendations.", icon: Cpu, color: "#6351e9", route: "aiops" },
  { title: "Intelligent Service Orchestration (ISOA)", short: "Coordinate people, processes, and automation across service operations.", detail: "Design policy-aware workflows that connect event signals to response teams, service desks, and resolution playbooks.", icon: Workflow, color: "#6351e9", route: "aiops" },
  { title: "Autonomous Endpoint Management (AEM)", short: "Manage endpoint fleets with proactive, self-healing operations.", detail: "Track device posture, endpoint health, and remediation activity from a single operational view.", icon: Network, color: "#6351e9", route: "observability" },
  { title: "Policy & Compliance (P&C)", short: "Bring operational controls and compliance signals into one view.", detail: "Review policy coverage, control status, and audit signals alongside the services they protect.", icon: ShieldCheck, color: "#6351e9", route: "executive" },
  { title: "Visualization & Insights (V&I)", short: "Turn service data into clear operational and business views.", detail: "Explore service experience, automation yield, financial value, and trends across your portfolio.", icon: ChartNoAxesCombined, color: "#6351e9", route: "value" },
];

const navItems: { id: View; name: string; icon: typeof Activity }[] = [
  { id: "services", name: "Platform", icon: Layers3 },
  { id: "observability", name: "Observability", icon: Activity },
  { id: "value", name: "Value dashboard", icon: ChartNoAxesCombined },
  { id: "aiops", name: "AI Ops", icon: Bot },
  { id: "executive", name: "Executive summary", icon: ClipboardList },
  { id: "sources", name: "Data sources", icon: Network },

];

function Sparkline({ color = "#38bfae", values }: { color?: string; values?: number[] }) {
  if (!values || values.length < 2) return <div className="flex h-full items-center justify-end text-[8px] text-slate-300">Awaiting history</div>;
  const normalized = values.slice(-12).filter(Number.isFinite);
  const min = Math.min(...normalized);
  const max = Math.max(...normalized);
  const span = max - min || 1;
  const points = normalized.map((v, i) => `${i * (110 / Math.max(1, normalized.length - 1))},${66 - ((v - min) / span) * 50}`).join(" ");
  const fillId = `fill-${color.replace("#", "")}`;
  return <svg viewBox="0 0 110 75" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true"><defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs><path d={`M0 70 L${points.replaceAll(" ", " L")} L110 70 Z`} fill={`url(#${fillId})`}/><polyline points={points} fill="none" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function MetricCard({ label, value, color, history, observed }: { label: string; value: string | null; color: string; history: number[]; observed?: ReviewRecord }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(21,40,70,.035)]"><div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-medium text-slate-500">{label}</p><p className="mt-2 text-[27px] font-semibold tracking-[-.04em] text-slate-900">{value ?? "—"}</p></div><span className="rounded-lg p-2" style={{ backgroundColor: `${color}12`, color }}><Activity className="size-4"/></span></div><div className="mt-1 flex items-end justify-end"><div className="h-10 w-[58%]"><Sparkline color={color} values={history}/></div></div>{observed&&<p className="mt-3 text-xs text-slate-500">{observed.sourceName} · {new Date(observed.observedAt).toLocaleString()}</p>}</article>;
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(21,40,70,.035)]"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5"><h2 className="text-[13px] font-semibold text-slate-800">{title}</h2>{action}</div><div className="p-4">{children}</div></section>;
}

export default function ServiceReviewCenter({initialView="services"}:{initialView?:View}) {
  const { data } = authClient.useSession();
  const [view, setView] = useState<View>(initialView);
  const [selectedService, setSelectedService] = useState(services[0]);
  const [member,setMember]=useState<WorkspaceAccess|null>(null);
  const [dataState, setDataState] = useState<"loading" | "connected" | "unavailable">("loading");
  const [loadError,setLoadError]=useState("");
  const [refreshAttempt,setRefreshAttempt]=useState(0);
  const [persona, setPersona] = useState("eAssist");
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/workspace/access",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])}).then(async r=>{const d=await r.json();if(!r.ok||!d.member)throw new Error(d.error||"Workspace access could not be loaded.");return d;}).then(d=>{if(!controller.signal.aborted){setMember(d.member);if(d.member.role === "manager")setPersona("ePACE");}}).catch(e=>{if(!controller.signal.aborted){setLoadError(e instanceof Error&&e.name!=="TimeoutError"?e.message:"Workspace access took too long to load. Please retry.");setDataState("unavailable");}});
    return()=>controller.abort();
  },[refreshAttempt]);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("All");
  const [clock, setClock] = useState<Date | null>(null);
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [sources, setSources] = useState<ReviewSource[]>([]);
  const [worker,setWorker]=useState<ReviewWorker>({active:false,checkedAt:null,configured:false});
  const [checkedAt, setCheckedAt] = useState("");
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState("");
  const [organization,setOrganization]=useState<{attention:number;runtimeAttention:number;scope:string}|null>(null);
  const displayName = data?.user?.name?.trim() || data?.user?.email || "Workspace member";

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if(!member)return;
    const controller = new AbortController();
    let pending = false;
    async function refreshRecords() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const response = await fetch("/api/service-review-center/records", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "PostgreSQL service readings are unavailable.");
        setRecords(Array.isArray(result.records) ? result.records : []);
        setSources(Array.isArray(result.sources) ? result.sources : []);
        setWorker(result.worker);
        setOrganization(result.organization||null);
        setCheckedAt(typeof result.checkedAt === "string" ? result.checkedAt : new Date().toISOString());
        setLoadError("");
        setDataState("connected");
      } catch (error) {
        if (!controller.signal.aborted) {setLoadError(error instanceof Error&&error.name!=="TimeoutError"?error.message:"The service data request timed out. Retrying automatically.");setDataState("unavailable");setSources(previous=>previous.map(source=>({...source,stale:true})));setWorker(previous=>({...previous,active:false}));}
      } finally { pending = false; }
    }
    if(member.role==='admin')void fetch("/api/service-review-center/sync", { method: "POST", signal: controller.signal }).then(() => refreshRecords()).catch(() => {});
    const stream = member.role==='admin'?new EventSource("/api/eassist/events"):null;
    stream?.addEventListener("change", () => void refreshRecords());
    void refreshRecords();
    const timer = window.setInterval(() => void refreshRecords(), 5000);
    return () => { controller.abort(); stream?.close(); window.clearInterval(timer); };
  }, [member,refreshAttempt]);
  const filteredDevices = useMemo(() => latestHealthReadings(records.filter((record)=>!record.sourceId||sources.some(s=>s.id===record.sourceId&&!s.stale))).map((record) => {
    const row = record.payload;
    return ["device", "ipAddress", "site", "category", "country", "vendor", "status", "description"].map((key) => typeof row[key] === "string" ? row[key] as string : "");
  }).filter((row) => (country === "All" || row[4] === country) && row.join(" ").toLowerCase().includes(search.toLowerCase())), [records, sources, country, search]);
  function metricValue(key: string, suffix = "") {
    const item = records.find((record) => record.recordType === "metric" && record.recordKey === key && record.isCurrent !== false);
    return item && typeof item.payload.value === "number" ? `${item.payload.value}${suffix || (typeof item.payload.unit === "string" ? item.payload.unit : "")}` : null;
  }
  function metricHistory(key: string) {
    const current=records.find(r=>r.recordType==="metric"&&r.recordKey===key);
    return records.filter((record) => record.recordType === "metric" && record.recordKey === key && record.payload.unit===current?.payload.unit && typeof record.payload.value === "number").slice(0, 12).reverse().map((record) => Number(record.payload.value));
  }
  const healthRecords = latestHealthReadings(records.filter(r=>!r.sourceId||sources.some(s=>s.id===r.sourceId&&!s.stale)));
  const recordLabel = (record: ReviewRecord, key: string, fallback = "—") => typeof record.payload[key] === "string" ? String(record.payload[key]) : fallback;

  function changeView(next: View) { setView(next); setNotice(""); setMobileNav(false); }
  function exportCsv() {
    const lines = [["Device", "IP address", "Site", "Category", "Country", "Vendor", "Status", "Description"], ...filteredDevices].map((row) => row.map((cell) => `"${(/^[=+@\t\r-]/.test(cell) ? "'" + cell : cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" })); link.download = "aiforce-geo-health.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  const pageTitle = view === "services" ? "AIForce.Ops Platform" : view === "value" ? "Value Dashboard" : view === "observability" ? "Observability" : view === "geo" ? "Geo Health" : view === "aiops" ? "AI Ops" : view === "executive" ? "Executive Summary" : view === "sources" ? "Data sources" : view === "vulnerabilities" ? "Vulnerability reports" : selectedService.title;
  const liveLabel = clock ? clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  const dataLabel = dataState === "connected" ? `PostgreSQL · ${records.length} readings` : dataState === "unavailable" ? "PostgreSQL unavailable" : "Connecting to PostgreSQL";

  return <div data-theme={dark ? "dark" : "light"} className={`review-workspace flex h-dvh min-h-[580px] flex-col overflow-hidden ${dark ? "bg-[#111a29] text-slate-100" : "bg-[#f5f6fb] text-slate-800"}`}>
    <header className="relative z-30 flex h-[68px] shrink-0 items-center gap-3 review-header px-4 shadow-sm sm:px-6">
      <button type="button" aria-label="Toggle menu" onClick={() => setMobileNav((v) => !v)} className="flex size-9 items-center justify-center rounded-lg review-header-action md:hidden">{mobileNav ? <X className="size-5"/> : <Menu className="size-5"/>}</button>
      <button type="button" onClick={() => changeView("services")} className="flex items-center gap-3 text-left"><span className="review-brand-icon"><Sparkles className="size-5"/></span><span className="text-[20px] font-semibold tracking-[-.05em]">AIForce.Ops</span><span className="hidden h-8 w-px bg-[#e1e6f0] sm:block"/><span className="hidden text-[11px] font-medium leading-4 sm:block">SaaS Service<br/>Review Center</span></button>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <span className="hidden items-center gap-2 rounded-full border border-[#e1e6f0] bg-[#fafbfe] px-3 py-1.5 text-[10px] sm:inline-flex"><span className="size-1.5 animate-pulse rounded-full bg-emerald-500"/>{dataLabel}</span>
        <button onClick={() => setDark((d) => !d)} title="Toggle appearance" className="flex size-9 items-center justify-center rounded-lg review-header-action">{dark ? <Sun className="size-4"/> : <Moon className="size-4"/>}</button>
        <button onClick={() => changeView("sources")} title="Help and data sources" className="hidden size-9 items-center justify-center rounded-lg review-header-action sm:flex"><CircleHelp className="size-[18px]"/></button>
        <WorkspaceUserMenu workspaceLinks={(["eAssist","ePACE"] as const).map(name=>({name,href:name==="eAssist"?"/service-review-center/eassist":"/service-review-center/epace",disabled:!member||!permitted(member,name==="eAssist"?"integrations":"knowledge"),reason:name==="eAssist"?"Admin access required":"Access unavailable"}))}/>
      </div>
    </header>
    <div className="relative flex min-h-0 flex-1">
      {mobileNav && <button aria-label="Close menu" onClick={() => setMobileNav(false)} className="absolute inset-0 z-20 bg-slate-950/30 md:hidden"/>}
      <aside className={`absolute inset-y-0 left-0 z-20 flex w-[238px] flex-col border-r ${dark ? "border-slate-700 bg-[#172235]" : "border-slate-200 bg-white"} transition-transform md:relative md:z-0 md:translate-x-0 ${mobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        <div className="border-b border-slate-100 px-4 py-4"><p className="text-[9px] font-semibold uppercase tracking-[.18em] text-slate-400">Workspace</p><div className="mt-2 flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Command className="size-4"/></div><div><p className="text-[11px] font-semibold">AIForce.Ops</p><p className="text-[9px] text-slate-400">Service Review Center</p></div></div></div>
        <nav aria-label="Service Review Center" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{navItems.map(({ id, name, icon: Icon }) => <button key={id} onClick={() => changeView(id)} aria-current={view === id ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[11px] font-medium transition ${view === id ? "bg-indigo-50 text-indigo-700" : dark ? "text-slate-300 hover:bg-slate-700/60" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="size-4"/>{name}</button>)}<div className="my-3 border-t border-slate-100"/><button onClick={() => changeView("geo")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[11px] font-medium ${view === "geo" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Globe2 className="size-4"/>Geo health</button><button onClick={() => changeView("details")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[11px] font-medium ${view === "details" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><BookOpenCheck className="size-4"/>Service details</button></nav>
        <div className="border-t border-slate-100 p-3"><div className={`rounded-xl p-3 ${dark ? "bg-slate-800" : "bg-slate-50"}`}><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500"/><p className="text-[10px] font-semibold">AIForce.Ops workspace</p></div><p className="mt-1.5 text-[9px] leading-4 text-slate-400">{dataState === "connected" ? `${records.length} PostgreSQL readings · checked ${checkedAt ? new Date(checkedAt).toLocaleTimeString() : "just now"}` : dataState === "unavailable" ? "PostgreSQL readings unavailable" : "Connecting to PostgreSQL readings…"}</p><WorkspaceLink href="/dashboard" destination="Agent Studio" className="mt-2 inline-flex items-center gap-1 text-[9px] font-medium text-indigo-600 hover:underline"><ArrowLeft aria-hidden="true" className="size-3"/>Back to Agent Studio</WorkspaceLink></div></div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className={`review-content mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 ${view === "services" ? "review-platform-page" : ""}`}>
          {view !== "services" && <button onClick={() => changeView("services")} className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 hover:text-indigo-700"><ArrowLeft className="size-3.5"/>Back to platform</button>}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.19em] text-indigo-600">{view === "services" ? "One integrated platform" : `${persona} view · service review center`}</p><h1 className={`mt-1.5 text-[25px] font-semibold tracking-[-.045em] ${dark ? "text-white" : "text-slate-900"}`}>{pageTitle}</h1><p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-slate-500">{view === "services" ? "Review your service portfolio, operational health, and business outcomes in one place." : view === "vulnerabilities" ? "Run project scans, review security evidence, and download CSV or Excel reports." : "Review operational and business value from readings stored in PostgreSQL."}</p></div><div className="flex items-center gap-2"><span className="hidden items-center gap-1.5 text-[9px] text-slate-400 sm:flex"><span className="size-1.5 animate-pulse rounded-full bg-indigo-500"/>Current time {liveLabel}</span>{view === "geo" && <button onClick={exportCsv} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-medium"><ArrowDownToLine className="size-3.5"/>Export</button>}</div></div>
          {organization && (view === "observability" || view === "executive") && <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm"><strong>Organization application health</strong><p className="mt-2 text-slate-500">{organization.scope} · {organization.attention} blocked or failed security events in the last 24 hours · {organization.runtimeAttention} active runtime signals</p></div>}{notice && <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[10px] text-indigo-800">{notice}</div>}
          {view !== "vulnerabilities" && <div className="review-connection-banner mb-5 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5 text-[9px] leading-4 text-[#6351e9]"><span className="font-semibold">Service data connection:</span> {dataState === "connected" ? records.length ? `Showing ${records.length} stored readings from ${sources.filter(s=>!s.stale).length} fresh sources. Updates every 5 seconds.` : "No service readings have been recorded for the organization yet. Connect a source in Data sources." : dataState === "unavailable" ? `${loadError || "Service readings could not be loaded."} Saved data has not been deleted. Retrying automatically.` : "Loading shared organization service readings…"}{dataState === "unavailable" && <button type="button" onClick={()=>{setLoadError("");setDataState("loading");setRefreshAttempt(n=>n+1);}} className="ml-3 font-semibold underline">Retry now</button>}</div>}

          
          {view === "services" && <><div className="review-platform-grid">{services.map((service) => { const Icon = service.icon; return <article key={service.title} className={`review-platform-card group flex flex-col rounded-2xl border transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg ${dark ? "border-slate-700 bg-[#172235]" : "border-slate-200 bg-white shadow-[0_2px_8px_rgba(21,40,70,.035)]"}`}><div className="flex size-10 items-center justify-center rounded-xl" style={{ color: dark ? "#b5a6ff" : service.color, backgroundColor: dark ? "#302747" : `${service.color}12` }}><Icon className="size-5"/></div><h2 className={`mt-4 text-[14px] font-semibold leading-5 ${dark?"text-white":"text-slate-800"}`}>{service.title}</h2><p className="mt-2 text-[10px] leading-[1.7] text-slate-500">{service.short}</p><div className="mt-auto border-t border-slate-100 pt-2.5"><button onClick={() => { setSelectedService(service); changeView("details"); }} className="flex w-full items-center justify-between py-1.5 text-left text-[10px] font-medium text-slate-600 hover:text-indigo-700">Learn more <ArrowRight className="size-3.5"/></button><button onClick={() => changeView(service.route)} className="flex w-full items-center justify-between border-t border-slate-100 py-1.5 text-left text-[10px] font-medium text-indigo-700 hover:text-indigo-900">View {service.route === "aiops" ? "automation" : service.route === "observability" ? "observability" : service.route === "executive" ? "executive summary" : "business value"} <ArrowRight className="size-3.5"/></button></div></article>; })}</div><footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-4 text-[9px] text-slate-400"><span>AIForce.Ops · Service Review Center</span><span>Workspace for {displayName}</span></footer></>}

          {view === "value" && <>{member?.role === "admin" && <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-slate-600">Business outcomes require source-defined readings. No savings, experience scores or compliance results are inferred from monitoring. Units and values below come directly from your collector. <button onClick={()=>changeView("sources")} className="font-medium text-indigo-700">Connect or import data →</button></div>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["experience","Experience score"],["automation","Automation index"],["financial","Verified savings"],["innovation","Innovation index"],["benchmarked","Benchmark index"],["sustainability","Sustainability index"],["techDebt","Technical debt reduction"],["csat","Customer satisfaction"]].map(([key,label])=><MetricCard key={key} label={label} value={metricValue(key)} color="#6552cf" history={metricHistory(key)} observed={records.find(r=>r.recordType==="metric"&&r.recordKey===key)}/>)}</div><p className="mt-4 text-xs text-slate-500">Charts show the latest 12 stored observations. Business readings retain their source timestamps and must be maintained by your external collector.</p></>}

          {view === "observability" && <OperationsOverview records={records} sources={sources} mode="observability"/>}

          {view === "geo" && <><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-[10px] text-slate-500">Country <ThemedSelect value={country} onChange={(e)=>setCountry(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] text-slate-700">{["All",...new Set(healthRecords.map((record)=>recordLabel(record,"country","" )).filter(Boolean))].map((name)=><option key={name}>{name}</option>)}</ThemedSelect></div><label className="flex h-9 min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search className="size-3.5 text-slate-400"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search geo health" className="w-full bg-transparent text-[10px] outline-none placeholder:text-slate-400"/></label></div><div className="mb-5 grid gap-3 lg:grid-cols-3">{([ ["Site","site"], ["Category","category"], ["Device","device"] ] as const).map(([title,key])=>{const group=new Map<string,string>(); for (const record of healthRecords){const label=recordLabel(record,key,"");if((country==="All"||recordLabel(record,"country")==country)&&label&&!group.has(label))group.set(label,recordLabel(record,"status"));} return <Panel key={title} title={`${title} health`}><div className="space-y-2">{[...group].slice(0,6).map(([name,status])=><div key={name} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0"><span className="text-[10px]">{name}</span><span className={`rounded px-2 py-1 text-[9px] font-semibold ${/down|error|critical|degraded/i.test(status)?"bg-rose-50 text-rose-700":"bg-indigo-50 text-indigo-700"}`}>{status}</span></div>)}{!group.size&&<p className="py-4 text-center text-[10px] text-slate-400">No matching health records.</p>}</div></Panel>})}</div><Panel title="Geo Health List"><GeoHealthTable records={healthRecords} country={country} search={search}/></Panel></>}

          {(view === "aiops" || view === "executive") && <OperationsOverview records={records} sources={sources} mode={view}/>}
          {view === "sources" && (member?.role === "manager" ? <ManagerSources sources={sources} worker={worker}/> : <DataSources sources={sources} worker={worker} onSync={async () => {const response=await fetch("/api/service-review-center/sync",{method:"POST"});const result=await response.json();if(!response.ok)throw new Error(result.error||"Sync failed.");setNotice(result.message);const readings=await fetch("/api/service-review-center/records",{cache:"no-store"});if(readings.ok){const body=await readings.json();setRecords(body.records);setSources(body.sources);}}}/>) }

          {view === "details" && <section className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Service catalogue</p><h2 className="mt-3 text-xl font-semibold">{selectedService.title}</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{selectedService.detail}</p><p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6">This catalogue describes the service area. Its dashboard uses the operational sources connected to this workspace. Endpoint management, compliance and business value require additional source readings; selecting a card does not provision a separate product.</p><div className="mt-5 flex flex-wrap gap-4"><button onClick={()=>changeView(selectedService.route)} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white">View related dashboard</button><button onClick={()=>changeView("sources")} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">Review data coverage</button></div></section>}

        </div>
      </main>
    </div>
    {member?.role==='admin'?<ReviewAssistant/>:member?.role==='manager'?<ManagerAssistant/>:null}
  </div>;
}
