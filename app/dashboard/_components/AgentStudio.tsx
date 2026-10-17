"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import {
    BookOpen,
    Box,
    ChartNoAxesColumnIncreasing,
    CircleHelp,
    Expand,
    CalendarDays,
    CreditCard,
    FileText,
    Gauge,
    Menu,
    Settings,
    Sparkles,
    Users,
    Wrench,
} from "lucide-react";
import { Administration, WorkspaceRequests } from "./WorkspaceRoles";
import { permitted, requiredPermission, type WorkspaceAccess } from "@/lib/workspace-permissions";
import AgentManager from "./AgentManager";
import MeetingRooms from "./MeetingRooms";
import { WorkspaceRequestNotifications } from "./RequestNotifications";
import { WorkspaceMeetingNotifications } from "./MeetingInvitations";
import MyCustomization from "./MyCustomization";
import PlaygroundView from "./PlaygroundView";
import { WorkspaceSection } from "./WorkspaceSections";
import WorkspaceUserMenu from "@/components/auth/WorkspaceUserMenu";
import WorkspaceLink from "@/components/workspace-link";
import { authClient } from "@/lib/auth-client";
import {
    activateWorkspaceApiCache,
    clearWorkspaceApiData,
    invalidateWorkspaceApiData,
} from "@/lib/workspace-api-cache";

type Section =
    | "Meeting Rooms"
    | "My Customization"
    | "My Requests"
    | "Team Requests"
    | "Administration"
    | "Playground"
    | "Agents"
    | "Tool Library"
    | "Knowledge Management"
    | "General Instructions"
    | "Models"
    | "Settings"
    | "Usage"
    | "Token Calculator"
    | "Payments";
type SectionItem = { name: Section; icon: ComponentType<{ className?: string }> };

const navigation: SectionItem[] = [
    { name: "Playground", icon: Gauge },
    { name: "My Requests", icon: FileText },
    { name: "Meeting Rooms", icon: CalendarDays },
    { name: "Team Requests", icon: Users },
    { name: "Administration", icon: Settings },
    { name: "My Customization", icon: FileText },
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
    "Meeting Rooms": "meetingRooms",
    "My Requests": "requests",
    "Team Requests": "requests",
    Administration: "administration",
    "My Customization": "administration",
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
    if (pathname === "/dashboard/tools" || pathname === "/dashboard/tool-library")
        return "Tool Library";
    return navigation.find((item) => sectionPath(item.name) === pathname)?.name;
}

export default function AgentStudio({
    initialSection = "Playground",
}: {
    initialSection?: Section;
}) {
    const pathname = usePathname();
    const { data: session, isPending: sessionPending } = authClient.useSession();
    const userId = session?.user?.id;
    const [member, setMember] = useState<WorkspaceAccess | null>(null);
    const [accessError, setAccessError] = useState("");
    const [accessRetry, setAccessRetry] = useState(0);
    const currentMember = member?.user_id === userId ? member : null;
    const allowed = (name: Section) =>
        Boolean(currentMember && permitted(currentMember, requiredPermission(sectionPath(name))));
    useEffect(() => {
        if (!userId) return;
        const controller = new AbortController();
        const load = () =>
            fetch("/api/workspace/access", { cache: "no-store", signal: controller.signal })
                .then(async (r) => {
                    const data = await r.json();
                    if (!r.ok) throw new Error(data.error || "Could not verify access.");
                    return data;
                })
                .then((data) => {
                    setMember(data.member);
                    setAccessError("");
                })
                .catch((e) => {
                    if (!controller.signal.aborted)
                        setAccessError(
                            e instanceof TypeError
                                ? "The workspace connection was interrupted. Try again to reconnect."
                                : e.message,
                        );
                });
        void load();
        const timer = window.setInterval(() => void load(), 20000);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [userId, accessRetry]);
    if (userId) activateWorkspaceApiCache(userId);
    else if (!sessionPending) clearWorkspaceApiData();
    const activeSection = sectionFromPath(pathname) ?? initialSection;

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [configurationOpen, setConfigurationOpen] = useState(false);
    const lastSeenUpdates = useRef<Partial<Record<Section, string>>>({});
    const hydratedUpdatesFor = useRef<string | null>(null);
    const latestUpdates = useRef<Partial<Record<Section, string>>>({});

    useEffect(() => {
        if (!userId) return;
        const controller = new AbortController();
        const storageKey = `aiforce-dashboard-updates:${userId}`;
        if (hydratedUpdatesFor.current !== userId) {
            try {
                const saved = localStorage.getItem(storageKey);
                lastSeenUpdates.current = saved
                    ? (JSON.parse(saved) as Partial<Record<Section, string>>)
                    : {};
            } catch {
                lastSeenUpdates.current = {};
            }
            hydratedUpdatesFor.current = userId;
        }

        async function checkUpdates() {
            try {
                const response = await fetch("/api/dashboard/updates", {
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!response.ok) return;
                const result = (await response.json()) as {
                    updates?: Record<string, string | null>;
                };
                const seen = lastSeenUpdates.current;

                for (const item of navigation) {
                    const key = updateKeys[item.name];
                    const latest = result.updates?.[key] ?? null;
                    if (!latest) continue;
                    latestUpdates.current[item.name] = latest;
                    const previous = seen[item.name];
                    if (!previous) {
                        seen[item.name] = latest;
                    } else if (latest > previous) {
                        invalidateWorkspaceApiData(item.name);
                    }
                }

                localStorage.setItem(storageKey, JSON.stringify(seen));
            } catch {
                // Keep the cached data when the update check is temporarily unavailable.
            }
        }

        void checkUpdates();
        const timer = window.setInterval(() => void checkUpdates(), 5_000);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [userId]);

    async function toggleFullscreen() {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
    }

    function navigate(name: Section) {
        const latest = latestUpdates.current[name];
        if (latest && userId) {
            lastSeenUpdates.current[name] = latest;
            localStorage.setItem(
                `aiforce-dashboard-updates:${userId}`,
                JSON.stringify(lastSeenUpdates.current),
            );
        }
        setMobileNavOpen(false);
        if (name === "Playground") {
            setConfigurationOpen(false);
        }
        const destination = sectionPath(name);
        if (window.location.pathname !== destination)
            window.history.pushState(null, "", destination);
    }

    return (
        <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-white text-[#202631]">
            <header className="relative z-30 flex h-[62px] shrink-0 items-center border-b border-[#e7e9ed] bg-white px-4 sm:px-5">
                <button
                    type="button"
                    aria-label="Toggle navigation"
                    onClick={() => {
                        if (window.matchMedia("(min-width: 768px)").matches)
                            setSidebarCollapsed((current) => !current);
                        else setMobileNavOpen((current) => !current);
                    }}
                    className="mr-3 flex size-9 items-center justify-center rounded-lg text-[#536072] transition hover:bg-[#f3f4f7] hover:text-[#282f3c]"
                >
                    <Menu className="size-[18px]" />
                </button>
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#6255e8] text-white shadow-sm shadow-indigo-900/15">
                        <Sparkles className="size-[17px]" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold tracking-[-0.025em] text-[#202631]">
                            {currentMember?.role === "admin"
                                ? "Admin Workspace"
                                : currentMember?.role === "manager"
                                  ? "Manager Workspace"
                                  : currentMember?.role === "user"
                                    ? "Agent Studio"
                                    : currentMember
                                      ? "Employee Workspace"
                                      : "Checking access…"}
                        </div>
                        <div className="hidden text-[10px] text-[#8992a2] sm:block">
                            AIForce.Ops
                        </div>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-1 sm:gap-2">
                    <span
                        title={
                            currentMember?.role === "employee"
                                ? "Daily reset to 50 tickets · IST"
                                : currentMember?.role === "manager"
                                  ? "Daily reset to 100 tickets · IST"
                                  : "Ticket allowance"
                        }
                        className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-[#e6e8ee] bg-[#fafbfc] px-2.5 py-1 text-[10px] font-medium text-[#6255e8]"
                    >
                        {currentMember?.role === "admin"
                            ? "Tickets: Unlimited"
                            : currentMember
                              ? `Tickets: ${currentMember.ticket_balance ?? 0}`
                              : "Loading tickets…"}
                    </span>
                    <button
                        type="button"
                        aria-label="Language"
                        className="hidden h-9 min-w-10 items-center justify-center rounded-lg px-2 text-[12px] font-medium text-[#586274] hover:bg-[#f4f5f7] sm:flex"
                    >
                        en
                    </button>
                    <button
                        type="button"
                        aria-label="Toggle fullscreen"
                        title="Toggle fullscreen"
                        onClick={toggleFullscreen}
                        className="hidden size-9 items-center justify-center rounded-lg text-[#626c7c] transition hover:bg-[#f3f4f7] hover:text-[#292f3b] sm:flex"
                    >
                        <Expand className="size-[18px]" />
                    </button>
                    {activeSection === "Playground" &&
                        currentMember &&
                        permitted(currentMember, "agent_studio") && (
                            <button
                                type="button"
                                aria-label="Toggle configurations"
                                title="Toggle configurations"
                                onClick={() => setConfigurationOpen((open) => !open)}
                                className="flex size-9 items-center justify-center rounded-lg text-[#626c7c] transition hover:bg-[#f3f4f7] hover:text-[#292f3b]"
                            >
                                <Settings className="size-[18px]" />
                            </button>
                        )}
                    <button
                        type="button"
                        aria-label="Help"
                        title="Help"
                        className="hidden size-9 items-center justify-center rounded-lg text-[#626c7c] transition hover:bg-[#f3f4f7] hover:text-[#292f3b] sm:flex"
                    >
                        <CircleHelp className="size-[18px]" />
                    </button>
                    <WorkspaceUserMenu />
                </div>
            </header>

            <div className="relative flex min-h-0 flex-1 overflow-hidden">
                {mobileNavOpen && (
                    <button
                        aria-label="Close navigation"
                        onClick={() => setMobileNavOpen(false)}
                        className="absolute inset-0 z-20 bg-slate-950/25 md:hidden"
                    />
                )}
                <aside
                    className={`absolute inset-y-0 left-0 z-20 flex shrink-0 flex-col border-r border-[#e8eaf0] bg-[#fbfbfc] transition-[width,transform] duration-200 md:relative md:z-0 md:translate-x-0 ${sidebarCollapsed ? "md:w-[76px]" : "md:w-[220px] lg:w-[252px]"} ${mobileNavOpen ? "w-[274px] translate-x-0 shadow-2xl md:shadow-none" : "w-[274px] -translate-x-full md:translate-x-0"}`}
                >
                    <nav
                        aria-label="Agent Studio navigation"
                        className="flex-1 overflow-y-auto px-3 py-5"
                    >
                        <div className="space-y-1">
                            {navigation
                                .filter((item) => allowed(item.name))
                                .map(({ name, icon: Icon }) => {
                                    const active = activeSection === name;
                                    return (
                                        <button
                                            key={name}
                                            type="button"
                                            title={sidebarCollapsed ? name : undefined}
                                            aria-current={active ? "page" : undefined}
                                            onClick={() => navigate(name)}
                                            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-[10px] text-left text-[13px] transition ${active ? "bg-[#efedff] font-medium text-[#5347d6]" : "text-[#586274] hover:bg-[#f0f1f4] hover:text-[#252c38]"} ${sidebarCollapsed ? "md:justify-center md:px-0" : ""}`}
                                        >
                                            <span
                                                className={`shrink-0 ${active ? "text-[#6255e8]" : "text-[#737d8d] group-hover:text-[#505a6b]"}`}
                                            >
                                                <Icon className="size-[18px]" />
                                            </span>
                                            <span className={sidebarCollapsed ? "md:hidden" : ""}>
                                                {name}
                                            </span>
                                        </button>
                                    );
                                })}
                        </div>
                    </nav>
                    <div className="space-y-2 border-t border-[#e8eaf0] p-4">
                        {currentMember &&
                            currentMember.role !== "user" &&
                            (
                                [
                                    {
                                        permission: "operations",
                                        href: "/service-review-center",
                                        label: "Review Center",
                                        caption: "Service reviews and operations",
                                        denied: "Manager and Admin access",
                                        icon: Gauge,
                                    },
                                    {
                                        permission: "knowledge",
                                        href: "/service-review-center/epace",
                                        label: "ePACE",
                                        caption: "Knowledge and project workspace",
                                        denied: "Employment confirmation required",
                                        icon: BookOpen,
                                    },
                                ] as const
                            )
                                .filter((item) =>
                                    currentMember.role === "employee"
                                        ? item.permission === "knowledge"
                                        : item.permission === "operations",
                                )
                                .map(({ permission, href, label, caption, denied, icon: Icon }) => {
                                    const enabled = permitted(currentMember, permission);
                                    const content = (
                                        <>
                                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#efedff] text-[#6255e8]">
                                                <Icon className="size-[18px]" />
                                            </span>
                                            <span className={sidebarCollapsed ? "md:hidden" : ""}>
                                                <span className="block text-xs font-medium text-[#29364b]">
                                                    {label}
                                                </span>
                                                <span className="mt-1 block text-[10px] leading-4 text-[#8992a6]">
                                                    {enabled ? caption : denied}
                                                </span>
                                            </span>
                                        </>
                                    );
                                    const className = `flex items-center gap-3 rounded-xl bg-white p-3 transition ${sidebarCollapsed ? "md:justify-center md:px-0" : ""}`;
                                    return enabled ? (
                                        <WorkspaceLink
                                            key={href}
                                            href={href}
                                            destination={label}
                                            title={label}
                                            className={`${className} hover:bg-[#efedff]`}
                                        >
                                            {content}
                                        </WorkspaceLink>
                                    ) : (
                                        <div
                                            key={href}
                                            aria-disabled="true"
                                            title={denied}
                                            className={`${className} cursor-not-allowed opacity-60`}
                                        >
                                            {content}
                                        </div>
                                    );
                                })}
                    </div>
                </aside>

                <main className="relative flex min-w-0 flex-1 overflow-hidden bg-white">
                    {currentMember?.active &&
                        ["admin", "manager"].includes(currentMember.role) &&
                        userId && <WorkspaceRequestNotifications key={userId} userId={userId} />}
                    {currentMember?.active && userId && (
                        <WorkspaceMeetingNotifications key={userId} userId={userId} />
                    )}
                    {accessError ? (
                        <div
                            role="alert"
                            className="m-8 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-700"
                        >
                            <p>{accessError}</p>
                            <button
                                className="mt-3 rounded-xl border border-rose-200 bg-white px-4 py-2 font-semibold"
                                onClick={() => {
                                    setAccessError("");
                                    setAccessRetry((value) => value + 1);
                                }}
                            >
                                Try again
                            </button>
                        </div>
                    ) : !currentMember ? (
                        <p className="p-8 text-sm text-slate-500">Checking workspace access…</p>
                    ) : !allowed(activeSection) ? (
                        <p className="p-8">
                            Your role does not permit this workspace. Open Playground.
                        </p>
                    ) : activeSection === "My Customization" ? (
                        <MyCustomization />
                    ) : activeSection === "Administration" ? (
                        <Administration />
                    ) : activeSection === "Team Requests" || activeSection === "My Requests" ? (
                        currentMember ? (
                            <WorkspaceRequests
                                member={currentMember}
                                personal={activeSection === "My Requests"}
                            />
                        ) : (
                            <p className="p-8">Checking permissions…</p>
                        )
                    ) : activeSection === "Meeting Rooms" ? (
                        <MeetingRooms />
                    ) : activeSection === "Agents" ? (
                        <AgentManager />
                    ) : activeSection === "Playground" ? (
                        <PlaygroundView
                            configurationOpen={Boolean(
                                currentMember &&
                                permitted(currentMember, "agent_studio") &&
                                configurationOpen,
                            )}
                        />
                    ) : (
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <WorkspaceSection section={activeSection} />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
