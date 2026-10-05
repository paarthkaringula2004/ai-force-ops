import Link from "next/link";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Bot,
  Boxes,
  CircleCheck,
  GitBranch,
  Globe2,
  Layers3,
  Sparkles,
  Workflow,
} from "lucide-react";

const capabilityGroups = [
  { name: "IFSO", detail: "Platform domain", icon: Activity },
  { name: "AISM", detail: "Platform domain", icon: Layers3 },
  { name: "ISOA", detail: "Platform domain", icon: Boxes },
  { name: "AEM", detail: "Platform domain", icon: Workflow },
  { name: "P&C", detail: "Platform domain", icon: GitBranch },
  { name: "V&I", detail: "Platform domain", icon: Globe2 },
];

export default function HomePage() {
  const workspaceActionHref = "/dashboard";
  const workspaceActionLabel = "Open workspace";
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfcff] text-[#202631]">
      <header className="relative z-10 mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 sm:px-9 lg:px-12">
        <Link href="/" aria-label="AIForce.Ops home" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[13px] bg-[#6255e8] text-white shadow-[0_8px_20px_rgba(98,85,232,0.22)]"><Sparkles className="size-5" /></span>
          <span><span className="block text-[15px] font-semibold tracking-[-0.03em]">AIForce.Ops</span><span className="mt-0.5 block text-[10px] text-[#818a9a]">Intelligent Service Operations</span></span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
          <a href="#platform" className="hidden rounded-lg px-3 py-2 text-[12px] font-medium text-[#697386] transition hover:bg-[#f1f2f8] hover:text-[#343b49] sm:inline-flex">Platform</a>
          <a href="#capabilities" className="hidden rounded-lg px-3 py-2 text-[12px] font-medium text-[#697386] transition hover:bg-[#f1f2f8] hover:text-[#343b49] sm:inline-flex">Capabilities</a>
          <Link href="/sign-in" className="hidden rounded-lg px-3 py-2 text-[12px] font-medium text-[#697386] transition hover:bg-[#f1f2f8] hover:text-[#343b49] sm:inline-flex">Sign in</Link>
          <Link href="/sign-up" className="hidden rounded-lg px-3 py-2 text-[12px] font-medium text-[#697386] transition hover:bg-[#f1f2f8] hover:text-[#343b49] sm:inline-flex">Create account</Link>
          <Link href={workspaceActionHref} className="inline-flex items-center gap-2 rounded-lg bg-[#6255e8] px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#5146d2]">{workspaceActionLabel}<ArrowRight className="size-3.5" /></Link>
        </nav>
      </header>

      <section id="platform" className="relative mx-auto grid max-w-[1320px] items-center gap-14 px-5 pb-20 pt-12 sm:px-9 md:pb-28 md:pt-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10 lg:px-12 lg:pt-24">
        <div className="pointer-events-none absolute -left-36 top-8 size-[420px] rounded-full bg-[#eceaff] opacity-70 blur-[90px]" />
        <div className="relative z-[1] max-w-[590px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e8e7f4] bg-white/80 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6960c8] shadow-sm"><span className="size-1.5 rounded-full bg-[#58c9a1]" /> AIForce.Ops Service Review Center</div>
          <h1 className="mt-7 text-[clamp(42px,6vw,72px)] font-semibold leading-[1.03] tracking-[-0.065em] text-[#202631]">See service operations <span className="text-[#6255e8]">as one story.</span></h1>
          <p className="mt-6 max-w-[520px] text-[15px] leading-7 text-[#70798a] sm:text-[16px]">Bring service health, events, incidents, automation, environment health, and business value into a clear review experience for every team.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={workspaceActionHref} className="group inline-flex h-12 items-center gap-3 rounded-xl bg-[#6255e8] px-5 text-[13px] font-semibold text-white shadow-[0_10px_26px_rgba(98,85,232,0.2)] transition hover:-translate-y-0.5 hover:bg-[#5146d2]">Explore Agent Studio<span className="flex size-6 items-center justify-center rounded-full bg-white/15 transition group-hover:translate-x-0.5"><ArrowRight className="size-3.5" /></span></Link>
            <a href="#capabilities" className="inline-flex h-12 items-center gap-2 rounded-xl px-4 text-[12px] font-medium text-[#697386] transition hover:bg-white">Explore the platform <ArrowDown className="size-3.5" /></a>
          </div>
          <div className="mt-9 flex items-center gap-2 text-[11px] text-[#8a92a0]"><CircleCheck className="size-4 text-[#49b78e]" /> A shared view across business and operations teams</div>
        </div>

        <div className="relative z-[1] mx-auto w-full max-w-[630px] lg:ml-auto">
          <div className="absolute -right-4 -top-8 size-40 rounded-full bg-[#e8f7f4] blur-[70px]" />
          <div className="relative rounded-[25px] border border-[#e4e7ef] bg-white p-3 shadow-[0_32px_90px_rgba(46,55,79,0.13)] sm:p-4">
            <div className="flex items-center justify-between border-b border-[#eef0f4] px-3 pb-3 pt-1 sm:px-4">
              <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-[10px] bg-[#f0efff] text-[#6255e8]"><Workflow className="size-4" /></span><div><p className="text-[11px] font-semibold text-[#394150]">Service review workspace</p><p className="mt-0.5 text-[9px] text-[#969eac]">A connected operational view</p></div></div>
              <span className="rounded-full border border-[#e7e8f0] bg-[#fafaff] px-2.5 py-1 text-[9px] font-medium text-[#777f92]">Product preview</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 p-2.5 sm:grid-cols-3 sm:gap-3 sm:p-4">
              {capabilityGroups.map(({ name, detail, icon: Icon }, index) => <div key={name} className={`rounded-2xl border p-3.5 transition duration-300 hover:-translate-y-0.5 sm:p-4 ${index === 0 ? "border-[#e3e0ff] bg-[#f8f7ff]" : "border-[#edf0f4] bg-white"}`}>
                <span className={`flex size-8 items-center justify-center rounded-[10px] ${index % 3 === 0 ? "bg-[#efedff] text-[#6255e8]" : index % 3 === 1 ? "bg-[#e9f8f2] text-[#39a981]" : "bg-[#edf5ff] text-[#4380c2]"}`}><Icon className="size-4" /></span>
                <p className="mt-4 text-[13px] font-semibold text-[#343c4b]">{name}</p><p className="mt-1 text-[10px] leading-4 text-[#8a93a1]">{detail}</p>
              </div>)}
            </div>
            <div className="mx-2.5 mb-2.5 rounded-2xl bg-[#f8f9fc] p-3.5 sm:mx-4 sm:mb-4 sm:p-4">
              <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-white text-[#6255e8] shadow-sm"><Bot className="size-3.5" /></span><span className="text-[10px] font-semibold text-[#596273]">From operational signals to service review</span></div><span className="hidden text-[9px] text-[#929aa8] sm:inline">Workflow concept</span></div>
              <div className="mt-3 flex items-center gap-1.5 sm:gap-2">
                <div className="min-w-0 flex-1 rounded-xl border border-[#e9eaf0] bg-white px-2.5 py-2.5 sm:px-3"><p className="text-[9px] font-semibold text-[#5e6675]">Event</p><p className="mt-1 truncate text-[8px] text-[#959dac]">Service signal</p></div><span className="h-px w-3 shrink-0 bg-[#c9c5ef] sm:w-6" />
                <div className="min-w-0 flex-1 rounded-xl border border-[#e4e1fb] bg-white px-2.5 py-2.5 sm:px-3"><p className="text-[9px] font-semibold text-[#6255e8]">Incident</p><p className="mt-1 truncate text-[8px] text-[#959dac]">IEM lifecycle</p></div><span className="h-px w-3 shrink-0 bg-[#c9c5ef] sm:w-6" />
                <div className="min-w-0 flex-1 rounded-xl border border-[#e0f0e9] bg-white px-2.5 py-2.5 sm:px-3"><p className="text-[9px] font-semibold text-[#39a981]">Action</p><p className="mt-1 truncate text-[8px] text-[#959dac]">AEM automation</p></div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#eceef3] bg-white px-3 py-2.5"><span className="flex size-6 items-center justify-center rounded-full bg-[#f0efff] text-[#6255e8]"><Sparkles className="size-3" /></span><p className="min-w-0 flex-1 truncate text-[9px] font-medium text-[#717a89]">Connect operational context to business value</p><span className="size-1.5 shrink-0 rounded-full bg-[#62c9a0]" /></div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-5 hidden items-center gap-2.5 rounded-2xl border border-[#e8eaf0] bg-white px-4 py-3 shadow-[0_12px_32px_rgba(46,55,79,0.11)] sm:flex"><span className="flex size-8 items-center justify-center rounded-xl bg-[#e9f8f2] text-[#39a981]"><Activity className="size-4" /></span><div><p className="text-[10px] font-semibold text-[#465064]">One service review</p><p className="mt-0.5 text-[9px] text-[#969eac]">Business and operations context</p></div></div>
        </div>
      </section>

      <section id="capabilities" className="border-y border-[#edf0f5] bg-white/80">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-9 md:py-20 lg:px-12">
          <div className="max-w-[570px]"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7168cf]">Platform capabilities</p><h2 className="mt-3 text-[30px] font-semibold tracking-[-0.045em] text-[#252c38] sm:text-[38px]">Understand the work behind the service.</h2><p className="mt-3 text-[13px] leading-6 text-[#7b8493]">AIForce.Ops brings its platform domains into one experience, so the review can move from service context to operational action.</p></div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
            { title: "Event to incident", text: "Follow the IEM lifecycle from incoming events through incident review." },
            { title: "Environment & geo health", text: "Include environment and geographic service context in operations reviews." },
            { title: "Automation & business value", text: "Connect AEM automation with the business value view." },
          ].map((item) => <article key={item.title} className="rounded-2xl border border-[#eaecf1] bg-white p-5 shadow-[0_5px_24px_rgba(31,41,55,0.025)]"><span className="flex size-9 items-center justify-center rounded-xl bg-[#f1f0ff] text-[#6255e8]"><Sparkles className="size-4" /></span><h3 className="mt-4 text-[13px] font-semibold text-[#414958]">{item.title}</h3><p className="mt-2 text-[11px] leading-5 text-[#7e8796]">{item.text}</p></article>)}
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#e9e7f7] bg-[#f9f8ff] p-5 sm:flex-row sm:items-center sm:px-6"><div><h3 className="text-[14px] font-semibold text-[#333b49]">Explore the Agent Studio.</h3><p className="mt-1.5 text-[11px] text-[#7e8796]">Create agents and shape visual workflows in your browser.</p></div><Link href={workspaceActionHref} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#6255e8] px-4 text-[11px] font-semibold text-white transition hover:bg-[#5146d2]">{workspaceActionLabel}<ArrowRight className="size-3.5" /></Link></div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-[1320px] flex-col gap-2 px-5 py-7 text-[10px] text-[#929aa8] sm:flex-row sm:items-center sm:justify-between sm:px-9 lg:px-12"><span>AIForce.Ops — Intelligent Service Operations Platform</span><span>Service review · operations · automation · business value</span></footer>
    </main>
  );
}
