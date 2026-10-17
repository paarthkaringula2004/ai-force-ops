"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Bot, LoaderCircle, MessageCircle, Plus, Send, Square, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownEditor from "./epace/markdown-editor";
import "./epace/workspace.css";
import "./review-assistant.css";
import "./manager-assistant.css";

const topics = [
    "Observability",
    "Value dashboard",
    "AI Ops",
    "Executive summary",
    "Data sources",
    "Geo health",
    "Service details",
];
type Turn = { id: string; question: string; answer: string; pending: boolean; error?: string };
export default function ManagerAssistant() {
    const [open, setOpen] = useState(false),
        [draft, setDraft] = useState(""),
        [busy, setBusy] = useState(false);
    const [turns, setTurns] = useState<Turn[]>([]);
    const request = useRef<AbortController | null>(null),
        bottom = useRef<HTMLDivElement>(null);
    useEffect(() => {
        bottom.current?.scrollIntoView({ block: "end" });
    }, [turns, open]);
    useEffect(() => () => request.current?.abort(), []);
    function resetChat() {
        setTurns([]);
        setDraft("");
    }
    async function send(question = draft) {
        const q = question.trim();
        if (!q || busy) return;
        const id = crypto.randomUUID(),
            controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setDraft("");
        setTurns((previous) => [...previous, { id, question: q, answer: "", pending: true }]);
        try {
            const response = await fetch("/api/service-review-center/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: q, requestId: id }),
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]),
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || "Could not load the organization overview.");
            setTurns((previous) =>
                previous.map((t) =>
                    t.id === id ? { ...t, answer: data.answer, pending: false } : t,
                ),
            );
        } catch (e) {
            const message = controller.signal.aborted
                ? "Stopped waiting for this answer."
                : e instanceof Error && e.name === "TimeoutError"
                  ? "The request took too long. Please try again."
                  : e instanceof Error
                    ? e.message
                    : "Could not load the organization overview.";
            setTurns((previous) =>
                previous.map((t) => (t.id === id ? { ...t, pending: false, error: message } : t)),
            );
            setDraft(q);
        } finally {
            setBusy(false);
            if (request.current === controller) request.current = null;
        }
    }
    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
                aria-label="Open Review Center chatbot"
                className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-2xl bg-[#6351e9] text-white shadow-lg shadow-indigo-900/20 transition hover:bg-[#5540d5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
            >
                <MessageCircle className="size-6" />
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/20" />
                <Dialog.Popup className="manager-review-chat fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col border-l border-indigo-100 bg-[#f5f6fb] text-[#142b49] shadow-2xl outline-none">
                    <header className="flex shrink-0 items-center gap-3 border-b border-indigo-100 bg-white px-5 py-4">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-[#6351e9]">
                            <Bot className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <Dialog.Title className="text-sm font-semibold">
                                Review Center Chatbot
                            </Dialog.Title>
                            <Dialog.Description className="mt-1 text-xs text-slate-500">
                                Service health, business value and organization insights
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            aria-label="Close chatbot"
                            className="rounded-lg p-2 text-slate-500 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500"
                        >
                            <X className="size-5" />
                        </Dialog.Close>
                    </header>
                    <div className="flex shrink-0 items-center justify-between border-b border-indigo-100 bg-white px-5 py-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={resetChat}
                                className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-indigo-50 disabled:opacity-40"
                            >
                                <Plus className="size-4" />
                                New chat
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={resetChat}
                                className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-indigo-50 disabled:opacity-40"
                            >
                                <Trash2 className="size-4" />
                                Clear chat
                            </button>
                        </div>
                        <span className="text-[11px] text-slate-500">Organization overview</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
                        {!turns.length && (
                            <div className="mx-auto max-w-lg py-8 sm:py-12">
                                <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-indigo-100 bg-white text-[#6351e9] shadow-sm">
                                    <MessageCircle className="size-7" />
                                </span>
                                <h2 className="text-2xl font-semibold tracking-tight">
                                    How can I help?
                                </h2>
                                <p className="mt-3 text-sm leading-6 text-slate-500">
                                    Ask about service health, explore business results, or get an
                                    executive summary from your organization’s connected data.
                                </p>
                                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                                    {topics.map((topic) => (
                                        <button
                                            key={topic}
                                            type="button"
                                            onClick={() => void send(topic)}
                                            className="rounded-xl border border-indigo-100 bg-white px-4 py-3 text-left text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500"
                                        >
                                            {topic}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="space-y-6">
                            {turns.map((turn) => (
                                <div key={turn.id}>
                                    <div className="mb-3 ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#eeebff] px-4 py-3">
                                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
                                            You
                                        </p>
                                        <div className="manager-chat-markdown text-sm leading-6">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                                                {turn.question}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                    <article className="rounded-2xl border border-indigo-100 bg-white px-5 py-4">
                                        <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#6351e9]">
                                            <Bot className="size-4" />
                                            Review Center
                                        </div>
                                        {turn.pending ? (
                                            <p
                                                role="status"
                                                className="flex items-center gap-2 text-sm text-slate-500"
                                            >
                                                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                                                Checking organization readings…
                                            </p>
                                        ) : turn.error ? (
                                            <div role="alert">
                                                <p className="text-sm leading-6 text-rose-600">
                                                    {turn.error}
                                                </p>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void send(turn.question)}
                                                    className="mt-3 text-xs font-medium text-indigo-600 underline disabled:opacity-40"
                                                >
                                                    Try again
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="manager-chat-markdown text-sm leading-6">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                                                    {turn.answer}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                    </article>
                                </div>
                            ))}
                        </div>
                        <div ref={bottom} />
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void send();
                        }}
                        className="shrink-0 border-t border-indigo-100 bg-white p-4"
                    >
                        <div className="review-bot-composer">
                            <MarkdownEditor
                                value={draft}
                                onChange={setDraft}
                                onSend={() => void send()}
                                maxLength={4000}
                                ariaLabel="Ask the Review Center chatbot"
                                placeholder="Ask about service health or business results…"
                            />
                            {busy ? (
                                <button
                                    type="button"
                                    aria-label="Stop waiting for answer"
                                    onClick={() => request.current?.abort()}
                                    className="review-bot-send"
                                >
                                    <Square size={17} />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    aria-label="Send question"
                                    disabled={!draft.trim()}
                                    className="review-bot-send"
                                >
                                    <Send size={18} />
                                </button>
                            )}
                        </div>
                        <p className="mt-2 text-center text-[10px] text-slate-400">
                            Ctrl/Command + Enter to send / Enter for a new line / Review cited
                            evidence
                        </p>
                    </form>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
