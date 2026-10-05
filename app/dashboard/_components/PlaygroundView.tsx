"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Bot, LoaderCircle, RotateCcw, Send, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

function RangeSetting({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block min-w-0">
      <span className="flex items-center justify-between gap-2 text-[12px] font-medium text-[#465064]">
        {label}<span className="tabular-nums text-[#697386]">{value.toFixed(1)}</span>
      </span>
      <input className="studio-range mt-2 block w-full cursor-pointer" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <span className="mt-1 flex justify-between text-[10px] text-[#8992a2]"><span>{min}</span><span>{max}</span></span>
    </label>
  );
}

export default function PlaygroundView({ configurationOpen }: { configurationOpen: boolean }) {
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelError, setModelError] = useState("");
  const [reloadModels, setReloadModels] = useState(0);
  const [maxTokens, setMaxTokens] = useState(0);
  const [temperature, setTemperature] = useState(0.8);
  const [topP, setTopP] = useState(0.6);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.2);
  const [presencePenalty, setPresencePenalty] = useState(0.6);
  const [instructions, setInstructions] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/playground/state", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load Playground data.");
        const settings = data.settings ?? {};
        setModel(typeof settings.model === "string" ? settings.model : "");
        setMaxTokens(typeof settings.maxTokens === "number" ? settings.maxTokens : 0);
        setTemperature(typeof settings.temperature === "number" ? settings.temperature : 0.8);
        setTopP(typeof settings.topP === "number" ? settings.topP : 0.6);
        setFrequencyPenalty(typeof settings.frequencyPenalty === "number" ? settings.frequencyPenalty : 0.2);
        setPresencePenalty(typeof settings.presencePenalty === "number" ? settings.presencePenalty : 0.6);
        setInstructions(typeof settings.instructions === "string" ? settings.instructions : "");
        setMessages(Array.isArray(data.messages) ? data.messages as ChatMessage[] : []);
        setSettingsLoaded(true);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setChatError(error instanceof Error ? error.message : "Could not load Playground data from PostgreSQL.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/playground/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, maxTokens, temperature, topP, frequencyPenalty, presencePenalty, instructions }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save Playground settings.");
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "Could not save Playground settings to PostgreSQL.");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [frequencyPenalty, instructions, maxTokens, model, presencePenalty, settingsLoaded, temperature, topP]);

  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    input.style.overflowY = input.scrollHeight > 180 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/playground/models", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load OpenAI models.");
        const available = Array.isArray(data.models) ? data.models.filter((item: unknown): item is string => typeof item === "string") : [];
        setModels(available);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setModelError(error instanceof Error ? error.message : "Could not load model IDs.");
      });
    return () => controller.abort();
  }, [reloadModels]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    if (!model.trim()) {
      setChatError("Choose or enter an OpenAI model ID in Configurations first.");
      return;
    }

    const nextMessages = [...messages, { id: crypto.randomUUID(), role: "user" as const, content }];
    setMessages(nextMessages);
    setDraft("");
    setChatError("");
    setBusy(true);
    try {
      const storedUserResponse = await fetch("/api/playground/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      });
      const storedUserData = await storedUserResponse.json();
      if (!storedUserResponse.ok) throw new Error(storedUserData.error || "Could not save your message to PostgreSQL.");
      const storedUserMessage = storedUserData.message as ChatMessage;
      setMessages((current) => current.map((item) => item.id === nextMessages.at(-1)?.id ? storedUserMessage : item));

      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.trim(),
          instructions,
          temperature,
          topP,
          frequencyPenalty,
          presencePenalty,
          maxTokens,
          messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The agent could not complete this run.");
      const reply = String(data.reply ?? "");
      const storedAssistantResponse = await fetch("/api/playground/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: reply }),
      });
      const storedAssistantData = await storedAssistantResponse.json();
      if (!storedAssistantResponse.ok) throw new Error(storedAssistantData.error || "The response could not be saved to PostgreSQL.");
      setMessages((current) => [...current, storedAssistantData.message as ChatMessage]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "The agent could not complete this run.");
    } finally {
      setBusy(false);
    }
  }

  async function resetConversation() {
    try {
      const response = await fetch("/api/playground/state", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not clear Playground history.");
      setMessages([]);
      setChatError("");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Could not clear Playground history from PostgreSQL.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-[#eceef2] px-5 sm:px-7">
          <div className="flex items-center gap-2 text-[12px] text-[#9aa2af]"><span>Agent Studio</span><span>/</span><span className="font-medium text-[#414a59]">Playground</span></div>
          <button type="button" aria-label="Clear conversation" title="Clear conversation" onClick={resetConversation} disabled={messages.length === 0 || busy} className="flex size-8 items-center justify-center rounded-lg text-[#778193] transition hover:bg-[#f4f5f8] hover:text-[#454f60] disabled:cursor-not-allowed disabled:opacity-35"><RotateCcw className="size-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-8">
          <div className={`mx-auto flex min-h-full w-full max-w-[790px] flex-col py-8 ${messages.length ? "justify-start gap-5" : "justify-center"}`}>
            {messages.length === 0 ? <div className="mx-auto max-w-[610px] text-center">
              <div className="mx-auto flex size-[54px] items-center justify-center rounded-2xl border border-[#e7e5fb] bg-gradient-to-br from-[#f7f6ff] to-white text-[#6659e8] shadow-sm"><Sparkles className="size-6" /></div>
              <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#766ce1]">AIForce.Ops · Agent Studio</p>
              <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-[#252c38] sm:text-[29px]">Playground</h1>
              <p className="mx-auto mt-3 max-w-[480px] text-[13px] leading-6 text-[#7b8493]">Try a live AI conversation using a model from your OpenAI account. Add session instructions and tune the model settings on the right.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">{["Service health", "Event → Incident", "Automation", "Business value"].map((topic) => <span key={topic} className="rounded-full border border-[#e8eaf0] bg-white px-3 py-1.5 text-[11px] text-[#697386]">{topic}</span>)}</div>
            </div> : messages.map((item) => <article key={item.id} className={`max-w-[min(92%,680px)] rounded-2xl border px-5 py-4 text-[13px] leading-6 shadow-[0_3px_14px_rgba(31,41,55,0.035)] ${item.role === "user" ? "self-end rounded-br-md border-[#e8e6fb] bg-[#f7f6ff] text-[#333b49]" : "self-start rounded-bl-md border-[#e8eaf0] bg-white text-[#333b49]"}`}>
              <div className={`mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${item.role === "user" ? "text-[#7065d8]" : "text-[#687385]"}`}><span className={`flex size-5 items-center justify-center rounded-full ${item.role === "user" ? "bg-[#e9e7ff]" : "bg-[#eef0f5]"}`}>{item.role === "user" ? <User className="size-3" /> : <Bot className="size-3" />}</span>{item.role === "user" ? "You" : "AIForce.Ops"}</div>
              <div className="markdown-message">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                    em: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    h1: ({ children }) => <h2 className="mb-3 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
                    h2: ({ children }) => <h3 className="mb-2 mt-4 text-[14px] font-semibold first:mt-0">{children}</h3>,
                    h3: ({ children }) => <h4 className="mb-2 mt-3 text-[13px] font-semibold first:mt-0">{children}</h4>,
                    ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                    li: ({ children }) => <li className="pl-0.5">{children}</li>,
                    blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-[#c7c2fb] pl-3 text-[#697386]">{children}</blockquote>,
                    code: ({ children, className }) => <code className={`${className ?? ""} rounded bg-[#f2f3f7] px-1.5 py-0.5 font-mono text-[11px] text-[#5247bd]`}>{children}</code>,
                    pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-xl bg-[#202631] p-3 text-[11px] leading-5 text-[#eef0f6]">{children}</pre>,
                    a: ({ children, href }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined} className="font-medium text-[#5d52d8] underline decoration-[#c7c2fb] underline-offset-2">{children}</a>,
                    hr: () => <hr className="my-4 border-[#e8eaf0]" />,
                  }}
                >
                  {item.content}
                </ReactMarkdown>
              </div>
            </article>)}
            {busy && <div className="flex items-center gap-2 self-start rounded-xl border border-[#e8eaf0] bg-white px-4 py-3 text-[11px] text-[#7b8493]"><LoaderCircle className="size-4 animate-spin text-[#6255e8]" />Thinking…</div>}
            <div ref={bottomRef} />
          </div>
          </div>

          <form onSubmit={submitMessage} className="w-full shrink-0 border-t border-[#f0f1f5] bg-white px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-8">
            <div className="mx-auto w-full max-w-[790px]">
            {chatError && <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11px] leading-5 text-rose-700"><AlertCircle className="mt-0.5 size-4 shrink-0" />{chatError}</div>}
            <label htmlFor="playground-message" className="sr-only">Message the Agent Studio Playground</label>
            <div className="flex items-end gap-2 rounded-2xl border border-[#dfe2e9] bg-white p-2 shadow-[0_5px_22px_rgba(31,41,55,0.045)] transition focus-within:border-[#afa9f4] focus-within:ring-4 focus-within:ring-[#6f63e8]/[0.07]"><textarea ref={messageInputRef} id="playground-message" rows={1} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about services..." className="max-h-[180px] min-h-[42px] min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent px-3 py-2.5 text-[13px] leading-5 text-[#303846] outline-none placeholder:text-[#a0a7b3]" /><button type="submit" aria-label="Send message" disabled={!draft.trim() || busy} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#6255e8] text-white shadow-sm transition hover:bg-[#5146d2] disabled:cursor-not-allowed disabled:bg-[#cbc8f5]">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</button></div>
            <p className="mt-2 text-center text-[10px] text-[#a0a6b1]">AIForce.Ops service operations can sometimes make mistakes</p>
            </div>
          </form>
        </div>
      </section>

      {configurationOpen && <aside aria-label="Playground configuration" className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,410px)] shrink-0 flex-col overflow-y-auto border-l border-[#e6e8ed] bg-white shadow-2xl md:relative md:z-0 md:w-[360px] md:shadow-none xl:w-[410px] 2xl:w-[450px]">
        <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-[#eceef2] px-5 sm:px-6"><div><h2 className="text-[14px] font-semibold text-[#303846]">Configurations</h2><p className="mt-0.5 text-[10px] text-[#9199a7]">OpenAI model · session settings</p></div></div>
        <div className="space-y-6 p-5 sm:p-6">
          <label className="block"><span className="mb-2 block text-[12px] font-medium text-[#465064]">Model ID <span className="text-[#df6b6b]">*</span></span><input list="openai-model-options" value={model} onChange={(event) => setModel(event.currentTarget.value)} placeholder={models.length ? "Choose or enter a model ID" : "Enter a model ID"} className="h-11 w-full rounded-lg border border-[#dfe2e8] bg-white px-3.5 text-[12px] text-[#515b6c] outline-none transition placeholder:text-[#a0a7b3] focus:border-[#a9a2f2] focus:ring-3 focus:ring-[#6255e8]/10" /><datalist id="openai-model-options">{models.map((item) => <option key={item} value={item} />)}</datalist></label>
          <div className="-mt-4 flex items-start justify-between gap-2 text-[10px] leading-4"><span className={modelError ? "text-amber-700" : "text-[#8992a2]"}>{modelError || (models.length ? `${models.length} model IDs loaded from your OpenAI account.` : "Loading model IDs…")}</span><button type="button" onClick={() => { setModelError(""); setReloadModels((value) => value + 1); }} className="shrink-0 font-medium text-[#5e54d8] hover:underline">Refresh</button></div>
          <label className="block"><span className="flex items-center justify-between gap-2 text-[12px] font-medium text-[#465064]">Max tokens <span className="tabular-nums text-[#697386]">{maxTokens === 0 ? "Model default" : maxTokens}</span></span><input aria-label="Max tokens" className="studio-range mt-2 block w-full cursor-pointer" type="range" min="0" max="4000" step="100" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.currentTarget.value))} /><span className="mt-1 flex justify-between text-[10px] text-[#8992a2]"><span>Model default</span><span>4000</span></span></label>
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 xl:grid-cols-2"><RangeSetting label="Temperature" value={temperature} onChange={setTemperature} max={2} /><RangeSetting label="Top p" value={topP} onChange={setTopP} /><RangeSetting label="Frequency penalty" value={frequencyPenalty} onChange={setFrequencyPenalty} min={-2} max={2} /><RangeSetting label="Presence penalty" value={presencePenalty} onChange={setPresencePenalty} min={-2} max={2} /></div>
          <label className="block"><span className="mb-2 block text-[12px] font-medium text-[#465064]">System instructions</span><textarea value={instructions} onChange={(event) => setInstructions(event.currentTarget.value)} rows={5} maxLength={12000} placeholder="Add instructions for this Playground session" className="w-full resize-y rounded-lg border border-[#dfe2e8] bg-white px-3.5 py-3 text-[12px] leading-5 text-[#465064] outline-none transition placeholder:text-[#a0a7b3] focus:border-[#a9a2f2] focus:ring-3 focus:ring-[#6255e8]/10" /></label>
          <div className="rounded-xl border border-[#e9e6fb] bg-[#faf9ff] p-3.5"><div className="flex items-start gap-2.5 text-[#6a61ca]"><Sparkles className="mt-0.5 size-4 shrink-0" /><p className="text-[11px] leading-[18px] text-[#72798a]">Messages are sent to OpenAI through the server-side Agents SDK. The API key is never sent to this browser.</p></div></div>
        </div>
      </aside>}
    </div>
  );
}
