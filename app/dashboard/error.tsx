"use client";

export default function DashboardError({reset}:{reset:()=>void}) {
 return <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6"><section role="alert" className="w-full max-w-md rounded-3xl border border-indigo-100 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-slate-900">We couldn’t open your workspace</h1><p className="mt-3 text-sm leading-6 text-slate-500">The connection was interrupted. Try again to load your dashboard.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={reset} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white">Try again</button><button type="button" onClick={()=>window.location.reload()} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700">Reload page</button></div></section></main>;
}
