import Link from "next/link";
import { Activity, ArrowRight, Bot, GitBranch, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#fbfcff] text-[#202631]">
      <header className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 sm:px-9 lg:px-12">
        <Link href="/" className="flex items-center gap-3" aria-label="AIForce.Ops home"><span className="flex size-10 items-center justify-center rounded-[13px] bg-[#6255e8] text-white shadow-[0_8px_20px_rgba(98,85,232,0.22)]"><Sparkles className="size-5" /></span><span><span className="block text-[15px] font-semibold tracking-[-0.03em]">AIForce.Ops</span><span className="mt-0.5 block text-[10px] text-[#818a9a]">Intelligent Service Operations</span></span></Link>
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-[#697386] transition hover:bg-[#f1f2f8]">Back to overview <ArrowRight className="size-3.5" /></Link>
      </header>
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-[1320px] items-center gap-10 px-5 pb-10 sm:px-9 lg:grid-cols-[1fr_0.9fr] lg:gap-16 lg:px-12">
        <section className="hidden max-w-[570px] lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e8e7f4] bg-white px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6960c8]"><span className="size-1.5 rounded-full bg-[#58c9a1]" />Your service operations workspace</div>
          <h2 className="mt-7 text-[48px] font-semibold leading-[1.06] tracking-[-0.06em]">Bring your operational story <span className="text-[#6255e8]">into focus.</span></h2>
          <p className="mt-5 max-w-[480px] text-[14px] leading-7 text-[#70798a]">Create agents, design visual workflows, and review service operations from one light, connected workspace.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {[{ icon: Bot, title: "Agent Studio", text: "Create and configure service agents." }, { icon: GitBranch, title: "Visual workflows", text: "Shape each agent's path on a canvas." }, { icon: Activity, title: "Service review", text: "Keep operations and business context together." }].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-start gap-3 rounded-2xl border border-[#e8eaf0] bg-white/85 p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#f0efff] text-[#6255e8]"><Icon className="size-4" /></span><div><p className="text-[11px] font-semibold text-[#394150]">{title}</p><p className="mt-1 text-[10px] leading-4 text-[#8992a0]">{text}</p></div></div>)}
          </div>
        </section>
        <div className="flex justify-center">{children}</div>
      </div>
    </main>
  );
}
