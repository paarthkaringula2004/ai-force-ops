"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BookOpen, Box, ChartNoAxesColumnIncreasing, CircleHelp, Expand,
  CreditCard, FileText, Gauge, Menu, Settings, Sparkles, Users, Wrench,
} from "lucide-react";
import AgentManager from "./AgentManager";
import PlaygroundView from "./PlaygroundView";
import { WorkspaceSection } from "./WorkspaceSections";
import WorkspaceUserMenu from "@/components/auth/WorkspaceUserMenu";
import { authClient } from "@/lib/auth-client";
import { activateWorkspaceApiCache, clearWorkspaceApiData, invalidateWorkspaceApiData, preloadWorkspaceApiData } from "@/lib/workspace-api-cache";

type Section = "Playground" | "Agents" | "Tool Library" | "Knowledge Management" | "General Instructions" | "Models" | "Settings" | "Usage" | "Token Calculator" | "Payments";
type SectionItem = { name: Section; icon: ComponentType<{ className?: string }> };

const navigation: SectionItem[] = [
  { name: "Playground", icon: Gauge },
  { name: "Agents", icon: Users },
  { name: "Tool Library", icon: Wrench },
  { name: "Knowledge Management", icon: BookOpen },
  { name: "General Instructions", icon: FileText },
  { name: "Models", icon: Box },
  { name: "Settings", icon: Settings },
  { name: "Usage", icon: ChartNoAxesColumnIncreasing },
  { name: "Token Calculator", icon: Sparkles },
  { name: "Payments", icon: CreditCard },
];

const updateKeys: Record<Section, string> = {
  Playground: "playground",
  Agents: "agents",
  "Tool Library": "tools",
  "Knowledge Management": "knowledge",
  "General Instructions": "instructions",
  Models: "models",
  Settings: "settings",
  Usage: "usage",
  "Token Calculator": "tokenCalculator",
  Payments: "payments",
};

function sectionPath(name: Section) {
  if (name === "Playground") return "/dashboard";
  if (name === "Agents") return "/dashboard/agents";
  if (name === "Tool Library") return "/dashboard/tools";
  return `/dashboard/${name.toLowerCase().replaceAll(" ", "-")}`;
}

function sectionFromPath(pathname: string): Section | undefined {
  if (pathname === "/dashboard") return "Playground";
  if (pathname === "/dashboard/agents") return "Agents";
  if (pathname === "/dashboard/tools" || pathname === "/dashboard/tool-library") return "Tool Library";
  return navigation.find((item) => sectionPath(item.name) === pathname)?.name;
}

export default function AgentStudio({ initialSection = "Playground" }: { initialSection?: Section }) {
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user?.id;
  if (userId) activateWorkspaceApiCache(userId);
  else if (!sessionPending) clearWorkspaceApiData();
  const activeSection = sectionFromPath(pathname) ?? initialSection;
  const [unreadSections, setUnreadSections] = useState<Set<Section>>(() => new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(true);
  const [databaseStatus, setDatabaseStatus] = useState<"checking" | "connected" | "unavailable">("checking");
  const lastSeenUpdates = useRef<Partial<Record<Section, string>>>({});
  const hydratedUpdatesFor = useRef<string | null>(null);
  const latestUpdates = useRef<Partial<Record<Section, string>>>({});

  useEffect(() => {
    if (userId) preloadWorkspaceApiData();
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    const check = () => fetch("/api/health", { signal: controller.signal }).then((response) => response.json()).then((data) => setDatabaseStatus(data.database === "connected" ? "connected" : "unavailable")).catch(() => { if (!controller.signal.aborted) setDatabaseStatus("unavailable"); });
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const storageKey = `aiforce-dashboard-updates:${userId}`;
    if (hydratedUpdatesFor.current !== userId) {
      try {
        const saved = localStorage.getItem(storageKey);
        lastSeenUpdates.current = saved ? JSON.parse(saved) as Partial<Record<Section, string>> : {};
      } catch {
        lastSeenUpdates.current = {};
      }
      hydratedUpdatesFor.current = userId;
      setUnreadSections(new Set());
    }

    async function checkUpdates() {
      try {
        const response = await fetch("/api/dashboard/updates", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json() as { updates?: Record<string, string | null> };
        const seen = lastSeenUpdates.current;
        const changed: Section[] = [];
        for (const item of navigation) {
          const key = updateKeys[item.name];
          const latest = result.updates?.[key] ?? null;
          if (!latest) continue;
          latestUpdates.current[item.name] = latest;
          const previous = seen[item.name];
          if (!previous) {
            seen[item.name] = latest;
          } else if (latest > previous) {
            changed.push(item.name);
            invalidateWorkspaceApiData(item.name);
          }
        }
        if (changed.length) setUnreadSections((current) => new Set([...current, ...changed]));
        localStorage.setItem(storageKey, JSON.stringify(seen));
      } catch {
        // Keep the last known indicators when the update check is temporarily unavailable.
      }
    }

    void checkUpdates();
    const timer = window.setInterval(() => void checkUpdates(), 5_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [userId]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  function navigate(name: Section) {
    setUnreadSections((current) => { const next = new Set(current); next.delete(name); return next; });
    const latest = latestUpdates.current[name];
    if (latest && userId) {
      lastSeenUpdates.current[name] = latest;
      localStorage.setItem(`aiforce-dashboard-updates:${userId}`, JSON.stringify(lastSeenUpdates.current));
    }
    setMobileNavOpen(false);
    if (name === "Playground") {
      setConfigurationOpen(true);
    }
    const destination = sectionPath(name);
    if (window.location.pathname !== destination) window.history.pushState(null, "", destination);
  }

  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-white text-[#202631]">
      <header className="relative z-30 flex h-[62px] shrink-0 items-center border-b border-[#e7e9ed] bg-white px-4 sm:px-5">
        <button type="button" aria-label="Toggle navigation" onClick={() => { if (window.matchMedia("(min-width: 768px)").matches) setSidebarCollapsed((current) => !current); else setMobileNavOpen((current) => !current); }} className="mr-3 flex size-9 items-center justify-center rounded-lg text-[#536072] transition hover:bg-[#f3f4f7] hover:text-[#282f3c]"><Menu className="size-[18px]" /></button>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#6255e8] text-white shadow-sm shadow-indigo-900/15"><Sparkles className="size-[17px]" /></div>
          <div className="min-w-0"><div className="truncate text-[15px] font-semibold tracking-[-0.025em] text-[#202631]">Agent Studio</div><div className="hidden text-[10px] text-[#8992a2] sm:block">AIForce.Ops</div></div>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span title="Database connection status" className="mr-1 hidden items-center gap-1.5 rounded-full border border-[#e6e8ee] bg-[#fafbfc] px-2.5 py-1 text-[10px] font-medium text-[#758094] sm:inline-flex"><span className={`size-1.5 rounded-full ${databaseStatus === "connected" ? "bg-[#49b78e]" : databaseStatus === "unavailable" ? "bg-rose-500" : "bg-amber-400"}`} />{databaseStatus === "connected" ? "PostgreSQL connected" : databaseStatus === "unavailable" ? "PostgreSQL unavailable" : "Checking database"}</span>
          <button type="button" aria-label="Language" className="hidden h-9 min-w-10 items-center justify-center rounded-lg px-2 text-[12px] font-medium text-[#586274] hover:bg-[#f4f5f7] sm:flex">en</button>
          <button type="button" aria-label="Toggle fullscreen" title="Toggle fullscreen" onClick={toggleFullscreen} className="hidden size-9 items-center justify-center rounded-lg text-[#626c7c] transition hover:bg-[#f3f4f7] hover:text-[#292f3b] sm:flex"><Expand className="size-[18px]" /></button>
          {activeSection === "Playground" && <button type="button" aria-label="Toggle configurations" title="Toggle configurations" onClick={() => setConfigurationOpen((open) => !open)} className="flex size-9 items-center justify-center rounded-lg text-[#626c7c] transition hover:bg-[#f3f4f7] hover:text-[#292f3b]"><Settings className="size-[18px]" /></button>}
          <button type="button" aria-label="Help" title="Help" className="hidden size-9 items-center justify-center rounded-lg text-[#626c7c] transition hover:bg-[#f3f4f7] hover:text-[#292f3b] sm:flex"><CircleHelp className="size-[18px]" /></button>
          <WorkspaceUserMenu />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {mobileNavOpen && <button aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 z-20 bg-slate-950/25 md:hidden" />}
        <aside className={`absolute inset-y-0 left-0 z-20 flex shrink-0 flex-col border-r border-[#e8eaf0] bg-[#fbfbfc] transition-[width,transform] duration-200 md:relative md:z-0 md:translate-x-0 ${sidebarCollapsed ? "md:w-[76px]" : "md:w-[220px] lg:w-[252px]"} ${mobileNavOpen ? "w-[274px] translate-x-0 shadow-2xl md:shadow-none" : "w-[274px] -translate-x-full md:translate-x-0"}`}>
          <nav aria-label="Agent Studio navigation" className="flex-1 overflow-y-auto px-3 py-5"><div className="space-y-1">
            {navigation.map(({ name, icon: Icon }) => {
              const active = activeSection === name;
              return <button key={name} type="button" title={sidebarCollapsed ? name : undefined} aria-current={active ? "page" : undefined} onClick={() => navigate(name)} className={`group flex w-full items-center gap-3 rounded-lg px-3 py-[10px] text-left text-[13px] transition ${active ? "bg-[#efedff] font-medium text-[#5347d6]" : "text-[#586274] hover:bg-[#f0f1f4] hover:text-[#252c38]"} ${sidebarCollapsed ? "md:justify-center md:px-0" : ""}`}>
                <span className={`shrink-0 ${active ? "text-[#6255e8]" : "text-[#737d8d] group-hover:text-[#505a6b]"}`}><Icon className="size-[18px]" /></span><span className={sidebarCollapsed ? "md:hidden" : ""}>{name}</span>{unreadSections.has(name) && <span aria-label="New updates" title="New updates" className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-[#e45a67]" />}
              </button>;
            })}
          </div></nav>
          <div className={`border-t border-[#e8eaf0] p-4 ${sidebarCollapsed ? "md:px-2" : ""}`}><Link href="/service-review-center" title="Open Service Review Center" className={`group flex items-center gap-3 rounded-xl bg-white p-2.5 transition hover:bg-[#f4f3ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#766ce1] ${sidebarCollapsed ? "md:justify-center md:p-1" : ""}`}><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eceaff] text-[10px] font-semibold text-[#594de0] group-hover:bg-[#e4e1ff]">AO</div><div className={sidebarCollapsed ? "md:hidden" : ""}><div className="text-[11px] font-medium text-[#343c49]">AIForce.Ops</div><div className="mt-0.5 text-[10px] text-[#8992a2]">Service Review Center · PostgreSQL</div></div></Link></div>
        </aside>

        <main className="relative flex min-w-0 flex-1 overflow-hidden bg-white">
          {activeSection === "Agents" ? <AgentManager /> : activeSection === "Playground" ? <PlaygroundView configurationOpen={configurationOpen} /> : <div className="min-h-0 flex-1 overflow-y-auto"><WorkspaceSection section={activeSection} /></div>}
        </main>
      </div>
    </div>
  );
}
