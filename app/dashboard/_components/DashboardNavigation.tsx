"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavIcon({ name }: { name: "overview" | "templates" | "builder" | "agents" }) {
  const props = { viewBox: "0 0 24 24", fill: "none", className: "size-[18px]", "aria-hidden": true as const };
  if (name === "overview") return <svg {...props}><rect x="3.75" y="3.75" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="13.25" y="3.75" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="3.75" y="13.25" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M13.25 14h7M13.25 17h7M13.25 20h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  if (name === "templates") return <svg {...props}><rect x="3.75" y="3.75" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.6"/><rect x="13.25" y="3.75" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.6"/><rect x="3.75" y="13.25" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.6"/><rect x="13.25" y="13.25" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.6"/></svg>;
  if (name === "builder") return <svg {...props}><path d="M5 5.75h5.5v5.5H5zM13.5 5.75H19v5.5h-5.5zM5 14.25h5.5v4H5zM13.5 14.25H19v4h-5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  return <svg {...props}><path d="M4.5 6.75h15v12h-15zM8 6.75V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5v1.25M8 11h8M8 14.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function DashboardNavigation() {
  const pathname = usePathname();
  const links = [
    { name: "Product overview", href: "/dashboard", icon: "overview" as const },
    { name: "Templates", href: "/dashboard/templates", icon: "templates" as const },
  ];

  return (
    <nav aria-label="Main navigation" className="mt-8 px-4">
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workspace</p>
      <div className="mt-3 space-y-1">
        {links.map((link) => {
          const active = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[12px] font-medium transition ${active ? "border-indigo-400/10 bg-indigo-400/10 text-white shadow-sm" : "border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}>
              <span className={active ? "text-indigo-300" : "text-slate-500"}><NavIcon name={link.icon} /></span>{link.name}
              {link.name === "Templates" && <span className="ml-auto rounded-full bg-indigo-300/15 px-2 py-0.5 text-[9px] font-medium text-indigo-200">6</span>}
            </Link>
          );
        })}
      </div>
      <p className="mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Coming next</p>
      <div className="mt-3 space-y-1">
        {[
          { name: "Agent builder", icon: "builder" as const },
          { name: "My agents", icon: "agents" as const },
        ].map((item) => <div key={item.name} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] text-slate-600" aria-disabled="true"><NavIcon name={item.icon} /><span>{item.name}</span><span className="ml-auto text-[8px] uppercase tracking-wide text-slate-600">Planned</span></div>)}
      </div>
    </nav>
  );
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const current = pathname.startsWith("/dashboard/templates") ? "Templates" : "Product overview";
  return <div className="hidden items-center gap-2 text-[12px] text-slate-400 lg:flex"><span>AIForce.Ops</span><span className="text-slate-300">/</span><span className="font-medium text-slate-700">{current}</span></div>;
}

export function DashboardMobileNavigation() {
  const pathname = usePathname();
  const links = [
    { name: "Overview", href: "/dashboard" },
    { name: "Templates", href: "/dashboard/templates" },
  ];

  return (
    <nav aria-label="Workspace navigation" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-5 py-2.5 lg:hidden">
      {links.map((link) => {
        const active = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
        return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-[10px] font-medium ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{link.name}</Link>;
      })}
    </nav>
  );
}
