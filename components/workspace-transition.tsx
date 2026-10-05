import { Bot, Command, Layers3, LoaderCircle, Sparkles } from "lucide-react";

export type WorkspaceDestination = "eAssist" | "ePACE" | "Review Center" | "Agent Studio";

export default function WorkspaceTransition({ destination }: { destination: WorkspaceDestination }) {
  const Icon = { eAssist: Bot, ePACE: Sparkles, "Review Center": Layers3, "Agent Studio": Command }[destination];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50/95 px-6 backdrop-blur-md" role="status" aria-live="polite" aria-atomic="true">
      <div className="w-full max-w-sm rounded-3xl border border-indigo-100 bg-white p-10 text-center shadow-[0_24px_80px_rgba(45,64,115,.12)]">
        <div className="relative mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-200">
          <span aria-hidden="true" className="absolute -inset-2 rounded-[2rem] border border-indigo-200 motion-safe:animate-pulse" />
          <Icon aria-hidden="true" className="size-9" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Opening {destination}…</h2>
        <p className="mt-2 text-sm text-slate-500">Preparing your workspace</p>
        <LoaderCircle aria-hidden="true" className="mx-auto mt-6 size-5 text-indigo-600 motion-safe:animate-spin" />
      </div>
    </div>
  );
}
