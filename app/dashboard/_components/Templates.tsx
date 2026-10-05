"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "All templates" | "Service operations" | "Environment" | "Business value" | "Integrations";

type TemplateItem = {
  id: string;
  name: string;
  description: string;
  category: Exclude<Category, "All templates">;
  capability: string;
  accent: "indigo" | "teal" | "amber" | "blue" | "violet" | "rose";
  icon: "pulse" | "globe" | "chart" | "spark" | "layers" | "plug";
  highlights: string[];
};

const categories: Category[] = [
  "All templates",
  "Service operations",
  "Environment",
  "Business value",
  "Integrations",
];

const templates: TemplateItem[] = [
  {
    id: "service-review",
    name: "Service review assistant",
    description: "Bring service health and business context into one concise review workflow.",
    category: "Service operations",
    capability: "Service Review Center",
    accent: "indigo",
    icon: "pulse",
    highlights: ["Service health context", "Event and incident review", "Human-readable summary"],
  },
  {
    id: "event-context",
    name: "Event context analyst",
    description: "Organize event details and supporting context for an operations review.",
    category: "Service operations",
    capability: "IEM",
    accent: "teal",
    icon: "spark",
    highlights: ["Event context", "Related service details", "Operator review point"],
  },
  {
    id: "environment-health",
    name: "Environment health review",
    description: "Review inventory and health signals across regions, sites, categories, and devices.",
    category: "Environment",
    capability: "Environment & Geo Health",
    accent: "blue",
    icon: "globe",
    highlights: ["Regional view", "Site and category health", "Device-level context"],
  },
  {
    id: "capacity-forecast",
    name: "Capacity forecast explainer",
    description: "Turn forecast bounds, regression signals, and outliers into a review-ready explanation.",
    category: "Environment",
    capability: "AI Ops",
    accent: "violet",
    icon: "chart",
    highlights: ["PROD, DEV, and QA context", "Forecast bounds", "Outlier review"],
  },
  {
    id: "business-value",
    name: "Business value briefing",
    description: "Bring value indices and their supporting measures together for a business review.",
    category: "Business value",
    capability: "Business Value Dashboard",
    accent: "amber",
    icon: "layers",
    highlights: ["Experience and automation", "Financial and innovation", "Metric-source reminders"],
  },
  {
    id: "https-api",
    name: "HTTPS API starter",
    description: "A starter outline for bringing an approved external API into a service workflow.",
    category: "Integrations",
    capability: "External integrations",
    accent: "rose",
    icon: "plug",
    highlights: ["API purpose and ownership", "Input and output outline", "Security review reminder"],
  },
];

const accentStyles: Record<TemplateItem["accent"], { soft: string; text: string; icon: string; glow: string }> = {
  indigo: { soft: "bg-indigo-50", text: "text-indigo-700", icon: "bg-indigo-100 text-indigo-600", glow: "from-indigo-100/80" },
  teal: { soft: "bg-teal-50", text: "text-teal-700", icon: "bg-teal-100 text-teal-600", glow: "from-teal-100/80" },
  amber: { soft: "bg-amber-50", text: "text-amber-700", icon: "bg-amber-100 text-amber-600", glow: "from-amber-100/80" },
  blue: { soft: "bg-sky-50", text: "text-sky-700", icon: "bg-sky-100 text-sky-600", glow: "from-sky-100/80" },
  violet: { soft: "bg-violet-50", text: "text-violet-700", icon: "bg-violet-100 text-violet-600", glow: "from-violet-100/80" },
  rose: { soft: "bg-rose-50", text: "text-rose-700", icon: "bg-rose-100 text-rose-600", glow: "from-rose-100/80" },
};

function TemplateIcon({ name, className = "size-5" }: { name: TemplateItem["icon"]; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  switch (name) {
    case "pulse":
      return <svg {...common}><path d="M3.5 12h3.2l2-5.2 4.3 10.4 2.2-5.2h5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M20.5 7.5v9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".45"/></svg>;
    case "globe":
      return <svg {...common}><circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6"/><path d="M3.9 12h16.2M12 3.75c2.1 2.3 3.15 5.05 3.15 8.25s-1.05 5.95-3.15 8.25C9.9 17.95 8.85 15.2 8.85 12S9.9 6.05 12 3.75Z" stroke="currentColor" strokeWidth="1.4"/></svg>;
    case "chart":
      return <svg {...common}><path d="M4 19.5h16M5.5 16.5l4-4.4 3 2.1 5.7-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 7.2h3.2v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "spark":
      return <svg {...common}><path d="m12 3 1.55 5.45L19 10l-5.45 1.55L12 17l-1.55-5.45L5 10l5.45-1.55L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" fill="currentColor"/></svg>;
    case "layers":
      return <svg {...common}><path d="m12 3.75 8.25 4.5L12 12.75 3.75 8.25 12 3.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="m4 12 8 4.35L20 12M4 15.75l8 4.5 8-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "plug":
      return <svg {...common}><path d="M8 7.5v5.25a4 4 0 0 0 8 0V7.5M6 7.5h4m4 0h4M10 4.25v3.5m4-3.5v3.5M12 16.75v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 20h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  }
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-[17px]" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.6"/><path d="m16 16 4.1 4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
}

function ArrowIcon({ className = "size-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function TemplatePreview({ item }: { item: TemplateItem }) {
  const stages = ["Context", "Analysis", "Output"];
  return (
    <div className={`relative overflow-hidden rounded-t-[18px] bg-gradient-to-br ${accentStyles[item.accent].glow} via-white to-[#f4f6fb] px-5 pb-4 pt-5`}>
      <div className="absolute -right-10 -top-14 size-36 rounded-full border border-white/70" />
      <div className="absolute -right-2 -top-8 size-24 rounded-full border border-white/70" />
      <div className="relative flex h-[102px] items-center justify-between gap-2">
        {stages.map((stage, index) => (
          <div key={stage} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 rounded-xl border border-white/90 bg-white/85 px-2.5 py-2 shadow-[0_5px_16px_rgba(35,48,76,0.05)] backdrop-blur-sm">
              <div className={`mb-2 flex size-6 items-center justify-center rounded-lg ${index === 1 ? accentStyles[item.accent].icon : "bg-slate-100 text-slate-500"}`}>
                {index === 1 ? <TemplateIcon name={item.icon} className="size-3.5" /> : <span className="text-[9px] font-bold">{index === 0 ? "01" : "03"}</span>}
              </div>
              <p className="truncate text-[9px] font-medium text-slate-600">{stage}</p>
            </div>
            {index < stages.length - 1 && <span className="shrink-0 text-slate-400"><ArrowIcon className="size-3.5" /></span>}
          </div>
        ))}
      </div>
      <div className="relative flex items-center justify-between border-t border-white/70 pt-3">
        <span className="text-[9px] font-medium uppercase tracking-[0.13em] text-slate-400">Example outline</span>
        <span className="flex items-center gap-1.5 text-[9px] text-slate-500"><span className="size-1.5 rounded-full bg-emerald-400" /> Draft concept</span>
      </div>
    </div>
  );
}

function TemplateCard({ item, selected, onPreview }: { item: TemplateItem; selected: boolean; onPreview: (item: TemplateItem) => void }) {
  const accent = accentStyles[item.accent];
  return (
    <article className="group flex flex-col overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(25,39,70,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_36px_rgba(25,39,70,0.09)]">
      <TemplatePreview item={item} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-[9px] font-semibold ${accent.soft} ${accent.text}`}>{item.category}</span>
              {selected && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700"><span className="size-1 rounded-full bg-emerald-500" />Selected</span>}
            </div>
            <h2 className="mt-3 text-[15px] font-semibold tracking-[-0.025em] text-slate-900">{item.name}</h2>
          </div>
          <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${accent.icon}`}><TemplateIcon name={item.icon} /></div>
        </div>
        <p className="mt-2 min-h-[40px] text-[11px] leading-[1.7] text-slate-500">{item.description}</p>
        <div className="mt-4 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
          <span className="size-1.5 rounded-full bg-slate-300" />{item.capability}
        </div>
        <button type="button" onClick={() => onPreview(item)} className="mt-5 flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3.5 text-[11px] font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
          Preview template <ArrowIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </article>
  );
}

export default function Templates() {
  const [activeCategory, setActiveCategory] = useState<Category>("All templates");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<TemplateItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((item) => {
      const matchesCategory = activeCategory === "All templates" || item.category === activeCategory;
      const matchesQuery = !query || `${item.name} ${item.description} ${item.category} ${item.capability}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, search]);

  const selectTemplate = (item: TemplateItem) => {
    setSelectedId(item.id);
    setPreview(null);
    setNotice(`${item.name} selected as your starting point.`);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-16 pt-8 sm:px-8 sm:pt-10 xl:px-11">
      <div className="mb-8 flex flex-col gap-5 border-b border-slate-200/80 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-indigo-600">
            <span className="size-1.5 rounded-full bg-indigo-500" />Workflow library
          </div>
          <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.045em] text-slate-950 sm:text-[34px]">Templates</h1>
          <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-slate-500">Start with a reusable outline for service reviews, operations analysis, and business reporting.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm sm:self-auto">
          <div className="flex -space-x-1.5">
            <span className="size-5 rounded-full border-2 border-white bg-indigo-200" />
            <span className="size-5 rounded-full border-2 border-white bg-teal-200" />
            <span className="size-5 rounded-full border-2 border-white bg-amber-200" />
          </div>
          <span className="text-[10px] font-medium text-slate-500">Curated for AIForce.Ops</span>
        </div>
      </div>

      <section aria-label="Template library" className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_3px_14px_rgba(25,39,70,0.025)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-slate-900">Explore starter templates</h2>
            <p className="mt-1 text-[11px] text-slate-500">Reference outlines based on the AIForce.Ops product areas.</p>
          </div>
          <label className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-[#fbfcfe] px-3.5 text-slate-400 transition focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 xl:max-w-[300px]">
            <SearchIcon />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" aria-label="Search templates" className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-400" />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5 border-b border-slate-100 pb-3" role="group" aria-label="Filter templates by category">
          {categories.map((category) => {
            const count = category === "All templates" ? templates.length : templates.filter((item) => item.category === category).length;
            const active = activeCategory === category;
            return (
              <button key={category} type="button" aria-pressed={active} onClick={() => setActiveCategory(category)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
                {category}<span className={`rounded-md px-1.5 py-0.5 text-[9px] ${active ? "bg-white/15 text-white/80" : "bg-slate-100 text-slate-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-[10px] text-slate-500"><span className="font-semibold text-slate-800">{visibleTemplates.length}</span> templates</p>
          <span className="hidden text-[10px] text-slate-400 sm:inline">Choose a template to inspect its outline</span>
        </div>

        {visibleTemplates.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {visibleTemplates.map((item) => <TemplateCard key={item.id} item={item} selected={selectedId === item.id} onPreview={setPreview} />)}
          </div>
        ) : (
          <div className="mt-4 flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm"><SearchIcon /></div>
            <h3 className="mt-3 text-[13px] font-semibold text-slate-800">No templates found</h3>
            <p className="mt-1 max-w-[280px] text-[11px] leading-5 text-slate-500">Try another search or choose a different category.</p>
            <button type="button" onClick={() => { setSearch(""); setActiveCategory("All templates"); }} className="mt-4 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">Clear filters</button>
          </div>
        )}
      </section>

      <div className="mt-5 flex flex-col gap-3 rounded-[16px] border border-indigo-100/80 bg-gradient-to-r from-indigo-50/80 via-white to-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600"><TemplateIcon name="spark" className="size-4" /></div>
          <div><p className="text-[11px] font-semibold text-slate-800">A starting point, not a fixed workflow</p><p className="mt-1 text-[10px] leading-5 text-slate-500">These examples are reference outlines. Data connections and agent behavior will be configured in the builder.</p></div>
        </div>
        <span className="shrink-0 self-start rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-[9px] font-medium text-indigo-600 sm:self-auto">6 starter outlines</span>
      </div>

      {notice && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-2.5rem)] items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3 text-[11px] font-medium text-white shadow-xl"><span className="flex size-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">✓</span>{notice}</div>}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="template-preview-title" className="w-full max-w-[520px] overflow-hidden rounded-[20px] border border-white/70 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="flex items-start gap-3.5">
                <div className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${accentStyles[preview.accent].icon}`}><TemplateIcon name={preview.icon} /></div>
                <div><p className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${accentStyles[preview.accent].text}`}>{preview.category}</p><h2 id="template-preview-title" className="mt-1 text-[17px] font-semibold tracking-[-0.025em] text-slate-900">{preview.name}</h2><p className="mt-1 text-[10px] text-slate-400">{preview.capability}</p></div>
              </div>
              <button autoFocus type="button" onClick={() => setPreview(null)} aria-label="Close template preview" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-500"><svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
            </div>
            <div className="px-6 py-5">
              <p className="text-[12px] leading-6 text-slate-600">{preview.description}</p>
              <h3 className="mt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Outline</h3>
              <ol className="mt-3 space-y-2.5">
                {preview.highlights.map((highlight, index) => (
                  <li key={highlight} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-3">
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold ${accentStyles[preview.accent].icon}`}>{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-[11px] font-medium text-slate-700">{highlight}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/60 px-3.5 py-3 text-[10px] leading-[1.6] text-amber-800">Starter concept only. Confirm data sources, metric definitions, and review rules before using it as a production workflow.</div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg px-3 py-2 text-[10px] font-semibold text-slate-500 hover:bg-white hover:text-slate-800">Close</button>
              <button type="button" onClick={() => selectTemplate(preview)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">Select as starting point<ArrowIcon className="size-3.5" /></button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
