"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Bot, LoaderCircle, RotateCcw, Send, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ThemedSelect from "@/components/themed-select";
import Link from "next/link";
import { recentChat } from "@/lib/chat-efficiency";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt?: string };
import { adminHome, employeeHome } from "@/lib/employee-services";
import { userChoices } from "@/lib/user-playground-choices";
type EmployeeSnapshot = {
    profile: {
        name: string;
        role: string;
        department: string;
        employeeId: string;
        manager: string | null;
    };
    requests: { number: string; status: string }[];
    draft: { label: string; completed: number; total: number } | null;
};
const choiceLabel = (text: string) =>
    text.replace(
        /^(Confirm (?:role change|request decision|department creation|send email)|Email status) [a-f0-9-]+$/i,
        "$1",
    );

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
                {label}
                <span className="tabular-nums text-[#697386]">{value.toFixed(1)}</span>
            </span>
            <input
                className="studio-range mt-2 block w-full cursor-pointer"
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.currentTarget.value))}
            />
            <span className="mt-1 flex justify-between text-[10px] text-[#8992a2]">
                <span>{min}</span>
                <span>{max}</span>
            </span>
        </label>
    );
}

export default function PlaygroundView({ configurationOpen }: { configurationOpen: boolean }) {
    const [choices, setChoices] = useState<string[]>([]);

    const [employee, setEmployee] = useState<EmployeeSnapshot | null>(null);
    const role = employee?.profile.role;
    const workspaceLabel =
        role === "admin"
            ? "Admin workspace"
            : role === "manager"
              ? "Manager workspace"
              : role === "employee"
                ? "Employee services"
                : role === "user"
                  ? "Agent Studio"
                  : "Workspace assistant";
    const welcomeTitle =
        role === "admin"
            ? "Your Admin Super Bot"
            : role === "manager"
              ? "Your Manager Super Bot"
              : role === "employee"
                ? "Your Employee Super Bot"
                : "Your AIForce.Ops Super Bot";
    const welcomeDescription = !role
        ? "Loading your workspace…"
        : role === "admin"
          ? "Manage workspace roles, review team requests and approvals, and work with administration, integrations, security and operations."
          : role === "manager"
            ? "Review your team’s requests and approvals, track your own workplace services, and get an overview of AIForce.Ops. Use Agent Studio, Review Center and ePACE with your Manager role."
            : role === "user"
              ? "Explore AIForce.Ops, learn how to build agents and use tools, and discover published career opportunities and the hiring process."
              : "Welcome! Get help with onboarding, leave, equipment, meeting rooms, referrals, resignation and HR services. Prepare requests, review the details and track their progress in one conversation.";
    const homeChoices =
        role === "user"
            ? userChoices
            : role === "admin"
              ? adminHome
              : role === "manager"
                ? ["Team requests", ...employeeHome]
                : employeeHome;
    const [model, setModel] = useState("");
    const [models, setModels] = useState<string[]>([]);
    const [adminRoutingModel, setAdminRoutingModel] = useState("");
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
    const [chatNotice, setChatNotice] = useState("");
    const sendingRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/playground/employee", { signal: controller.signal })
            .then(async (r) => {
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || "Could not load employee requests.");
                return data;
            })
            .then((data) => {
                setEmployee(data);
                setChoices(data.choices || employeeHome);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setChatError(error.message);
            });
        fetch("/api/playground/state", { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Could not load Playground data.");
                const settings = data.settings ?? {};
                setModel(typeof settings.model === "string" ? settings.model : "");
                setMaxTokens(typeof settings.maxTokens === "number" ? settings.maxTokens : 0);
                setTemperature(
                    typeof settings.temperature === "number" ? settings.temperature : 0.8,
                );
                setTopP(typeof settings.topP === "number" ? settings.topP : 0.6);
                setFrequencyPenalty(
                    typeof settings.frequencyPenalty === "number" ? settings.frequencyPenalty : 0.2,
                );
                setPresencePenalty(
                    typeof settings.presencePenalty === "number" ? settings.presencePenalty : 0.6,
                );
                setInstructions(
                    typeof settings.instructions === "string" ? settings.instructions : "",
                );
                setMessages(Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : []);
                setSettingsLoaded(true);
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted)
                    setChatError(
                        error instanceof Error
                            ? error.message
                            : "Could not load Playground data from PostgreSQL.",
                    );
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
                    body: JSON.stringify({
                        model,
                        maxTokens,
                        temperature,
                        topP,
                        frequencyPenalty,
                        presencePenalty,
                        instructions,
                    }),
                });
                const data = await response.json();
                if (!response.ok)
                    throw new Error(data.error || "Could not save Playground settings.");
            } catch (error) {
                setChatError(
                    error instanceof Error
                        ? error.message
                        : "Could not save Playground settings to PostgreSQL.",
                );
            }
        }, 650);
        return () => window.clearTimeout(timer);
    }, [
        frequencyPenalty,
        instructions,
        maxTokens,
        model,
        presencePenalty,
        settingsLoaded,
        temperature,
        topP,
    ]);

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
                const available = Array.isArray(data.models)
                    ? data.models.filter(
                          (item: unknown): item is string => typeof item === "string",
                      )
                    : [];
                setModels(available);
                setAdminRoutingModel(
                    typeof data.adminRouterModel === "string" ? data.adminRouterModel : "",
                );
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                setModelError(error instanceof Error ? error.message : "Could not load model IDs.");
            });
        return () => controller.abort();
    }, [reloadModels]);

    useEffect(() => {
        const timer = window.setInterval(() => setReloadModels((value) => value + 1), 60000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, busy]);

    async function submitMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await sendMessage(draft);
    }

    async function sendMessage(content: string) {
        if (!content.trim() || busy || sendingRef.current) return;
        sendingRef.current = true;
        const nextMessages = [
            ...messages,
            {
                id: crypto.randomUUID(),
                role: "user" as const,
                content,
                createdAt: new Date().toISOString(),
            },
        ];
        setMessages(nextMessages);
        setDraft("");
        setChatError("");
        setChatNotice("");
        setBusy(true);
        try {
            const response = await fetch("/api/playground", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model.trim() || models[0] || "",
                    instructions,
                    temperature,
                    topP,
                    frequencyPenalty,
                    presencePenalty,
                    maxTokens,
                    messages: recentChat(nextMessages).map(({ role, content: text }) => ({
                        role,
                        content: text,
                    })),
                }),
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || "The agent could not complete this run.");
            const reply = String(data.reply ?? "");
            setChoices(Array.isArray(data.choices) ? data.choices : homeChoices);

            // Display a successfully generated answer even if history storage fails.
            // A storage failure must not force another billable model request.
            setMessages([
                ...nextMessages,
                {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: reply,
                    createdAt: data.recordedAt || new Date().toISOString(),
                },
            ]);
            setChatNotice(typeof data.warning === "string" ? data.warning : "");
            try {
                const snapshotResponse = await fetch("/api/playground/employee", {
                    cache: "no-store",
                });
                if (snapshotResponse.ok) setEmployee(await snapshotResponse.json());
            } catch {
                /* Keep a successfully completed reply if the progress refresh fails. */
            }
            try {
                const saved = await fetch("/api/playground/state", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userContent: content, assistantContent: reply }),
                });
                const result = await saved.json();
                if (!saved.ok) throw new Error("History save failed");
                setMessages([...messages, ...(result.messages as ChatMessage[])]);
            } catch {
                setChatNotice(
                    [
                        data.warning,
                        "Your answer is ready, but it could not be saved to history. Keep this chat open or copy the answer before reloading.",
                    ]
                        .filter(Boolean)
                        .join(" "),
                );
            }
        } catch (error) {
            setMessages(messages);
            setDraft((current) => current || content);
            setChatError(
                error instanceof Error ? error.message : "The agent could not complete this run.",
            );
        } finally {
            sendingRef.current = false;
            setBusy(false);
        }
    }

    async function resetConversation() {
        try {
            const response = await fetch("/api/playground/state", { method: "DELETE" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not clear Playground history.");
            setMessages([]);
            setChoices(homeChoices);

            setEmployee((current) => (current ? { ...current, draft: null } : current));
            setChatError("");
            setChatNotice("");
        } catch (error) {
            setChatError(
                error instanceof Error
                    ? error.message
                    : "Could not clear Playground history from PostgreSQL.",
            );
        }
    }

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden">
            <section className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-[#eceef2] px-5 sm:px-7">
                    <div className="flex items-center gap-2 text-[12px] text-[#9aa2af]">
                        <span>Agent Studio</span>
                        <span>/</span>
                        <span className="font-medium text-[#414a59]">Playground · Super Bot</span>
                    </div>
                    <button
                        type="button"
                        aria-label="New chat"
                        title="New chat"
                        onClick={resetConversation}
                        disabled={busy}
                        className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-[#778193] transition hover:bg-[#f4f5f8] hover:text-[#454f60] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        <RotateCcw className="size-4" />
                        New chat
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-8">
                        <div
                            className={`mx-auto flex min-h-full w-full max-w-[790px] flex-col py-8 ${messages.length ? "justify-start gap-5" : "justify-center"}`}
                        >
                            {messages.length === 0 ? (
                                <div className="mx-auto max-w-[610px] text-center">
                                    <div className="mx-auto flex size-[54px] items-center justify-center rounded-2xl border border-[#e7e5fb] bg-gradient-to-br from-[#f7f6ff] to-white text-[#6659e8] shadow-sm">
                                        <Sparkles className="size-6" />
                                    </div>
                                    <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#766ce1]">
                                        AIForce.Ops · {workspaceLabel}
                                    </p>
                                    <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-[#252c38] sm:text-[29px]">
                                        {welcomeTitle}
                                    </h1>
                                    <p className="mx-auto mt-3 max-w-[480px] text-[13px] leading-6 text-[#7b8493]">
                                        {welcomeDescription}
                                    </p>
                                    {employee && role !== "user" && (
                                        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[#7b8493]">
                                            <button
                                                type="button"
                                                onClick={() => void sendMessage("About me")}
                                                className="text-[#5d52c8] hover:underline"
                                            >
                                                {employee.profile.name} ·{" "}
                                                {employee.profile.role.charAt(0).toUpperCase() +
                                                    employee.profile.role.slice(1)}
                                            </button>
                                            {role !== "admin" && (
                                                <>
                                                    <span>
                                                        {employee.profile.department ||
                                                            "Department not assigned"}
                                                    </span>
                                                    <Link
                                                        href="/dashboard/my-requests"
                                                        className="text-[#5d52c8] hover:underline"
                                                    >
                                                        {
                                                            employee.requests.filter(
                                                                (request) =>
                                                                    request.status ===
                                                                    "pending_approval",
                                                            ).length
                                                        }{" "}
                                                        pending in your recent requests
                                                    </Link>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                messages.map((item) => (
                                    <article
                                        key={item.id}
                                        className={`max-w-[min(92%,680px)] rounded-2xl border px-5 py-4 text-[13px] leading-6 shadow-[0_3px_14px_rgba(31,41,55,0.035)] ${item.role === "user" ? "self-end rounded-br-md border-[#e8e6fb] bg-[#f7f6ff] text-[#333b49]" : "self-start rounded-bl-md border-[#e8eaf0] bg-white text-[#333b49]"}`}
                                    >
                                        <div
                                            className={`mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${item.role === "user" ? "text-[#7065d8]" : "text-[#687385]"}`}
                                        >
                                            <span
                                                className={`flex size-5 items-center justify-center rounded-full ${item.role === "user" ? "bg-[#e9e7ff]" : "bg-[#eef0f5]"}`}
                                            >
                                                {item.role === "user" ? (
                                                    <User className="size-3" />
                                                ) : (
                                                    <Bot className="size-3" />
                                                )}
                                            </span>
                                            {item.role === "user" ? "You" : "AIForce.Ops"}
                                        </div>
                                        {item.role === "user" ? (
                                            <div className="whitespace-pre-wrap break-words [tab-size:4]">
                                                {choiceLabel(item.content)}
                                            </div>
                                        ) : (
                                            <div className="markdown-message">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({ children }) => (
                                                            <p className="mb-3 last:mb-0">
                                                                {children}
                                                            </p>
                                                        ),
                                                        em: ({ children }) => (
                                                            <em className="italic">{children}</em>
                                                        ),
                                                        strong: ({ children }) => (
                                                            <strong className="font-semibold">
                                                                {children}
                                                            </strong>
                                                        ),
                                                        h1: ({ children }) => (
                                                            <h2 className="mb-3 mt-4 text-base font-semibold first:mt-0">
                                                                {children}
                                                            </h2>
                                                        ),
                                                        h2: ({ children }) => (
                                                            <h3 className="mb-2 mt-4 text-[14px] font-semibold first:mt-0">
                                                                {children}
                                                            </h3>
                                                        ),
                                                        h3: ({ children }) => (
                                                            <h4 className="mb-2 mt-3 text-[13px] font-semibold first:mt-0">
                                                                {children}
                                                            </h4>
                                                        ),
                                                        ul: ({ children }) => (
                                                            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
                                                                {children}
                                                            </ul>
                                                        ),
                                                        ol: ({ children }) => (
                                                            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
                                                                {children}
                                                            </ol>
                                                        ),
                                                        li: ({ children }) => (
                                                            <li className="pl-0.5">{children}</li>
                                                        ),
                                                        blockquote: ({ children }) => (
                                                            <blockquote className="my-3 border-l-2 border-[#c7c2fb] pl-3 text-[#697386]">
                                                                {children}
                                                            </blockquote>
                                                        ),
                                                        code: ({ children, className }) => (
                                                            <code
                                                                className={`${className ?? ""} rounded bg-[#f2f3f7] px-1.5 py-0.5 font-mono text-[11px] text-[#5247bd]`}
                                                            >
                                                                {children}
                                                            </code>
                                                        ),
                                                        pre: ({ children }) => (
                                                            <pre className="my-3 overflow-x-auto rounded-xl bg-[#202631] p-3 text-[11px] leading-5 text-[#eef0f6]">
                                                                {children}
                                                            </pre>
                                                        ),
                                                        a: ({ children, href }) => (
                                                            <a
                                                                href={href}
                                                                target={
                                                                    href?.startsWith("http")
                                                                        ? "_blank"
                                                                        : undefined
                                                                }
                                                                rel={
                                                                    href?.startsWith("http")
                                                                        ? "noreferrer"
                                                                        : undefined
                                                                }
                                                                className="font-medium text-[#5d52d8] underline decoration-[#c7c2fb] underline-offset-2"
                                                            >
                                                                {children}
                                                            </a>
                                                        ),
                                                        table: ({ children }) => (
                                                            <div className="my-3 overflow-x-auto">
                                                                <table className="w-full border-collapse text-left text-xs">
                                                                    {children}
                                                                </table>
                                                            </div>
                                                        ),
                                                        th: ({ children }) => (
                                                            <th className="border-b border-slate-200 p-2 font-semibold">
                                                                {children}
                                                            </th>
                                                        ),
                                                        td: ({ children }) => (
                                                            <td className="border-b border-slate-100 p-2">
                                                                {children}
                                                            </td>
                                                        ),
                                                        hr: () => (
                                                            <hr className="my-4 border-[#e8eaf0]" />
                                                        ),
                                                    }}
                                                >
                                                    {item.content}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                        {item.createdAt && (
                                            <p className="mt-3 text-[10px] text-[#8992a2]">
                                                {new Date(item.createdAt).toLocaleString("en-IN", {
                                                    dateStyle: "medium",
                                                    timeStyle: "short",
                                                })}
                                            </p>
                                        )}
                                    </article>
                                ))
                            )}
                            {!busy && role && (
                                <div
                                    className={`flex flex-wrap gap-2 ${messages.length === 0 && role === "admin" ? "mt-7 justify-center" : ""}`}
                                    aria-label={
                                        role === "admin"
                                            ? "Admin shortcuts"
                                            : "Employee service choices"
                                    }
                                >
                                    {choices
                                        .filter(
                                            (choice) =>
                                                role !== "admin" ||
                                                !employeeHome.includes(choice) ||
                                                adminHome.includes(choice),
                                        )
                                        .map((choice) => (
                                            <button
                                                type="button"
                                                key={choice}
                                                onClick={() => void sendMessage(choice)}
                                                className="rounded-xl border border-[#dcd7fa] bg-[#faf9ff] px-4 py-2 text-xs font-medium text-[#5d52c8] transition hover:bg-[#eeebff]"
                                            >
                                                {choiceLabel(choice)}
                                            </button>
                                        ))}
                                </div>
                            )}
                            {busy && (
                                <div className="flex items-center gap-2 self-start rounded-xl border border-[#e8eaf0] bg-white px-4 py-3 text-[11px] text-[#7b8493]">
                                    <LoaderCircle className="size-4 animate-spin text-[#6255e8]" />
                                    Thinking…
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>
                    </div>

                    <form
                        onSubmit={submitMessage}
                        className="w-full shrink-0 border-t border-[#f0f1f5] bg-white px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-8"
                    >
                        <div className="mx-auto w-full max-w-[790px]">
                            {chatNotice && (
                                <p
                                    role="status"
                                    className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800"
                                >
                                    {chatNotice}
                                </p>
                            )}
                            {chatError && (
                                <div
                                    role="alert"
                                    className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11px] leading-5 text-rose-700"
                                >
                                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                    {chatError}
                                </div>
                            )}
                            <label htmlFor="playground-message" className="sr-only">
                                Message the Agent Studio Playground
                            </label>
                            <div className="flex items-end gap-2 rounded-2xl border border-[#dfe2e9] bg-white p-2 shadow-[0_5px_22px_rgba(31,41,55,0.045)] transition focus-within:border-[#afa9f4] focus-within:ring-4 focus-within:ring-[#6f63e8]/[0.07]">
                                <textarea
                                    ref={messageInputRef}
                                    id="playground-message"
                                    rows={1}
                                    value={draft}
                                    onChange={(event) => setDraft(event.currentTarget.value)}
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === "Enter" &&
                                            !event.shiftKey &&
                                            !event.nativeEvent.isComposing
                                        ) {
                                            event.preventDefault();
                                            event.currentTarget.form?.requestSubmit();
                                        }
                                    }}
                                    placeholder="Type your request in the same words you would ask a person…"
                                    className="max-h-[180px] min-h-[42px] min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent px-3 py-2.5 text-[13px] leading-5 text-[#303846] outline-none placeholder:text-[#a0a7b3]"
                                />
                                <button
                                    type="submit"
                                    aria-label="Send message"
                                    disabled={!draft.trim() || busy}
                                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#6255e8] text-white shadow-sm transition hover:bg-[#5146d2] disabled:cursor-not-allowed disabled:bg-[#cbc8f5]"
                                >
                                    {busy ? (
                                        <LoaderCircle className="size-4 animate-spin" />
                                    ) : (
                                        <Send className="size-4" />
                                    )}
                                </button>
                            </div>
                            <p className="mt-2 text-center text-[10px] text-[#a0a6b1]">
                                AIForce.Ops · {workspaceLabel} · Review details before confirming
                            </p>
                        </div>
                    </form>
                </div>
            </section>

            {configurationOpen && (
                <aside
                    aria-label="Playground configuration"
                    className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,410px)] shrink-0 flex-col overflow-y-auto border-l border-[#e6e8ed] bg-white shadow-2xl md:relative md:z-0 md:w-[360px] md:shadow-none xl:w-[410px] 2xl:w-[450px]"
                >
                    <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-[#eceef2] px-5 sm:px-6">
                        <div>
                            <h2 className="text-[14px] font-semibold text-[#303846]">
                                Configurations
                            </h2>
                            <p className="mt-0.5 text-[10px] text-[#9199a7]">
                                OpenAI model · session settings
                            </p>
                        </div>
                    </div>
                    <div className="space-y-6 p-5 sm:p-6">
                        <label className="block">
                            <span className="mb-2 block text-[12px] font-medium text-[#465064]">
                                Model ID <span className="text-[#df6b6b]">*</span>
                            </span>
                            <ThemedSelect
                                aria-label="Model ID"
                                value={model || models[0] || ""}
                                onChange={(event) => setModel(event.currentTarget.value)}
                                disabled={!models.length}
                                className="h-11 w-full rounded-lg border border-[#dfe2e8] bg-white px-3.5 text-[12px] text-[#515b6c] outline-none focus:border-[#a9a2f2]"
                            >
                                <option value="">Choose an OpenAI text-chat model</option>
                                {model && !models.includes(model) && (
                                    <option value={model} disabled>
                                        Previously selected model is unavailable
                                    </option>
                                )}
                                {models.map((item, index) => (
                                    <option key={item} value={item}>
                                        {index + 1}. {item}
                                    </option>
                                ))}
                            </ThemedSelect>
                        </label>
                        <div className="-mt-4 flex items-start justify-between gap-2 text-[10px] leading-4">
                            <span className={modelError ? "text-amber-700" : "text-[#8992a2]"}>
                                {modelError ||
                                    (models.length
                                        ? `${models.length} OpenAI text-chat models available.`
                                        : "Loading model IDs…")}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setModelError("");
                                    setReloadModels((value) => value + 1);
                                }}
                                className="shrink-0 font-medium text-[#5e54d8] hover:underline"
                            >
                                Refresh
                            </button>
                        </div>
                        {role === "admin" && adminRoutingModel && (
                            <p className="-mt-3 text-[10px] leading-4 text-[#8992a2]">
                                General answers use your selected model. Admin action routing uses{" "}
                                {adminRoutingModel === "selected"
                                    ? "the selected model"
                                    : adminRoutingModel}
                                ; its usage is included in Usage tracking.
                            </p>
                        )}
                        <label className="block">
                            <span className="flex items-center justify-between gap-2 text-[12px] font-medium text-[#465064]">
                                Max tokens{" "}
                                <span className="tabular-nums text-[#697386]">
                                    {maxTokens === 0 ? "Model default" : maxTokens}
                                </span>
                            </span>
                            <input
                                aria-label="Max tokens"
                                className="studio-range mt-2 block w-full cursor-pointer"
                                type="range"
                                min="0"
                                max="4000"
                                step="100"
                                value={maxTokens}
                                onChange={(event) =>
                                    setMaxTokens(Number(event.currentTarget.value))
                                }
                            />
                            <span className="mt-1 flex justify-between text-[10px] text-[#8992a2]">
                                <span>Model default</span>
                                <span>4000</span>
                            </span>
                            <span className="mt-2 block text-[10px] text-[#8992a2]">
                                Includes reasoning tokens. Increase this limit for detailed answers.
                            </span>
                        </label>
                        <fieldset
                            disabled={!/^gpt-4(?:\.1|o)(?:-|$)/.test(model)}
                            className="grid grid-cols-1 gap-x-6 gap-y-6 disabled:opacity-50 xl:grid-cols-2"
                        >
                            <RangeSetting
                                label="Temperature"
                                value={temperature}
                                onChange={setTemperature}
                                max={2}
                            />
                            <RangeSetting label="Top p" value={topP} onChange={setTopP} />
                            <RangeSetting
                                label="Frequency penalty"
                                value={frequencyPenalty}
                                onChange={setFrequencyPenalty}
                                min={-2}
                                max={2}
                            />
                            <RangeSetting
                                label="Presence penalty"
                                value={presencePenalty}
                                onChange={setPresencePenalty}
                                min={-2}
                                max={2}
                            />
                        </fieldset>
                        {!/^gpt-4(?:\.1|o)(?:-|$)/.test(model) && (
                            <p className="text-[10px] text-slate-500">
                                Sampling controls are managed automatically for this model.
                            </p>
                        )}
                        <label className="block">
                            <span className="mb-2 block text-[12px] font-medium text-[#465064]">
                                System instructions
                            </span>
                            <textarea
                                value={instructions}
                                onChange={(event) => setInstructions(event.currentTarget.value)}
                                rows={5}
                                maxLength={12000}
                                placeholder="Add instructions for this Playground session"
                                className="w-full resize-y rounded-lg border border-[#dfe2e8] bg-white px-3.5 py-3 text-[12px] leading-5 text-[#465064] outline-none transition placeholder:text-[#a0a7b3] focus:border-[#a9a2f2] focus:ring-3 focus:ring-[#6255e8]/10"
                            />
                        </label>
                        <div className="rounded-xl border border-[#e9e6fb] bg-[#faf9ff] p-3.5">
                            <div className="flex items-start gap-2.5 text-[#6a61ca]">
                                <Sparkles className="mt-0.5 size-4 shrink-0" />
                                <p className="text-[11px] leading-[18px] text-[#72798a]">
                                    Messages are sent securely through the server-side OpenAI
                                    Responses API. The API key is never sent to this browser.
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>
            )}
        </div>
    );
}
