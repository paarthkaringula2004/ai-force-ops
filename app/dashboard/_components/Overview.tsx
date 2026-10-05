"use client";

import { useMemo, useState } from "react";
import type { KnowledgeStatus, ProductMapItem, ProductOverviewModel } from "@/lib/product-overview";

const statusStyles: Record<KnowledgeStatus, string> = {
  Established: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Partially defined": "border-amber-200 bg-amber-50 text-amber-800",
  "Needs source detail": "border-slate-200 bg-slate-100 text-slate-600",
};

function StatusBadge({ status }: { status: KnowledgeStatus }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold ${statusStyles[status]}`}>{status}</span>;
}

function MapLayer({
  title,
  subtitle,
  items,
  elevation,
  selectedId,
  onSelect,
}: {
  title: string;
  subtitle: string;
  items: ProductMapItem[];
  elevation: number;
  selectedId: string;
  onSelect: (item: ProductMapItem) => void;
}) {
  return (
    <section
      className="relative rounded-2xl border border-white/[0.11] bg-[#111c32]/95 p-4 shadow-[0_18px_35px_rgba(1,8,22,0.22)] transition-transform duration-300 sm:p-5"
      style={{ transform: `translateZ(${elevation}px)` }}
      aria-label={title}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-white">{title}</p>
          <p className="mt-1 text-[9px] text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-[9px] font-medium text-slate-400">{items.length} items</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(item)}
              className={`group inline-flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${active ? "border-cyan-300/60 bg-cyan-300/[0.12] text-white shadow-[0_0_18px_rgba(103,232,249,0.12)]" : "border-white/[0.09] bg-[#0d172b] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"}`}
            >
              <span className={`size-1.5 rounded-full ${active ? "bg-cyan-200" : item.kind === "persona" ? "bg-violet-300/70" : item.kind === "capability" ? "bg-sky-300/70" : "bg-amber-300/70"}`} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProductMap({ model, selectedId, onSelect }: { model: ProductOverviewModel; selectedId: string; onSelect: (item: ProductMapItem) => void }) {
  const layers = [
    { title: "People & views", subtitle: "Who uses AIForce.Ops", items: model.personas, elevation: 72 },
    { title: "Platform capabilities", subtitle: "Names in the supplied platform taxonomy", items: model.capabilities, elevation: 38 },
    { title: "Product areas", subtitle: "What the source material says the product covers", items: model.productAreas, elevation: 4 },
  ];

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[#24334d] bg-[#081222] p-4 shadow-[0_24px_70px_rgba(12,25,49,0.20)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle at 19% 15%, rgba(81,113,200,.2), transparent 34%), radial-gradient(circle at 83% 75%, rgba(24,181,189,.12), transparent 28%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.32) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.32) 1px, transparent 1px)", backgroundSize: "28px 28px", maskImage: "linear-gradient(to bottom, black, transparent 92%)" }} />
      <div className="relative mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-cyan-200"><span className="size-1.5 rounded-full bg-cyan-300" />Interactive product map</div>
          <p className="mt-1.5 text-[10px] text-slate-400">Select any node to see what is established and what still needs a source decision.</p>
        </div>
        <span className="rounded-full border border-amber-200/15 bg-amber-200/[0.06] px-2.5 py-1.5 text-[8px] font-medium text-amber-100/80">Concept map · not runtime architecture</span>
      </div>

      <div className="relative [perspective:1400px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[7%] right-[7%] top-[18%] h-[65%] rounded-[32px] border border-cyan-200/[0.13] bg-gradient-to-br from-cyan-100/[0.06] via-indigo-300/[0.025] to-transparent shadow-[0_40px_70px_rgba(20,184,166,0.08)]"
          style={{ transform: "rotateX(58deg) rotateZ(-8deg) translateY(32px)" }}
        />
        <div className="relative space-y-3 [transform-style:preserve-3d] sm:space-y-3.5" style={{ transform: "rotateX(3deg) rotateY(-2deg)" }}>
          {layers.map((layer) => <MapLayer key={layer.title} {...layer} selectedId={selectedId} onSelect={onSelect} />)}
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-3 text-[9px] text-slate-500">
        <span>Layered view of the known product scope</span>
        <span className="flex items-center gap-3"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-violet-300" />People</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-300" />Capabilities</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-300" />Product areas</span></span>
      </div>
    </div>
  );
}

function DetailPanel({ item }: { item: ProductMapItem }) {
  return (
    <aside className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_4px_18px_rgba(25,39,70,0.035)] sm:p-6" aria-live="polite">
      <div className="flex items-center justify-between gap-3"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Selected · {item.kind}</p><StatusBadge status={item.status} /></div>
      <h2 className="mt-4 text-[19px] font-semibold leading-tight tracking-[-0.035em] text-slate-950">{item.name}</h2>
      <p className="mt-2 text-[11px] leading-[1.75] text-slate-500">{item.summary}</p>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold text-slate-800"><span className="size-1.5 rounded-full bg-emerald-500" />Established from source</h3>
        <ul className="mt-3 space-y-2">
          {item.established.map((fact) => <li key={fact} className="flex gap-2 text-[10px] leading-[1.65] text-slate-600"><span className="mt-[5px] size-1 shrink-0 rounded-full bg-emerald-400" />{fact}</li>)}
        </ul>
      </div>
      <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/70 p-3.5">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold text-amber-900"><span className="flex size-4 items-center justify-center rounded-full bg-amber-200/80 text-[9px]">?</span>Still to define</h3>
        <ul className="mt-2.5 space-y-2">
          {item.toConfirm.map((question) => <li key={question} className="flex gap-2 text-[10px] leading-[1.65] text-amber-900/75"><span className="mt-[5px] size-1 shrink-0 rounded-full bg-amber-400" />{question}</li>)}
        </ul>
      </div>
    </aside>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-5"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p><h2 className="mt-2 text-[20px] font-semibold tracking-[-0.035em] text-slate-950 sm:text-[23px]">{title}</h2><p className="mt-1.5 max-w-[690px] text-[11px] leading-5 text-slate-500">{description}</p></div>;
}

export default function Overview({ model }: { model: ProductOverviewModel }) {
  const allItems = useMemo(() => [...model.personas, ...model.capabilities, ...model.productAreas], [model]);
  const [selectedId, setSelectedId] = useState("iem");
  const selected = allItems.find((item) => item.id === selectedId) ?? model.productAreas[0];

  const selectItem = (item: ProductMapItem) => setSelectedId(item.id);

  return (
    <div className="mx-auto max-w-[1500px] px-5 pb-16 pt-8 sm:px-8 sm:pt-10 2xl:px-11">
      <section className="relative mb-8 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white px-5 py-6 shadow-[0_4px_20px_rgba(25,39,70,0.035)] sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-indigo-100/55 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[780px]">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-indigo-700"><span className="size-1.5 rounded-full bg-indigo-500" />Project map · first look</div>
            <h1 className="text-[28px] font-semibold leading-[1.12] tracking-[-0.05em] text-slate-950 sm:text-[36px]">What we’re building with <span className="text-indigo-600">AIForce.Ops</span></h1>
            <p className="mt-2 text-[11px] font-semibold tracking-[0.01em] text-indigo-700">{model.projectTagline}</p>
            <p className="mt-2 max-w-[720px] text-[12px] leading-6 text-slate-500 sm:text-[13px]">The source describes {model.productName} as a {model.productDescription}. It brings service operations, environment health, automation, and business value into views for the people who run and review those services.</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5 xl:min-w-[370px]">
            {[
              { value: model.personas.length, label: "personas / views", color: "bg-violet-500" },
              { value: model.capabilities.length, label: "capability labels", color: "bg-sky-500" },
              { value: model.productAreas.length, label: "product areas", color: "bg-amber-500" },
            ].map((stat) => <div key={stat.label} className="rounded-xl border border-slate-200/70 bg-[#fbfcff] px-3 py-3 sm:px-4"><span className={`mb-2 block size-1.5 rounded-full ${stat.color}`} /><p className="text-[20px] font-semibold tracking-[-0.04em] text-slate-900">{stat.value}</p><p className="mt-0.5 text-[8px] leading-4 text-slate-500 sm:text-[9px]">{stat.label}</p></div>)}
          </div>
        </div>
      </section>

      <section aria-label="Interactive product map" className="grid gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(310px,0.8fr)]">
        <ProductMap model={model} selectedId={selectedId} onSelect={selectItem} />
        <DetailPanel item={selected} />
      </section>

      <section className="mt-11">
        <SectionHeading eyebrow="The product scope" title="The parts of the service we’ll bring together" description="These are product areas from the supplied material. The cards summarize the source; they do not define technical service boundaries or claim that the workflows are already specified." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {model.productAreas.map((item, index) => (
            <button key={item.id} type="button" onClick={() => selectItem(item)} className={`group rounded-[16px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${selected.id === item.id ? "border-indigo-200 bg-indigo-50/50 shadow-sm" : "border-slate-200/80 bg-white hover:border-slate-300"}`}>
              <div className="flex items-center justify-between gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-[9px] font-semibold text-slate-500">0{index + 1}</span><StatusBadge status={item.status} /></div>
              <h3 className="mt-4 text-[13px] font-semibold tracking-[-0.02em] text-slate-900">{item.name}</h3>
              <p className="mt-1.5 min-h-[38px] text-[10px] leading-[1.7] text-slate-500">{item.summary}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-semibold text-indigo-600">See source boundary <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-11 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_4px_18px_rgba(25,39,70,0.025)] sm:p-6">
          <SectionHeading eyebrow="Suggested first backend slice" title={model.proposedFirstBackendSlice.title} description={model.proposedFirstBackendSlice.reason} />
          <div className="grid gap-2 sm:grid-cols-3">
            {model.proposedFirstBackendSlice.firstQuestions.map((question, index) => <div key={question} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"><span className="text-[9px] font-semibold text-indigo-600">STEP 0{index + 1}</span><p className="mt-2 text-[10px] leading-[1.65] text-slate-600">{question}</p></div>)}
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-indigo-50/70 px-3.5 py-3 text-[10px] leading-[1.6] text-indigo-900/80"><span className="mt-0.5 font-bold">i</span><span>This is a recommended starting slice, not a finalized product decision. Once the source lifecycle and metrics are confirmed, it can become the first PostgreSQL schema, SQL access patterns, and UI flow.</span></p>
        </div>

        <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_4px_18px_rgba(25,39,70,0.025)] sm:p-6">
          <SectionHeading eyebrow="Implementation foundation" title="The stack you chose" description="The core stack direction is agreed. PostgreSQL hosting, the database client, and authentication remain open decisions." />
          <div className="space-y-3">
            {model.technology.map((group) => <div key={group.area} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start"><p className="w-[115px] shrink-0 pt-1 text-[9px] font-semibold text-slate-500">{group.area}</p><div className="flex flex-wrap gap-1.5">{group.choices.map((choice) => <span key={choice} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-medium text-slate-600">{choice}</span>)}</div></div>)}
          </div>
          <div className="mt-4 rounded-lg border border-slate-100 bg-[#fbfcfe] px-3.5 py-3 text-[9px] leading-[1.6] text-slate-500">This overview is driven by a typed product catalog. The catalog is static reference data today; a PostgreSQL-backed source can replace it without changing the map’s display model.</div>
        </div>
      </section>

      <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200/80 pt-4 text-[9px] leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Source boundary: referenced project conversation and supplied architecture summary.</span>
        <span>Example screenshot values are not shown as live business metrics.</span>
      </footer>
    </div>
  );
}
