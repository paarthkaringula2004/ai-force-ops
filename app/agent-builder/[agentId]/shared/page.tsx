"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, LockKeyhole, Send, Share2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentStudioChart from "@/components/agent-studio-chart";
import type { StudioChart } from "@/lib/agent-studio-charts";

type Message = { role: "user" | "assistant"; content: string; charts?: StudioChart[] };
export default function SharedAgentPreview() {
  const { agentId } = useParams<{ agentId: string }>(), router = useRouter();
  const [preview, setPreview] = useState<{ agent: { name: string; purpose: string }; ownerName: string; version: number } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]), [question, setQuestion] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const bottom = useRef<HTMLDivElement>(null), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/agents/${agentId}/shared`, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setPreview(data); }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [agentId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  async function send(event: FormEvent) {
    event.preventDefault(); if (busy || !question.trim() || !preview) return;
    const content = question.trim(), next: Message[] = [...messages, { role: "user", content }];
    setMessages(next); setQuestion(""); setBusy(true); setError("");
    const controller = new AbortController(); pending.current = controller;
    try {
      const response = await fetch(`/api/agents/${agentId}/shared`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }), signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMessages([...next, { role: "assistant", content: data.reply, charts: data.charts }]);
    } catch (error) { if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "The answer could not be completed."); setMessages(next.slice(0, -1)); setQuestion(content); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <main className="flex h-dvh flex-col bg-[#f7f6fc] text-slate-800">
    <header className="flex items-center gap-4 border-b border-purple-100 bg-white px-5 py-4"><button type="button" onClick={() => router.push("/dashboard/agents")} aria-label="Back to agents" className="rounded-xl p-2 hover:bg-purple-50"><ArrowLeft className="size-5" /></button><span className="rounded-xl bg-[#6550ed] p-2.5 text-white"><Share2 className="size-5" /></span><div className="min-w-0 flex-1"><h1 className="truncate font-semibold">{preview?.agent.name || "Shared agent preview"}</h1><p className="mt-1 text-xs text-slate-500">{preview ? `Shared by ${preview.ownerName} · Version ${preview.version}` : "Verifying access…"}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-2 text-xs text-[#6550ed]"><LockKeyhole className="size-3.5" />Preview only</span></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="mx-auto max-w-4xl">
      {loading && <p role="status" className="flex items-center gap-2 py-10 text-sm text-[#6550ed]"><LoaderCircle className="size-4 animate-spin" />Loading shared preview…</p>}
      {preview && messages.length === 0 && <section className="rounded-2xl border border-purple-100 bg-white p-7"><h2 className="text-xl font-semibold">Chat with {preview.agent.name}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{preview.agent.purpose || "Ask this agent about its connected project knowledge and tools."}</p><p className="mt-4 text-xs text-[#6550ed]">Your Admin’s shared agent, with preview and chat access.</p></section>}
      {messages.map((message, index) => <article key={index} className={`mt-5 rounded-2xl border p-5 ${message.role === "user" ? "ml-auto max-w-2xl border-purple-200 bg-purple-50" : "border-purple-100 bg-white"}`}><p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#6550ed]">{message.role === "user" ? "You" : preview?.agent.name}</p><div className="prose prose-sm max-w-none overflow-x-auto text-sm leading-7 [&_a]:text-[#6550ed] [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>{message.charts?.map(chart => <AgentStudioChart key={chart.id} chart={chart} />)}</article>)}
      {busy && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-[#6550ed]"><LoaderCircle className="size-4 animate-spin" />Checking connected sources…</p>}
      <div ref={bottom} />
    </div></div>
    <footer className="border-t border-purple-100 bg-white p-4"><form onSubmit={send} className="mx-auto max-w-4xl">{error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}<div className="flex items-end gap-3 rounded-2xl border border-purple-200 bg-purple-50/20 p-3"><textarea aria-label="Message shared agent" maxLength={12000} disabled={!preview || busy} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask your question…" rows={2} className="min-h-14 flex-1 resize-y bg-transparent p-2 text-sm outline-none disabled:opacity-50" /><button type="submit" disabled={!preview || busy || !question.trim()} aria-label="Send message" className="rounded-xl bg-[#6550ed] p-3 text-white hover:bg-[#5643d6] disabled:opacity-40"><Send className="size-5" /></button></div></form></footer>
  </main>;
}
