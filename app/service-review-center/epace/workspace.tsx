"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import Link from "next/link";
import WorkspaceLink from "@/components/workspace-link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Database,
  Download,
  FlaskConical,
  Layers3,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import {
  categories,
  metrics,
  defaultSettings,
  type RecordRow,
  type RunData,
  type Settings,
  type Snapshot,
  type Source,
  type Kind,
  type Moderation,
} from "@/lib/epace/types";
import {
  percentile,
  runsInWindow,
  summarize,
  series,
} from "@/lib/epace/analytics";
import "./workspace.css";

type View =
  | "chat"
  | "knowledge"
  | "tracing"
  | "safety"
  | "alerts"
  | "catalog"
  | "create"
  | "prompts"
  | "lifecycle"
  | "radar"
  | "access";
type Dialog = {
  type:
    "project" | "record" | "run" | "source" | "feedback" | "compare" | "alert";
  record?: RecordRow;
  kind?: Kind;
  source?: Source;
};
const navigation = [
  { id: "chat", label: "CognitiveConnect", icon: MessageSquare },
  { id: "knowledge", label: "Knowledge & indexes", icon: Database },
  { id: "tracing", label: "Tracing & monitoring", icon: Activity },
  { id: "safety", label: "Safety & security", icon: ShieldCheck },
  { id: "alerts", label: "Quality alerts", icon: FlaskConical },
  { id: "catalog", label: "Platform catalog", icon: Box },
  { id: "create", label: "Create component", icon: Plus },
  { id: "prompts", label: "Prompts & code assistant", icon: Code2 },
  { id: "lifecycle", label: "Lifecycle & assessment", icon: Workflow },
  { id: "radar", label: "Tech radar", icon: Layers3 },
  { id: "access", label: "Access & audit", icon: ShieldCheck },
] as const;
const titles: Record<View, [string, string]> = {
  chat: [
    "Chat with your data",
    "Ask questions grounded in your project knowledge.",
  ],
  knowledge: [
    "Knowledge & indexes",
    "Upload and manage the documents behind your answers.",
  ],
  tracing: [
    "Tracing & monitoring",
    "Inspect real runs, conversations, performance, and feedback.",
  ],
  safety: [
    "Safety & security",
    "Manage input and output policies and inspect moderation activity.",
  ],
  alerts: [
    "Quality alerts",
    "Review safety events and model evaluation thresholds.",
  ],
  catalog: [
    "Platform catalog",
    "Your registered services, APIs, and documentation.",
  ],
  create: [
    "Create a new component",
    "Build a RAG service from a template or register an existing component.",
  ],
  prompts: [
    "Prompts & code assistant",
    "Version your instructions and generate code from your actual project context.",
  ],
  lifecycle: [
    "Platform lifecycle",
    "Design and build. Onboard and stabilize. Operate and improve.",
  ],
  radar: [
    "Technology radar",
    "Track the technologies your platform uses and their adoption decisions.",
  ],
  access: [
    "Access & audit",
    "Inspect workspace ownership and recorded changes.",
  ],
};
function Panel({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="pace-panel">
      {title && (
        <div className="pace-row spread">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="pace-empty">
      <Database size={35} />
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}
function Tabs({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="pace-tabs">
      {values.map((v) => (
        <button
          type="button"
          key={v}
          className={value === v ? "active" : ""}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
  children,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="pace-field">
      <label htmlFor={name}>{label}</label>
      {children ||
        (type === "textarea" ? (
          <textarea
            id={name}
            name={name}
            defaultValue={value}
            required={required}
            maxLength={12000}
          />
        ) : (
          <input
            id={name}
            name={name}
            type={type}
            defaultValue={value}
            required={required}
            maxLength={2000}
          />
        ))}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const nodes = el.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input,select,textarea,a[href]",
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="pace-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`pace-modal ${wide ? "wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="pace-icon"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Chart({
  title,
  points,
  unit = "",
}: {
  title: string;
  points: { time: string; value: number | null }[];
  unit?: string;
}) {
  const values = points.filter((p) => p.value !== null);
  const max = Math.max(1, ...values.map((p) => p.value || 0));
  const coords = points.map((p, i) =>
    p.value === null
      ? null
      : `${38 + (i * 520) / 23},${165 - ((p.value || 0) * 140) / max}`,
  );
  const segments: string[] = [];
  let segment = "";
  for (const point of coords) {
    if (point) segment += (segment ? " " : "") + point;
    else if (segment) {
      segments.push(segment);
      segment = "";
    }
  }
  if (segment) segments.push(segment);
  return (
    <Panel title={title}>
      {!values.length ? (
        <div className="pace-empty" style={{ padding: 55 }}>
          No measurements in this time range.
        </div>
      ) : (
        <svg
          viewBox="0 0 580 210"
          className="pace-chart"
          role="img"
          aria-label={`${title} from actual run records`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={38} x2={560} y1={165 - f * 140} y2={165 - f * 140} />
              <text x={2} y={169 - f * 140}>
                {(max * f).toFixed(max < 10 ? 1 : 0)}
                {unit}
              </text>
            </g>
          ))}
          {segments.map((s, i) => (
            <polyline
              key={i}
              points={s}
              fill="none"
              stroke="#7968e4"
              strokeWidth={2}
            />
          ))}
          {points.map((p, i) =>
            p.value === null ? null : (
              <circle
                key={i}
                cx={38 + (i * 520) / 23}
                cy={165 - ((p.value || 0) * 140) / max}
                r={3}
                fill="#7968e4"
              >
                <title>
                  {new Date(p.time).toLocaleString()}: {p.value?.toFixed(2)}
                  {unit}
                </title>
              </circle>
            ),
          )}
          {[0, 8, 16, 23].map((i) => (
            <text key={i} x={38 + (i * 520) / 23} y={196} textAnchor="middle">
              {new Date(points[i].time).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </text>
          ))}
        </svg>
      )}
    </Panel>
  );
}
const fmt = (v: number | null | undefined, suffix = "") =>
  v == null
    ? "—"
    : `${Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)}${suffix}`;
function download(name: string, value: unknown) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type: typeof value === "string" ? "text/plain" : "application/json" },
    ),
  );
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

const workspaceCache = new Map<
  string,
  { snapshot: Snapshot | null; pid: string; threadId: string; view: View }
>();
export default function EpaceWorkspace({
  userName,
  userId,
}: {
  userName: string;
  userId: string;
}) {
  const cached = workspaceCache.get(userId);
  const [view, setView] = useState<View>(cached?.view || "chat"),
    [snapshot, setSnapshot] = useState<Snapshot | null>(
      cached?.snapshot || null,
    ),
    [pid, setPid] = useState(cached?.pid || ""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [connected, setConnected] = useState(false),
    [mobile, setMobile] = useState(false),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [draft, setDraft] = useState<Settings>(defaultSettings),
    [models, setModels] = useState<string[]>([]),
    [modelsError, setModelsError] = useState(""),
    [busy, setBusy] = useState(false);
  const [traceTab, setTraceTab] = useState("Runs"),
    [safetyTab, setSafetyTab] = useState("Content filters"),
    [catalogTab, setCatalogTab] = useState("Components"),
    [hours, setHours] = useState(24 * 30),
    [search, setSearch] = useState(""),
    [templateOwner, setTemplateOwner] = useState(""),
    [templateCategory, setTemplateCategory] = useState(""),
    [starredOnly, setStarredOnly] = useState(false),
    [status, setStatus] = useState("All statuses"),
    [runType, setRunType] = useState("Root runs"),
    [columns, setColumns] = useState(false),
    [hiddenColumns, setHiddenColumns] = useState<string[]>([]),
    [tag, setTag] = useState("");
  const [threadId, setThreadId] = useState(cached?.threadId || ""),
    [question, setQuestion] = useState(""),
    [chatBusy, setChatBusy] = useState(false),
    [chatStatus, setChatStatus] = useState(""),
    [streamText, setStreamText] = useState(""),
    [liveQuestion, setLiveQuestion] = useState(""),
    [testText, setTestText] = useState(""),
    [testResult, setTestResult] = useState<Moderation | null>(null),
    [sourceContent, setSourceContent] = useState("");
  useEffect(() => {
    workspaceCache.set(userId, { snapshot, pid, threadId, view });
  }, [userId, snapshot, pid, threadId, view]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const project = snapshot?.project || null,
    records = snapshot?.records || [];
  const recordsOf = (kind: Kind) => records.filter((r) => r.kind === kind);
  const reload = useCallback(async (projectId?: string) => {
    const response = await fetch(
      `/api/epace${projectId ? `?project=${projectId}` : ""}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load ePACE.");
    setSnapshot(data);
    return data as Snapshot;
  }, []);
  useEffect(() => {
    let active = true;
    fetch(`/api/epace${pid ? `?project=${pid}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) setSnapshot(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const event = new EventSource(
      `/api/epace/events${pid ? `?project=${pid}` : ""}`,
    );
    event.onmessage = (e) => {
      if (active) {
        setSnapshot(JSON.parse(e.data));
        setConnected(true);
      }
    };
    event.onerror = () => {
      if (active) setConnected(false);
    };
    event.addEventListener("unavailable", () => {
      if (active) setConnected(false);
    });
    return () => {
      active = false;
      event.close();
    };
  }, [pid, reload]);
  useEffect(() => {
    fetch("/api/playground/models")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setModels(
          (data.models || []).filter(
            (m: string) =>
              /^(gpt-|o[1-9]|chat-latest)/.test(m) &&
              !/audio|image|realtime|transcribe|tts|search|codex|instruct/.test(
                m,
              ),
          ),
        );
      })
      .catch((e) => setModelsError(e.message));
  }, []);
  const mutate = async (body: Record<string, unknown>) => {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/epace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project?.id, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await reload(project?.id);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const act = (body: Record<string, unknown>, done?: () => void) => {
    void mutate(body)
      .then(() => {
        done?.();
        setNotice("Saved to your project.");
      })
      .catch(() => {});
  };
  const openSettings = () => {
    setDraft(project?.settings || defaultSettings);
    setSettingsOpen(true);
  };
  const chooseView = (v: View) => {
    setView(v);
    setSearch("");
    setMobile(false);
    setNotice("");
  };
  const remove = (r: RecordRow) => {
    if (
      window.confirm(
        `Permanently delete ${String(r.data.name || r.kind)}? This cannot be undone.`,
      )
    )
      act({ action: "delete", id: r.id });
  };
  const visibleRuns = useMemo(
    () => runsInWindow(snapshot?.records || [], hours),
    [snapshot, hours],
  );
  const filteredRuns = visibleRuns.filter(
    (r) =>
      (status === "All statuses" || r.run.status === status) &&
      (tag === "" || r.run.tags.includes(tag)) &&
      JSON.stringify(r.run).toLowerCase().includes(search.toLowerCase()),
  );
  const dataRuns = visibleRuns.map((r) => r.run),
    stats = summarize(dataRuns),
    chatRuns = records
      .filter(
        (r) =>
          r.kind === "run" &&
          (r.data as unknown as RunData).threadId === threadId,
      )
      .slice()
      .reverse();
  const closeDialog = useCallback(() => {
    setDialog(null);
    setSourceContent("");
  }, []);
  const openSource = async (source: Source) => {
    setDialog({ type: "source", source });
    setSourceContent(source.content);
    try {
      const r = await fetch(
        `/api/epace/documents?project=${project?.id}&id=${source.documentId}`,
      );
      const d = await r.json();
      if (r.ok) setSourceContent(d.data.content);
    } catch {}
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("projectId", project!.id);
      form.set("file", file);
      const r = await fetch("/api/epace/documents", {
        method: "POST",
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await reload(project!.id);
      setNotice(
        `Uploaded ${file.name}. ${d.chunks} searchable passages saved.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  const sendQuestion = async (e?: FormEvent, override?: string) => {
    e?.preventDefault();
    const input = override || question;
    if (!input.trim() || chatBusy || !project) return;
    setChatBusy(true);
    setLiveQuestion(input);
    setStreamText("");
    setChatStatus("Starting run");
    setQuestion("");
    setError("");
    try {
      const r = await fetch("/api/epace/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          threadId: threadId || undefined,
          question: input,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error);
      }
      const reader = r.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const type = frame.match(/^event: (.+)$/m)?.[1],
            json = frame.match(/^data: (.+)$/m)?.[1];
          if (!json) continue;
          const d = JSON.parse(json);
          if (type === "run") setThreadId(d.threadId);
          else if (type === "status") setChatStatus(d.message);
          else if (type === "delta") setStreamText((t) => t + d.text);
          else if (type === "done") {
            setStreamText(d.run.output);
            setChatStatus("Run saved");
          } else if (type === "error") throw new Error(d.message);
        }
      }
      await reload(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed.");
    } finally {
      setChatBusy(false);
      setLiveQuestion("");
      setStreamText("");
      setChatStatus("");
    }
  };
  const saveSettings = () =>
    act({ action: "settings", settings: draft }, () => setSettingsOpen(false));
  const uploadButton = (
    <label className="pace-btn" style={{ cursor: busy ? "wait" : "pointer" }}>
      <Plus size={16} />
      Upload file
      <input
        type="file"
        hidden
        disabled={busy}
        accept=".pdf,.docx,.txt,.md,.csv,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </label>
  );
  const askExamples = recordsOf("document").length
    ? [
        "Summarize the key points in my project documents.",
        "What evidence is available for the current operating model?",
        "Compare the approaches described in my knowledge sources.",
      ]
    : [
        "What can I learn from uploaded documents?",
        "Help me structure a platform assessment.",
        "What knowledge should I add for this project?",
      ];
  const runDialog = dialog?.record
    ? records.find((r) => r.id === dialog.record!.id) || dialog.record
    : undefined;
  return (
    <div className="pace">
      <header className="pace-top">
        <div className="pace-brand">
          <button
            className="pace-icon pace-mobile"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <span className="pace-logo">
            <Sparkles size={25} />
          </span>
          <div>
            <strong>
              ePACE
              <span style={{ color: "#a39bcf", fontWeight: 400, fontSize: 15 }}>
                {" "}
                / Cognitive infra
              </span>
            </strong>
            <small>AIForce.Ops · Platform lifecycle workspace</small>
          </div>
        </div>
        <div className="pace-top-right">
          <span className="pace-live">
            <i style={{ background: connected ? "#19ad89" : "#e3ad43" }} />
            {connected ? "Live project updates" : "Reconnecting"}
          </span>
          <span className="pace-user pace-muted">{userName}</span>
          <WorkspaceLink className="pace-btn" href="/service-review-center" destination="Review Center">
            <ArrowLeft size={15} />
            Review center
          </WorkspaceLink>
        </div>
      </header>
      <div className="pace-layout">
        <aside className={`pace-nav ${mobile ? "open" : ""}`}>
          <small>COGNITIVE PLATFORM</small>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => chooseView(item.id)}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
          <small className="bottom">OPERATIONS</small>
          <Link href="/service-review-center/eassist">
            <Workflow size={18} />
            eAssist operations
            <ChevronRight size={14} />
          </Link>
        </aside>
        <main className="pace-main">
          <div className="pace-heading">
            <div>
              <div className="pace-eyebrow">
                ePACE workspace · {project?.name || "Get started"}
              </div>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            <div className="pace-row">
              <select
                aria-label="Project"
                value={project?.id || ""}
                disabled={chatBusy}
                onChange={(e) => {
                  setPid(e.target.value);
                  setThreadId("");
                }}
              >
                <option value="" disabled>
                  Select a project
                </option>
                {snapshot?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                className="pace-btn"
                aria-label="Create project"
                onClick={() => setDialog({ type: "project" })}
              >
                <Plus size={17} />
              </button>
            </div>
          </div>
          {error && (
            <div className="pace-alert" role="alert">
              {error}
              <button
                className="pace-icon"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div
              className="pace-note"
              role="status"
              style={{ marginBottom: 20 }}
            >
              {notice}
              <button
                className="pace-icon"
                aria-label="Dismiss notice"
                onClick={() => setNotice("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {!snapshot ? (
            <div className="pace-placeholder">
              <RefreshCw size={18} /> Connecting to your workspace…
            </div>
          ) : !project ? (
            <Panel>
              <Empty
                title="Your cognitive platform starts here"
                detail="Create a project to store knowledge, conversations, safety policies, and platform components."
                action={
                  <button
                    className="pace-btn primary"
                    onClick={() => setDialog({ type: "project" })}
                  >
                    <Plus size={16} />
                    Create project
                  </button>
                }
              />
            </Panel>
          ) : (
            <>
              {view === "chat" && (
                <>
                  <div className="pace-toolbar">
                    <div className="pace-row">
                      <span className="pace-badge">{project.name}</span>
                      <span className="pace-muted">
                        {recordsOf("document").length} knowledge sources ·{" "}
                        {project.settings.model || "Select a model"}
                      </span>
                    </div>
                    <div className="pace-row">
                      <button
                        className="pace-btn"
                        disabled={chatBusy}
                        onClick={() => {
                          setThreadId("");
                          setQuestion("");
                        }}
                      >
                        New chat
                      </button>
                      {threadId && (
                        <button
                          className="pace-btn"
                          disabled={chatBusy}
                          onClick={() => {
                            const r = recordsOf("thread").find(
                              (r) => r.id === threadId,
                            );
                            if (
                              r &&
                              window.confirm(
                                "Delete this conversation and its runs permanently?",
                              )
                            )
                              act({ action: "delete", id: r.id }, () =>
                                setThreadId(""),
                              );
                          }}
                        >
                          <Trash2 size={15} />
                          Clear chat
                        </button>
                      )}
                      <button className="pace-btn" onClick={openSettings}>
                        <Settings2 size={16} />
                        Developer settings
                      </button>
                    </div>
                  </div>
                  <div className="pace-chat">
                    {!chatRuns.length && !chatBusy ? (
                      <div className="pace-chat-welcome">
                        <div className="spark">
                          <Sparkles size={46} />
                        </div>
                        <div className="pace-eyebrow">
                          CognitiveConnect · Powered by ePACE
                        </div>
                        <h2 style={{ marginTop: 15 }}>Chat with your data</h2>
                        <p>Ask anything or try an example</p>
                        <div className="pace-suggestions">
                          {askExamples.map((q) => (
                            <button key={q} onClick={() => setQuestion(q)}>
                              {q}
                              <ArrowRight
                                size={16}
                                style={{ marginTop: 16, color: "#9385da" }}
                              />
                            </button>
                          ))}
                        </div>
                        <span className="pace-muted">
                          Upload project knowledge for grounded answers with
                          citations.
                        </span>
                      </div>
                    ) : (
                      <div className="pace-messages">
                        {chatRuns.map((row) => {
                          const run = row.data as unknown as RunData;
                          if (run.status === "pending" && chatBusy) return null;
                          return (
                            <div key={row.id} style={{ display: "contents" }}>
                              <div className="pace-user-message">
                                {run.input}
                              </div>
                              <article className="pace-answer">
                                <div className="pace-row spread">
                                  <Sparkles size={20} color="#8b7ce1" />
                                  <div className="pace-row">
                                    <span
                                      className={`pace-badge ${run.status}`}
                                    >
                                      {run.status}
                                    </span>
                                    <button
                                      className="pace-icon"
                                      title="Inspect run and context"
                                      onClick={() =>
                                        setDialog({ type: "run", record: row })
                                      }
                                    >
                                      <FlaskConical size={16} />
                                    </button>
                                    <button
                                      className="pace-icon"
                                      title="Copy answer"
                                      onClick={() => {
                                        void navigator.clipboard.writeText(
                                          run.output,
                                        );
                                        setNotice("Answer copied.");
                                      }}
                                    >
                                      <Clipboard size={16} />
                                    </button>
                                  </div>
                                </div>
                                <div className="pace-answer-content">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {run.output ||
                                      run.error ||
                                      "Run in progress…"}
                                  </ReactMarkdown>
                                </div>
                                {run.sources.length > 0 && (
                                  <div className="pace-citations">
                                    {run.sources.map((source, i) => (
                                      <button
                                        key={source.id}
                                        onClick={() => void openSource(source)}
                                      >
                                        {i + 1}. {source.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {run.status !== "pending" && (
                                  <div
                                    className="pace-row spread"
                                    style={{ marginTop: 16 }}
                                  >
                                    <span className="pace-muted">
                                      {fmt(run.latency, " ms")} ·{" "}
                                      {fmt(run.totalTokens)} tokens
                                    </span>
                                    <button
                                      className="link"
                                      onClick={() =>
                                        setDialog({
                                          type: "feedback",
                                          record: row,
                                        })
                                      }
                                    >
                                      Give feedback
                                    </button>
                                  </div>
                                )}
                              </article>
                            </div>
                          );
                        })}
                        {chatBusy && (
                          <>
                            <div className="pace-user-message">
                              {liveQuestion}
                            </div>
                            <div className="pace-answer" aria-live="polite">
                              <Sparkles size={20} color="#8b7ce1" />
                              <p>{chatStatus}</p>
                              <div className="pace-answer-content">
                                <ReactMarkdown>{streamText}</ReactMarkdown>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <form
                      className="pace-composer"
                      onSubmit={(e) => void sendQuestion(e)}
                    >
                      <textarea
                        aria-label="Type a new question"
                        placeholder="Type a new question…"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        maxLength={12000}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendQuestion();
                          }
                        }}
                      />
                      <button
                        className="pace-btn primary"
                        type="submit"
                        disabled={chatBusy || !question.trim()}
                        aria-label="Send question"
                      >
                        <Send size={20} />
                      </button>
                    </form>
                    <div className="pace-muted" style={{ textAlign: "center" }}>
                      Answers use the selected model. Review citations before
                      acting on advice.
                    </div>
                  </div>
                </>
              )}
              {view === "knowledge" && (
                <>
                  <div className="pace-toolbar">
                    <span className="pace-muted">
                      PDF, DOCX, TXT, Markdown, CSV, JSON · up to 10 MB
                    </span>
                    {uploadButton}
                  </div>
                  <Panel title="Project knowledge">
                    {!recordsOf("document").length ? (
                      <Empty
                        title="Add your first knowledge source"
                        detail="Uploaded text is indexed in PostgreSQL. Semantic and hybrid search generate embeddings when first used."
                      />
                    ) : (
                      <div className="pace-scroll">
                        <table className="pace-table">
                          <thead>
                            <tr>
                              <th>Document</th>
                              <th>Passages</th>
                              <th>Size</th>
                              <th>Added</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recordsOf("document").map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <button
                                    className="link"
                                    onClick={() =>
                                      void openSource({
                                        id: r.id,
                                        documentId: r.id,
                                        name: String(r.data.name),
                                        content: String(r.data.content || ""),
                                        score: 0,
                                      })
                                    }
                                  >
                                    {String(r.data.name)}
                                  </button>
                                </td>
                                <td>{Number(r.data.chunks)}</td>
                                <td>
                                  {fmt(Number(r.data.size) / 1024, " KB")}
                                </td>
                                <td>
                                  {new Date(r.created_at).toLocaleString()}
                                </td>
                                <td>
                                  <button
                                    className="pace-icon"
                                    title="Delete document"
                                    onClick={() => remove(r)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                  <div className="pace-note pace-section">
                    Retrieval settings apply to the selected project. Documents
                    are kept until you delete them. Embeddings are cached after
                    their first semantic search.
                  </div>
                </>
              )}
              {view === "tracing" && (
                <>
                  <div className="pace-toolbar">
                    <span className="pace-badge">Project / {project.name}</span>
                    <div className="pace-row">
                      <span className="pace-muted">
                        Retention: {project.settings.retention} days
                      </span>
                      <button className="pace-btn" onClick={openSettings}>
                        <Settings2 size={16} />
                        Setup
                      </button>
                    </div>
                  </div>
                  <Tabs
                    values={["Runs", "Threads", "Monitor", "Setup"]}
                    value={traceTab}
                    onChange={setTraceTab}
                  />
                  {traceTab === "Setup" ? (
                    <Panel title="Tracing setup">
                      <p>
                        All CognitiveConnect questions and safety tests
                        automatically record timings and outcomes in this
                        project. There are no imported demo runs.
                      </p>
                      <div className="pace-grid">
                        <div>
                          <h3>Project ID</h3>
                          <div className="pace-source">{project.id}</div>
                        </div>
                        <div>
                          <h3>Quality rules</h3>
                          {metrics.map((m) => (
                            <p key={m}>
                              {m}: alert below {project.settings.thresholds[m]}{" "}
                              / 5
                            </p>
                          ))}
                        </div>
                      </div>
                      <button
                        className="pace-btn primary"
                        onClick={openSettings}
                      >
                        Configure generation, evaluation & retention
                      </button>
                    </Panel>
                  ) : traceTab === "Threads" ? (
                    <Panel title="Conversations">
                      {recordsOf("thread").length ? (
                        <div className="pace-scroll">
                          <table className="pace-table">
                            <thead>
                              <tr>
                                <th>Thread</th>
                                <th>Runs</th>
                                <th>Created</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {recordsOf("thread").map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    <button
                                      className="link"
                                      onClick={() => {
                                        setThreadId(r.id);
                                        chooseView("chat");
                                      }}
                                    >
                                      {String(r.data.name)}
                                    </button>
                                  </td>
                                  <td>
                                    {
                                      recordsOf("run").filter(
                                        (run) => run.data.threadId === r.id,
                                      ).length
                                    }
                                  </td>
                                  <td>
                                    {new Date(r.created_at).toLocaleString()}
                                  </td>
                                  <td>
                                    <button
                                      className="pace-icon"
                                      title="Delete conversation"
                                      onClick={() => remove(r)}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty
                          title="No conversations yet"
                          detail="Start a question in CognitiveConnect to create your first thread."
                        />
                      )}
                    </Panel>
                  ) : (
                    <>
                      <div className="pace-toolbar">
                        <div className="pace-row">
                          <select
                            aria-label="Time range"
                            value={hours}
                            onChange={(e) => setHours(Number(e.target.value))}
                          >
                            {[
                              [1, "1 hour"],
                              [9, "9 hours"],
                              [24, "1 day"],
                              [72, "3 days"],
                              [168, "7 days"],
                              [336, "14 days"],
                              [720, "30 days"],
                            ].map(([v, n]) => (
                              <option key={v} value={v}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label="Trace tag"
                            value={tag}
                            onChange={(e) => setTag(e.target.value)}
                          >
                            <option value="">All trace tags</option>
                            {[...new Set(dataRuns.flatMap((r) => r.tags))].map(
                              (t) => (
                                <option key={t}>{t}</option>
                              ),
                            )}
                          </select>
                        </div>
                        <span className="pace-muted">
                          Actual records · up to 5,000 recent events
                        </span>
                      </div>
                      {traceTab === "Runs" ? (
                        <>
                          <div
                            className="pace-grid four"
                            style={{ marginBottom: 20 }}
                          >
                            {[
                              ["Run count", fmt(stats.count)],
                              ["Total tokens", fmt(stats.tokens)],
                              ["Median tokens", fmt(stats.medianTokens)],
                              ["Error rate", fmt(stats.errorRate, "%")],
                            ].map(([l, v]) => (
                              <Panel key={l}>
                                <div className="pace-muted">{l}</div>
                                <div className="pace-stat">{v}</div>
                              </Panel>
                            ))}
                          </div>
                          <div className="pace-toolbar">
                            <div className="pace-row">
                              <input
                                placeholder="Search input, output or metadata"
                                aria-label="Search runs"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                              />
                              <select
                                aria-label="Run status"
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                              >
                                {[
                                  "All statuses",
                                  "success",
                                  "error",
                                  "pending",
                                  "blocked",
                                ].map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                              <select
                                aria-label="Run type"
                                value={runType}
                                onChange={(e) => setRunType(e.target.value)}
                              >
                                {["Root runs", "LLM calls", "All runs"].map(
                                  (s) => (
                                    <option key={s}>{s}</option>
                                  ),
                                )}
                              </select>
                            </div>
                            <div className="pace-row">
                              <button
                                className="pace-btn"
                                onClick={() => setColumns(!columns)}
                              >
                                Columns
                              </button>
                              <button
                                className="pace-btn"
                                onClick={() =>
                                  download("epace-runs.json", filteredRuns)
                                }
                              >
                                <Download size={15} />
                                Export
                              </button>
                            </div>
                          </div>
                          {columns && (
                            <div
                              className="pace-row pace-note"
                              style={{ marginBottom: 20 }}
                            >
                              {[
                                "Input",
                                "Output",
                                "Error",
                                "Start time",
                                "Latency",
                                "Tokens",
                              ].map((col) => (
                                <label className="pace-row" key={col}>
                                  <input
                                    type="checkbox"
                                    checked={!hiddenColumns.includes(col)}
                                    onChange={(e) =>
                                      setHiddenColumns((cols) =>
                                        e.target.checked
                                          ? cols.filter((c) => c !== col)
                                          : [...cols, col],
                                      )
                                    }
                                  />
                                  {col}
                                </label>
                              ))}
                            </div>
                          )}
                          <Panel>
                            {filteredRuns.length ? (
                              <div className="pace-scroll">
                                <table className="pace-table">
                                  <thead>
                                    <tr>
                                      <th>Status</th>
                                      <th>Name</th>
                                      {[
                                        "Input",
                                        "Output",
                                        "Error",
                                        "Start time",
                                        "Latency",
                                        "Tokens",
                                      ]
                                        .filter(
                                          (c) => !hiddenColumns.includes(c),
                                        )
                                        .map((c) => (
                                          <th key={c}>{c}</th>
                                        ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredRuns.flatMap((row) => {
                                      const run = row.run;
                                      const entries =
                                        runType === "Root runs"
                                          ? [
                                              {
                                                name: run.name,
                                                latency: run.latency,
                                                tokens: run.totalTokens,
                                              },
                                            ]
                                          : run.spans
                                              .filter(
                                                (s) =>
                                                  runType === "All runs" ||
                                                  s.kind === "llm",
                                              )
                                              .map((s) => ({
                                                name: s.name,
                                                latency: s.duration,
                                                tokens:
                                                  (s.inputTokens || 0) +
                                                  (s.outputTokens || 0),
                                              }));
                                      return entries.map((item, index) => (
                                        <tr
                                          className="clickable"
                                          key={`${row.id}-${index}`}
                                          onClick={() =>
                                            setDialog({
                                              type: "run",
                                              record: row,
                                            })
                                          }
                                        >
                                          <td>
                                            <span
                                              className={`pace-badge ${run.status}`}
                                            >
                                              {run.status}
                                            </span>
                                          </td>
                                          <td>{item.name}</td>
                                          {!hiddenColumns.includes("Input") && (
                                            <td title={run.input}>
                                              {run.input.slice(0, 100)}
                                            </td>
                                          )}
                                          {!hiddenColumns.includes(
                                            "Output",
                                          ) && (
                                            <td title={run.output}>
                                              {run.output.slice(0, 100) || "—"}
                                            </td>
                                          )}
                                          {!hiddenColumns.includes("Error") && (
                                            <td>{run.error || "—"}</td>
                                          )}
                                          {!hiddenColumns.includes(
                                            "Start time",
                                          ) && (
                                            <td>
                                              {new Date(
                                                run.start,
                                              ).toLocaleString()}
                                            </td>
                                          )}
                                          {!hiddenColumns.includes(
                                            "Latency",
                                          ) && (
                                            <td>{fmt(item.latency, " ms")}</td>
                                          )}
                                          {!hiddenColumns.includes(
                                            "Tokens",
                                          ) && <td>{fmt(item.tokens)}</td>}
                                        </tr>
                                      ));
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <Empty
                                title="No runs match this view"
                                detail="Run a real question or adjust your filters."
                              />
                            )}
                          </Panel>
                        </>
                      ) : (
                        <Monitor runs={dataRuns} hours={hours} />
                      )}
                    </>
                  )}
                </>
              )}
              {view === "safety" && (
                <>
                  <Tabs
                    values={[
                      "Content filters",
                      "Try it out",
                      "Monitor activity",
                    ]}
                    value={safetyTab}
                    onChange={setSafetyTab}
                  />
                  {safetyTab === "Content filters" ? (
                    <>
                      <div className="pace-toolbar">
                        <span className="pace-muted">
                          Active policy:{" "}
                          {String(
                            recordsOf("filter").find(
                              (f) => f.id === project.settings.filterId,
                            )?.data.name || "Provider default",
                          )}
                        </span>
                        <button
                          className="pace-btn primary"
                          onClick={() =>
                            setDialog({ type: "record", kind: "filter" })
                          }
                        >
                          <Plus size={16} />
                          Create content filter
                        </button>
                      </div>
                      <Panel title="Content filters">
                        {recordsOf("filter").length ? (
                          <div className="pace-scroll">
                            <table className="pace-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Deployment</th>
                                  <th>Modified</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recordsOf("filter").map((r) => (
                                  <tr key={r.id}>
                                    <td>
                                      <button
                                        className="link"
                                        onClick={() =>
                                          setDialog({
                                            type: "record",
                                            kind: "filter",
                                            record: r,
                                          })
                                        }
                                      >
                                        {String(r.data.name)}
                                      </button>
                                      {r.id === project.settings.filterId && (
                                        <span
                                          className="pace-badge success"
                                          style={{ marginLeft: 8 }}
                                        >
                                          Active
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      {String(
                                        r.data.deployment || "Project chat",
                                      )}
                                    </td>
                                    <td>
                                      {new Date(r.updated_at).toLocaleString()}
                                    </td>
                                    <td>
                                      <div className="pace-row">
                                        <button
                                          className="link"
                                          onClick={() =>
                                            act({
                                              action: "settings",
                                              settings: {
                                                ...project.settings,
                                                filterId: r.id,
                                                contentSafety: true,
                                              },
                                            })
                                          }
                                        >
                                          Apply
                                        </button>
                                        <button
                                          className="pace-icon"
                                          title="Delete filter"
                                          onClick={() => remove(r)}
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Empty
                            title="Default moderation is active"
                            detail="Create a filter to set separate input/output rules and a blocklist."
                          />
                        )}
                      </Panel>
                      <div className="pace-note pace-section">
                        Policies use real OpenAI moderation category
                        probabilities. Low ≥ 0.2, medium ≥ 0.5, high ≥ 0.8 are
                        ePACE probability bands, not Azure severity scores.
                        Safety checks block delivery until output moderation
                        finishes. Image moderation, Azure-specific jailbreak
                        detection, and protected material controls require
                        separate provider integration.
                      </div>
                    </>
                  ) : safetyTab === "Try it out" ? (
                    <Panel title="Analyze text against the active policy">
                      <div className="pace-field">
                        <label htmlFor="testText">Text to analyze</label>
                        <textarea
                          id="testText"
                          value={testText}
                          maxLength={12000}
                          onChange={(e) => setTestText(e.target.value)}
                          placeholder="Enter content to check…"
                        />
                      </div>
                      <button
                        className="pace-btn primary"
                        disabled={busy || !testText.trim()}
                        onClick={() => {
                          setBusy(true);
                          setError("");
                          fetch("/api/epace/moderate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              projectId: project.id,
                              text: testText,
                            }),
                          })
                            .then(async (r) => {
                              const d = await r.json();
                              if (!r.ok) throw new Error(d.error);
                              setTestResult(d);
                              await reload(project.id);
                            })
                            .catch((e) => setError(e.message))
                            .finally(() => setBusy(false));
                        }}
                      >
                        Analyze text
                      </button>
                      {testResult && (
                        <div className="pace-section">
                          <span
                            className={`pace-badge ${testResult.blocked ? "blocked" : "success"}`}
                          >
                            {testResult.blocked ? "Blocked" : "Passed"} ·{" "}
                            {testResult.latency} ms
                          </span>
                          <div className="pace-rule">
                            {Object.entries(testResult.categories).map(
                              ([cat, v]) => (
                                <div key={cat}>
                                  <h3>{cat}</h3>
                                  <p>
                                    {v.severity} · probability{" "}
                                    {v.score.toFixed(3)}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                          {testResult.blocklist.length > 0 && (
                            <p>
                              Blocklist matches:{" "}
                              {testResult.blocklist.join(", ")}
                            </p>
                          )}
                        </div>
                      )}
                    </Panel>
                  ) : (
                    <SafetyMonitor
                      runs={dataRuns}
                      hours={hours}
                      onHours={setHours}
                    />
                  )}
                </>
              )}
              {view === "alerts" && (
                <>
                  <div className="pace-toolbar">
                    <span className="pace-muted">
                      Threshold breaches and blocked content appear here
                      automatically.
                    </span>
                    <button className="pace-btn" onClick={openSettings}>
                      Evaluation rules
                    </button>
                  </div>
                  <Panel title="Performance & safety alerts">
                    {recordsOf("alert").length ? (
                      <div className="pace-scroll">
                        <table className="pace-table">
                          <thead>
                            <tr>
                              <th>Alert</th>
                              <th>Status</th>
                              <th>Created</th>
                              <th>Delivery</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {recordsOf("alert").map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <button
                                    className="link"
                                    onClick={() =>
                                      setDialog({ type: "alert", record: r })
                                    }
                                  >
                                    {String(r.data.name)}
                                  </button>
                                </td>
                                <td>
                                  <span
                                    className={`pace-badge ${r.data.resolved ? "success" : "error"}`}
                                  >
                                    {r.data.resolved ? "Acknowledged" : "Open"}
                                  </span>
                                </td>
                                <td>
                                  {new Date(r.created_at).toLocaleString()}
                                </td>
                                <td>In-app</td>
                                <td>
                                  {!r.data.resolved && (
                                    <button
                                      className="link"
                                      onClick={() =>
                                        act({
                                          action: "resolveAlert",
                                          id: r.id,
                                        })
                                      }
                                    >
                                      Acknowledge
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        title="No quality alerts"
                        detail="Alerts are created from actual evaluation scores below your thresholds or safety policy blocks."
                      />
                    )}
                  </Panel>
                  <div className="pace-note pace-section">
                    Evaluation is model-assisted and sampled at{" "}
                    {Math.round(project.settings.sampling * 100)}%. Unscored
                    runs are not assigned synthetic quality scores. External
                    email delivery is not connected.
                  </div>
                </>
              )}
              {view === "catalog" && (
                <>
                  <Tabs
                    values={["Components", "APIs", "Docs"]}
                    value={catalogTab}
                    onChange={setCatalogTab}
                  />
                  <div className="pace-toolbar">
                    <input
                      aria-label="Search catalog"
                      placeholder="Search catalog…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                      className="pace-btn primary"
                      onClick={() =>
                        setDialog({ type: "record", kind: "component" })
                      }
                    >
                      <Plus size={16} />
                      Register component
                    </button>
                  </div>
                  <div className="pace-grid three">
                    {recordsOf("component")
                      .filter((r) =>
                        JSON.stringify(r.data)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .filter(
                        (r) =>
                          catalogTab === "Components" ||
                          (catalogTab === "APIs" ? r.data.api : r.data.docs),
                      )
                      .map((r) => (
                        <Panel key={r.id}>
                          <div className="pace-card-top">
                            <div className="pace-row spread">
                              <Box size={24} />
                              <span className="pace-badge">
                                {String(r.data.lifecycle || "Design & build")}
                              </span>
                            </div>
                            <h2 style={{ marginTop: 18 }}>
                              {String(r.data.name)}
                            </h2>
                          </div>
                          <p>{String(r.data.description)}</p>
                          <div className="pace-row spread">
                            <span className="pace-muted">
                              {String(r.data.owner || "No owner")} ·{" "}
                              {String(r.data.category || "Service")}
                            </span>
                            <button
                              className="link"
                              onClick={() =>
                                setDialog({
                                  type: "record",
                                  kind: "component",
                                  record: r,
                                })
                              }
                            >
                              Configure
                            </button>
                          </div>
                          <div className="pace-row pace-section">
                            {["repo", "api", "docs"]
                              .filter((k) => r.data[k])
                              .map((k) => (
                                <a
                                  key={k}
                                  className="pace-btn"
                                  href={String(r.data[k])}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {k === "repo"
                                    ? "Repository"
                                    : k === "api"
                                      ? "API"
                                      : "Documentation"}
                                  <ArrowRight size={14} />
                                </a>
                              ))}
                            <a
                              className="pace-btn"
                              href={`/api/epace/scaffold?project=${project.id}&id=${r.id}`}
                              download
                            >
                              <Download size={15} />
                              Download starter
                            </a>
                            <button
                              className="pace-icon"
                              title="Delete component"
                              onClick={() => remove(r)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </Panel>
                      ))}
                  </div>
                  {!recordsOf("component").length && (
                    <Panel>
                      <Empty
                        title="Your catalog is ready"
                        detail="Register real components and attach their repository, API and documentation links."
                      />
                    </Panel>
                  )}
                </>
              )}
              {view === "create" && (
                <>
                  <div className="pace-toolbar">
                    <input
                      aria-label="Search templates"
                      placeholder="Search templates…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="pace-row">
                      <button
                        className="pace-btn"
                        onClick={() =>
                          setDialog({ type: "record", kind: "template" })
                        }
                      >
                        Add template
                      </button>
                      <button
                        className="pace-btn"
                        onClick={() =>
                          setDialog({ type: "record", kind: "component" })
                        }
                      >
                        Register existing component
                      </button>
                    </div>
                  </div>
                  <div className="pace-toolbar">
                    <label className="pace-row">
                      <input
                        type="checkbox"
                        checked={starredOnly}
                        onChange={(e) => setStarredOnly(e.target.checked)}
                      />
                      Starred templates
                    </label>
                    <select
                      aria-label="Filter templates by owner"
                      value={templateOwner}
                      onChange={(e) => setTemplateOwner(e.target.value)}
                    >
                      <option value="">All owners</option>
                      {Array.from(
                        new Set([
                          "ePACE",
                          ...recordsOf("template").map((r) =>
                            String(r.data.owner || ""),
                          ),
                        ]),
                      )
                        .filter(Boolean)
                        .map((owner) => (
                          <option key={owner}>{owner}</option>
                        ))}
                    </select>
                    <select
                      aria-label="Filter templates by category"
                      value={templateCategory}
                      onChange={(e) => setTemplateCategory(e.target.value)}
                    >
                      <option value="">All categories</option>
                      {Array.from(
                        new Set([
                          "Service",
                          ...recordsOf("template").map((r) =>
                            String(r.data.category || "Service"),
                          ),
                        ]),
                      ).map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="pace-grid three">
                    {!starredOnly &&
                      (!templateOwner || templateOwner === "ePACE") &&
                      (!templateCategory || templateCategory === "Service") &&
                      "genai rag setup".includes(search.toLowerCase()) && (
                        <Panel>
                          <div className="pace-card-top">
                            <span className="pace-mini">Service template</span>
                            <h2 style={{ marginTop: 14 }}>GenAI RAG Setup</h2>
                          </div>
                          <p>
                            Configure a knowledge-grounded service with project
                            chat, retrieval, safety rules, and tracing.
                          </p>
                          <div className="pace-row spread">
                            <span className="pace-muted">
                              ePACE / Built-in template
                            </span>
                            <button
                              className="pace-btn primary"
                              onClick={() =>
                                setDialog({ type: "record", kind: "component" })
                              }
                            >
                              Choose
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        </Panel>
                      )}
                    {recordsOf("template")
                      .filter(
                        (r) =>
                          (!starredOnly || r.data.starred) &&
                          (!templateOwner || r.data.owner === templateOwner) &&
                          (!templateCategory ||
                            (r.data.category || "Service") ===
                              templateCategory),
                      )
                      .filter((r) =>
                        JSON.stringify(r.data)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((r) => (
                        <Panel key={r.id}>
                          <div className="pace-row spread">
                            <h2>{String(r.data.name)}</h2>
                            <button
                              className="pace-icon"
                              title="Star template"
                              onClick={() =>
                                act({
                                  action: "save",
                                  kind: "template",
                                  id: r.id,
                                  data: { ...r.data, starred: !r.data.starred },
                                })
                              }
                            >
                              <Star
                                size={18}
                                fill={r.data.starred ? "#f1c852" : "none"}
                              />
                            </button>
                          </div>
                          <p>{String(r.data.description)}</p>
                          <div className="pace-row">
                            <button
                              className="pace-btn primary"
                              onClick={() =>
                                setDialog({
                                  type: "record",
                                  kind: "component",
                                  record: {
                                    ...r,
                                    id: "",
                                    data: { ...r.data, name: "" },
                                  },
                                })
                              }
                            >
                              Choose
                            </button>
                            <button
                              className="pace-btn"
                              onClick={() =>
                                setDialog({
                                  type: "record",
                                  kind: "template",
                                  record: r,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="pace-icon"
                              title="Delete template"
                              onClick={() => remove(r)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </Panel>
                      ))}
                  </div>
                  <div className="pace-note pace-section">
                    Onboarding saves a real catalog component and creates a
                    downloadable backend and frontend starter. Cloud
                    infrastructure and repository provisioning require your
                    cloud or Git provider connection.
                  </div>
                </>
              )}
              {view === "prompts" && (
                <>
                  <div className="pace-toolbar">
                    <span className="pace-muted">
                      Apply a saved prompt to change generation instructions for
                      this project.
                    </span>
                    <button
                      className="pace-btn primary"
                      onClick={() =>
                        setDialog({ type: "record", kind: "prompt" })
                      }
                    >
                      <Plus size={16} />
                      Save prompt
                    </button>
                  </div>
                  <div className="pace-grid">
                    {recordsOf("prompt").map((r) => (
                      <Panel key={r.id} title={String(r.data.name)}>
                        <p>{String(r.data.description)}</p>
                        <div className="pace-source">
                          {String(r.data.prompt)}
                        </div>
                        <div className="pace-row pace-section">
                          <button
                            className="pace-btn primary"
                            onClick={() =>
                              act({
                                action: "settings",
                                settings: {
                                  ...project.settings,
                                  prompt: String(r.data.prompt),
                                  model: r.data.model || project.settings.model,
                                },
                              })
                            }
                          >
                            Apply to project
                          </button>
                          <button
                            className="pace-btn"
                            onClick={() =>
                              setDialog({
                                type: "record",
                                kind: "prompt",
                                record: r,
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="pace-icon"
                            title="Delete prompt"
                            onClick={() => remove(r)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </Panel>
                    ))}
                  </div>
                  <Panel title="Code assistant">
                    <p>
                      Generate code from your saved component requirements and
                      uploaded knowledge. The resulting conversation is traced
                      and evaluated using the same project policy.
                    </p>
                    <div className="pace-field">
                      <label htmlFor="codeTask">
                        Describe the code or change you need
                      </label>
                      <textarea
                        id="codeTask"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Describe the requirements, language, and constraints…"
                      />
                    </div>
                    <button
                      className="pace-btn primary"
                      disabled={!question.trim() || chatBusy}
                      onClick={() => {
                        chooseView("chat");
                        void sendQuestion(
                          undefined,
                          `Help implement this engineering task. Explain assumptions and show code. Project components: ${JSON.stringify(recordsOf("component").map((r) => r.data)).slice(0, 6000)}\nTask: ${question}`,
                        );
                      }}
                    >
                      <Code2 size={16} />
                      Generate with project context
                    </button>
                  </Panel>
                </>
              )}
              {view === "lifecycle" && (
                <>
                  <div className="pace-grid three">
                    {[
                      "Design & build",
                      "Onboard & stabilize",
                      "Operate & improve",
                    ].map((stage, i) => (
                      <Panel key={stage}>
                        <div className="pace-card-top">
                          <div className="pace-mini">DAY {i}</div>
                          <h2 style={{ marginTop: 14 }}>{stage}</h2>
                        </div>
                        <p>
                          {i === 0
                            ? "Define architecture, platform configuration and service requirements."
                            : i === 1
                              ? "Onboard models, use cases, knowledge, prompts and workflows."
                              : "Monitor quality, govern inputs and outputs, and review feedback."}
                        </p>
                        <div className="pace-stat">
                          {
                            recordsOf("component").filter(
                              (r) => r.data.lifecycle === stage,
                            ).length
                          }
                        </div>
                        <span className="pace-muted">
                          registered components
                        </span>
                        <div className="pace-section">
                          <button
                            className="link"
                            onClick={() =>
                              chooseView(
                                i === 0
                                  ? "create"
                                  : i === 1
                                    ? "knowledge"
                                    : "tracing",
                              )
                            }
                          >
                            Open workspace
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </Panel>
                    ))}
                  </div>
                  <div className="pace-toolbar pace-section">
                    <h2>Platform build & operations assessment</h2>
                    <button
                      className="pace-btn primary"
                      onClick={() =>
                        setDialog({ type: "record", kind: "assessment" })
                      }
                    >
                      <Plus size={16} />
                      New assessment
                    </button>
                  </div>
                  {recordsOf("assessment").map((r) => {
                    const evidence = r.data.evidence as Record<
                      string,
                      { score: number; note: string }
                    >;
                    const scored = Object.values(evidence).filter(
                      (v) => v.score > 0,
                    );
                    const average = scored.length
                      ? scored.reduce((a, v) => a + v.score, 0) / scored.length
                      : null;
                    return (
                      <Panel
                        key={r.id}
                        title={String(r.data.name)}
                        action={
                          <button
                            className="link"
                            onClick={() =>
                              setDialog({
                                type: "record",
                                kind: "assessment",
                                record: r,
                              })
                            }
                          >
                            Update assessment
                          </button>
                        }
                      >
                        <div className="pace-row spread">
                          <span className="pace-badge">
                            {String(r.data.stage)}
                          </span>
                          <span className="pace-muted">
                            Evidence-backed self assessment · {fmt(average)} / 5
                          </span>
                        </div>
                        <div className="pace-grid three pace-section">
                          {Object.entries(evidence).map(([key, v]) => (
                            <div key={key}>
                              <h3>{key}</h3>
                              <div className="pace-row">
                                <progress
                                  max={5}
                                  value={v.score}
                                  style={{ accentColor: "#7968e4" }}
                                />
                                <span>
                                  {v.score ? `${v.score}/5` : "Not assessed"}
                                </span>
                              </div>
                              <p>{v.note || "No evidence supplied"}</p>
                            </div>
                          ))}
                        </div>
                        <button
                          className="pace-btn"
                          onClick={() => download("epace-assessment.json", r)}
                        >
                          <Download size={15} />
                          Export assessment
                        </button>
                      </Panel>
                    );
                  })}
                  {!recordsOf("assessment").length && (
                    <Panel>
                      <Empty
                        title="Assess your actual platform"
                        detail="Rate six capability areas and supply evidence. No readiness score is calculated without your inputs."
                      />
                    </Panel>
                  )}
                  <div className="pace-grid pace-section">
                    <Panel title="Operate & improve">
                      <p>
                        Review runtime model selection, prompt changes,
                        knowledge updates, and feedback in the linked
                        workspaces.
                      </p>
                      <div className="pace-row">
                        <button className="pace-btn" onClick={openSettings}>
                          Runtime model
                        </button>
                        <button
                          className="pace-btn"
                          onClick={() => chooseView("prompts")}
                        >
                          Prompt management
                        </button>
                        <button
                          className="pace-btn"
                          onClick={() => chooseView("knowledge")}
                        >
                          Knowledge updates
                        </button>
                      </div>
                    </Panel>
                    <Panel title="Incidents & automation">
                      <p>
                        Operational incidents and automation actions use eAssist
                        connections. Provider credentials must be configured
                        before live actions can run.
                      </p>
                      <Link
                        className="pace-btn primary"
                        href="/service-review-center/eassist"
                      >
                        Open eAssist
                        <ArrowRight size={15} />
                      </Link>
                    </Panel>
                  </div>
                </>
              )}
              {view === "radar" && (
                <>
                  <div className="pace-toolbar">
                    <span className="pace-muted">
                      Record adoption decisions with real evidence.
                    </span>
                    <button
                      className="pace-btn primary"
                      onClick={() =>
                        setDialog({ type: "record", kind: "radar" })
                      }
                    >
                      <Plus size={16} />
                      Add technology
                    </button>
                  </div>
                  <div className="pace-grid">
                    {["Adopt", "Trial", "Assess", "Hold"].map((ring) => (
                      <Panel title={ring} key={ring}>
                        {recordsOf("radar")
                          .filter((r) => r.data.ring === ring)
                          .map((r) => (
                            <div
                              key={r.id}
                              style={{
                                padding: "15px 0",
                                borderBottom: "1px solid #edf0f6",
                              }}
                            >
                              <button
                                className="link"
                                onClick={() =>
                                  setDialog({
                                    type: "record",
                                    kind: "radar",
                                    record: r,
                                  })
                                }
                              >
                                {String(r.data.name)}
                              </button>
                              <p>{String(r.data.description)}</p>
                              <span className="pace-muted">
                                {String(r.data.owner)}
                              </span>
                              <button
                                className="pace-icon"
                                title="Delete technology"
                                onClick={() => remove(r)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        {!recordsOf("radar").some(
                          (r) => r.data.ring === ring,
                        ) && <p>No technologies recorded.</p>}
                      </Panel>
                    ))}
                  </div>
                </>
              )}
              {view === "access" && (
                <>
                  <Panel title="Workspace access">
                    <p>
                      This project belongs to your signed-in account. All
                      records and source documents are checked against that
                      account on the server.
                    </p>
                    <div className="pace-row">
                      <span className="pace-badge">Owner: {userName}</span>
                      <span className="pace-badge">Account-scoped access</span>
                    </div>
                    <div className="pace-note pace-section">
                      Organization membership, shared project roles and RBAC
                      invitations are not configured in this application. No
                      shared access is implied by this page.
                    </div>
                  </Panel>
                  <Panel title="Project audit history">
                    <div className="pace-scroll">
                      <table className="pace-table">
                        <thead>
                          <tr>
                            <th>Action</th>
                            <th>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.audit.map((r) => (
                            <tr key={r.id}>
                              <td>{r.action}</td>
                              <td>{new Date(r.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {dialog?.type === "project" && (
        <Modal title="Create a project" onClose={closeDialog}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void mutate({ action: "createProject", name: f.get("name") })
                .then((d) => {
                  setPid(d.id);
                  setThreadId("");
                  closeDialog();
                })
                .catch(() => {});
            }}
          >
            <Field label="Project name" name="name" required />
            <p>
              Knowledge, chat runs, safety policies, components, and assessments
              are saved together.
            </p>
            <button className="pace-btn primary" disabled={busy}>
              Create project
            </button>
          </form>
        </Modal>
      )}
      {dialog?.type === "record" && project && (
        <Modal
          title={`${dialog.record?.id ? "Edit" : "Create"} ${dialog.kind}`}
          onClose={closeDialog}
          wide={dialog.kind === "filter" || dialog.kind === "assessment"}
        >
          {dialog.kind === "filter" ? (
            <FilterEditor
              record={dialog.record}
              busy={busy}
              onSave={(data) =>
                act(
                  {
                    action: "save",
                    kind: "filter",
                    id: dialog.record?.id || undefined,
                    data,
                  },
                  closeDialog,
                )
              }
            />
          ) : (
            <RecordEditor
              kind={dialog.kind!}
              record={dialog.record}
              busy={busy}
              models={models}
              onSave={(data) => {
                void mutate({
                  action: "save",
                  kind: dialog.kind,
                  id: dialog.record?.id || undefined,
                  data,
                })
                  .then((result) => {
                    if (dialog.kind === "component" && !dialog.record?.id) {
                      const link = document.createElement("a");
                      link.href = `/api/epace/scaffold?project=${project.id}&id=${result.id}`;
                      link.download = "starter.zip";
                      link.click();
                      setNotice(
                        "Component registered. A runnable backend and frontend starter has been downloaded.",
                      );
                    }
                    closeDialog();
                  })
                  .catch(() => {});
              }}
            />
          )}
        </Modal>
      )}
      {dialog?.type === "source" && (
        <Modal
          title={dialog.source?.name || "Source document"}
          onClose={closeDialog}
        >
          <p className="pace-muted">Retrieved evidence · source content</p>
          <div className="pace-source">{sourceContent}</div>
          <button
            className="pace-btn pace-section"
            onClick={() =>
              download(`${dialog.source?.name || "source"}.txt`, sourceContent)
            }
          >
            <Download size={15} />
            Download extracted text
          </button>
        </Modal>
      )}
      {dialog?.type === "run" && runDialog && (
        <Modal title="Run details" onClose={closeDialog} wide>
          <RunDetails
            row={runDialog}
            onSource={(s) => void openSource(s)}
            onFeedback={() =>
              setDialog({ type: "feedback", record: runDialog })
            }
            onCompare={() => setDialog({ type: "compare", record: runDialog })}
          />
        </Modal>
      )}
      {dialog?.type === "feedback" && runDialog && (
        <Modal title="Human feedback" onClose={closeDialog}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act(
                {
                  action: "feedback",
                  id: runDialog.id,
                  scores: Object.fromEntries(
                    metrics.map((m) => [m, Number(f.get(m))]),
                  ),
                },
                closeDialog,
              );
            }}
          >
            <p>
              Rate this answer from 1 (poor) to 5 (excellent). These scores are
              stored separately from model evaluation.
            </p>
            {metrics.map((m) => (
              <Field key={m} name={m} label={m}>
                <select
                  id={m}
                  name={m}
                  defaultValue={Number(
                    (runDialog.data.feedback as Record<string, number>)?.[m] ||
                      3,
                  )}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Field>
            ))}
            <button className="pace-btn primary" disabled={busy}>
              Save feedback
            </button>
          </form>
        </Modal>
      )}
      {dialog?.type === "compare" && runDialog && (
        <Modal title="Compare runs" onClose={closeDialog} wide>
          <Compare row={runDialog} runs={recordsOf("run")} />
        </Modal>
      )}
      {dialog?.type === "alert" && runDialog && (
        <Modal title={String(runDialog.data.name)} onClose={closeDialog} wide>
          <div className="pace-row">
            <span className="pace-badge">
              Run ID: {String(runDialog.data.runId)}
            </span>
            <span className="pace-badge">Delivery: in-app</span>
          </div>
          <div className="pace-grid four pace-section">
            {Object.entries(
              runDialog.data.metrics as Record<string, number>,
            ).map(([k, v]) => (
              <Panel key={k}>
                <span className="pace-muted">{k}</span>
                <div className="pace-stat">{v}/5</div>
                <p>
                  Threshold:{" "}
                  {Number(
                    (runDialog.data.thresholds as Record<string, number>)[k],
                  )}
                </p>
              </Panel>
            ))}
          </div>
          <h3 className="pace-section">Input</h3>
          <div className="pace-source">{String(runDialog.data.input)}</div>
          <h3 className="pace-section">Output</h3>
          <div className="pace-source">{String(runDialog.data.output)}</div>
          <h3 className="pace-section">Context</h3>
          {(runDialog.data.context as Source[]).map((s) => (
            <div key={s.id} className="pace-section">
              <button className="link" onClick={() => void openSource(s)}>
                {s.name}
              </button>
              <div className="pace-source">{s.content}</div>
            </div>
          ))}
        </Modal>
      )}
      {settingsOpen && project && (
        <Drawer onClose={closeSettings}>
          <header>
            <h2>Configure answer generation</h2>
            <button
              className="pace-icon"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={20} />
            </button>
          </header>
          <div className="pace-field">
            <label>Runtime model</label>
            <select
              aria-label="Runtime model"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            >
              <option value="">Choose an accessible model</option>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            {modelsError && (
              <span className="pace-error-line">{modelsError}</span>
            )}
            <input
              aria-label="Custom model ID"
              placeholder="Or enter your exact model ID"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </div>
          <div className="pace-field">
            <label>Retrieval mode</label>
            <select
              aria-label="Retrieval mode"
              value={draft.retrieval}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  retrieval: e.target.value as Settings["retrieval"],
                })
              }
            >
              {["Keyword", "Hybrid", "Semantic"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          {(
            ["semanticRanker", "semanticCaptions", "contentSafety"] as const
          ).map((k) => (
            <label className="pace-row" style={{ margin: "18px 0" }} key={k}>
              <input
                type="checkbox"
                checked={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })}
              />
              {k === "semanticRanker"
                ? "Enable semantic ranker"
                : k === "semanticCaptions"
                  ? "Enable semantic captions"
                  : "Enable content safety"}
            </label>
          ))}
          {uploadButton}
          <div className="pace-field pace-section">
            <label>Content filter</label>
            <select
              aria-label="Active content filter"
              value={draft.filterId}
              onChange={(e) => setDraft({ ...draft, filterId: e.target.value })}
            >
              <option value="">Provider default</option>
              {recordsOf("filter").map((r) => (
                <option key={r.id} value={r.id}>
                  {String(r.data.name)}
                </option>
              ))}
            </select>
          </div>
          {metrics.map((m) => (
            <div
              className="pace-row spread"
              key={m}
              style={{ marginBottom: 14 }}
            >
              <label htmlFor={`threshold-${m}`}>{m} threshold</label>
              <input
                id={`threshold-${m}`}
                type="number"
                min={1}
                max={5}
                style={{ width: 80 }}
                value={draft.thresholds[m]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    thresholds: {
                      ...draft.thresholds,
                      [m]: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          ))}
          <div className="pace-field">
            <label htmlFor="sampling">Evaluation sampling rate</label>
            <input
              id="sampling"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={draft.sampling}
              onChange={(e) =>
                setDraft({ ...draft, sampling: Number(e.target.value) })
              }
            />
          </div>
          <div className="pace-field">
            <label htmlFor="evalModel">Evaluator model (optional)</label>
            <input
              id="evalModel"
              value={draft.evaluationModel}
              onChange={(e) =>
                setDraft({ ...draft, evaluationModel: e.target.value })
              }
              placeholder="Defaults to runtime model"
            />
          </div>
          <div className="pace-field">
            <label htmlFor="retention">Run retention in days (1–365)</label>
            <input
              id="retention"
              type="number"
              min={1}
              max={365}
              value={draft.retention}
              onChange={(e) =>
                setDraft({ ...draft, retention: Number(e.target.value) })
              }
            />
            <small className="pace-muted">
              Older runs, conversations and alerts expire. Knowledge and catalog
              records are retained.
            </small>
          </div>
          <div className="pace-field">
            <label htmlFor="tags">Trace tags, separated by commas</label>
            <input
              id="tags"
              value={draft.tags.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="pace-field">
            <label htmlFor="prompt">Generation instructions</label>
            <textarea
              id="prompt"
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            />
          </div>
          <div className="pace-note">
            Semantic retrieval, captions, ranking and evaluation call the model
            provider. Output appears after moderation when safety is enabled.
          </div>
          <div className="pace-row pace-section">
            <button
              className="pace-btn primary"
              disabled={busy}
              onClick={saveSettings}
            >
              Save settings
            </button>
            <button className="pace-btn" onClick={() => setSettingsOpen(false)}>
              Close
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function Drawer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const controls = el.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input,select,textarea,a[href]",
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="pace-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={ref}
        tabIndex={-1}
        className="pace-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Configure answer generation"
      >
        {children}
      </aside>
    </div>
  );
}
function Monitor({ runs, hours }: { runs: RunData[]; hours: number }) {
  const stats = summarize(runs);
  const llm = (rs: RunData[]) =>
    rs.flatMap((r) =>
      r.spans.filter((s) => s.kind === "llm" || s.kind === "evaluation"),
    );
  const chart = (
    title: string,
    measure: (rs: RunData[]) => number | null,
    unit = "",
  ) => (
    <Chart
      key={title}
      title={title}
      points={series(runs, hours, measure)}
      unit={unit}
    />
  );
  return (
    <>
      <div className="pace-grid four" style={{ marginBottom: 25 }}>
        {[
          ["Success rate", fmt(stats.success, "%")],
          ["P50 latency", fmt(stats.p50, " ms")],
          ["P99 latency", fmt(stats.p99, " ms")],
          ["Streaming", fmt(stats.streaming, "%")],
        ].map(([l, v]) => (
          <Panel key={l}>
            <span className="pace-muted">{l}</span>
            <div className="pace-stat">{v}</div>
          </Panel>
        ))}
      </div>
      <h2>Volume</h2>
      <div className="pace-grid">
        {chart("Trace count", (rs) => rs.length)}
        {chart("LLM call count", (rs) => llm(rs).length)}
      </div>
      <h2 className="pace-section">Success & errors</h2>
      <div className="pace-grid">
        {chart("Trace success rate", (rs) => summarize(rs).success, "%")}
        {chart("Trace error rate", (rs) => summarize(rs).errorRate, "%")}
        {chart(
          "LLM call success rate",
          (rs) => {
            const calls = llm(rs);
            return calls.length
              ? (calls.filter((s) => !s.error && s.duration > 0).length /
                  calls.length) *
                  100
              : null;
          },
          "%",
        )}
        {chart(
          "LLM call error rate",
          (rs) => {
            const calls = llm(rs);
            return calls.length
              ? (calls.filter((s) => s.error).length / calls.length) * 100
              : null;
          },
          "%",
        )}
        {chart(
          "Pending traces",
          (rs) => rs.filter((r) => r.status === "pending").length,
        )}
        {chart(
          "Blocked traces",
          (rs) => rs.filter((r) => r.status === "blocked").length,
        )}
      </div>
      <h2 className="pace-section">Latency & throughput</h2>
      <div className="pace-grid">
        {chart(
          "Trace latency · P50",
          (rs) =>
            percentile(
              rs
                .map((r) => r.latency)
                .filter((n): n is number => typeof n === "number"),
              0.5,
            ),
          " ms",
        )}
        {chart(
          "Trace latency · P95",
          (rs) =>
            percentile(
              rs
                .map((r) => r.latency)
                .filter((n): n is number => typeof n === "number"),
              0.95,
            ),
          " ms",
        )}
        {chart(
          "LLM latency · P50",
          (rs) =>
            percentile(
              llm(rs).map((s) => s.duration),
              0.5,
            ),
          " ms",
        )}
        {chart(
          "LLM latency · P95",
          (rs) =>
            percentile(
              llm(rs).map((s) => s.duration),
              0.95,
            ),
          " ms",
        )}
        {chart("LLM calls per trace", (rs) =>
          rs.length ? llm(rs).length / rs.length : null,
        )}
        {chart("Model output tokens per second", (rs) => {
          const spans = llm(rs),
            duration = spans.reduce((a, s) => a + s.duration, 0);
          return duration
            ? spans.reduce((a, s) => a + (s.outputTokens || 0), 0) /
                (duration / 1000)
            : null;
        })}
      </div>
      <h2 className="pace-section">Feedback</h2>
      <div className="pace-grid">
        {metrics.map((metric) =>
          chart(`${metric} · model evaluation`, (rs) => {
            const values = rs
              .filter((r) => r.evaluation)
              .map((r) => r.evaluation!.scores[metric]);
            return values.length
              ? values.reduce((a, n) => a + n, 0) / values.length
              : null;
          }),
        )}
        {metrics.map((metric) =>
          chart(`${metric} · human feedback`, (rs) => {
            const values = rs
              .filter((r) => r.feedback)
              .map((r) => r.feedback![metric]);
            return values.length
              ? values.reduce((a, n) => a + n, 0) / values.length
              : null;
          }),
        )}
      </div>
      <h2 className="pace-section">Tokens</h2>
      <div className="pace-grid">
        {chart("Total generation tokens", (rs) =>
          rs.reduce((a, r) => a + r.totalTokens, 0),
        )}
        {chart("Tokens per trace · P50", (rs) =>
          percentile(
            rs.map((r) => r.totalTokens),
            0.5,
          ),
        )}
        {chart("Tokens per LLM call · P50", (rs) =>
          percentile(
            llm(rs).map((s) => (s.inputTokens || 0) + (s.outputTokens || 0)),
            0.5,
          ),
        )}
        {chart("Tokens per LLM call · P95", (rs) =>
          percentile(
            llm(rs).map((s) => (s.inputTokens || 0) + (s.outputTokens || 0)),
            0.95,
          ),
        )}
      </div>
      <div className="pace-note pace-section">
        Charts use recorded events in 24 time buckets. Missing quality or
        latency measurements stay blank. Generation token charts exclude
        embedding, ranking and evaluator calls; those calls are recorded in
        account usage.
      </div>
    </>
  );
}
function SafetyMonitor({
  runs,
  hours,
  onHours,
}: {
  runs: RunData[];
  hours: number;
  onHours: (v: number) => void;
}) {
  const all = runs.flatMap((r) => r.moderation || []);
  const clearChecks = all.filter((check) =>
    categories.every(
      (category) => check.categories[category]?.severity === "Safe",
    ),
  ).length;
  return (
    <>
      <div className="pace-toolbar">
        <span className="pace-muted">
          {all.length} text safety {all.length === 1 ? "check" : "checks"} in
          this period
        </span>
        <select
          aria-label="Safety time range"
          value={hours}
          onChange={(e) => onHours(Number(e.target.value))}
        >
          {[
            [24, "24 hours"],
            [168, "7 days"],
            [720, "30 days"],
          ].map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <h2>Overview</h2>
      <div className="pace-grid">
        <Chart
          title="Text safety checks over time"
          points={series(runs, hours, (rs) =>
            rs.reduce((a, r) => a + r.moderation.length, 0),
          )}
        />
        <Chart
          title="Safety check response time · 95th percentile"
          unit=" ms"
          points={series(runs, hours, (rs) =>
            percentile(
              rs.flatMap((r) => r.moderation.map((m) => m.latency)),
              0.95,
            ),
          )}
        />
      </div>
      <h2 className="pace-section">Content safety results</h2>
      <Panel title="What did the safety checks find?">
        {!all.length ? (
          <Empty
            title="No safety checks yet"
            detail="Test some text or ask a question with safety checks turned on. Results will appear here."
          />
        ) : (
          <>
            <p className="pace-safety-explainer">
              <strong>
                {all.length} text safety {all.length === 1 ? "check" : "checks"}{" "}
                completed.
              </strong>{" "}
              Each check looks at the same text for all four types of concern,
              so the same check can appear in every row. These numbers count
              checks; they are not scores out of 5.
            </p>
            <p className="pace-muted pace-safety-note">
              Your question and the AI answer are checked separately. One
              conversation can therefore produce several checks.
            </p>
            <div className="pace-scroll">
              <table className="pace-table">
                <thead>
                  <tr>
                    <th>Type of concern</th>
                    {[
                      "No concern detected",
                      "Low concern",
                      "Medium concern",
                      "High concern",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat}>
                      <td>{cat}</td>
                      {["Safe", "Low", "Medium", "High"].map((severity) => {
                        const count = all.filter(
                          (m) => m.categories[cat]?.severity === severity,
                        ).length;
                        return (
                          <td key={severity}>
                            <div className="pace-row">
                              {count > 0 && (
                                <span
                                  aria-hidden="true"
                                  style={{
                                    display: "inline-block",
                                    height: 8,
                                    width: (count / all.length) * 70,
                                    background:
                                      severity === "Safe"
                                        ? "#29aa8a"
                                        : severity === "Low"
                                          ? "#c6b673"
                                          : severity === "Medium"
                                            ? "#ed9972"
                                            : "#e44f76",
                                    borderRadius: 4,
                                  }}
                                />
                              )}
                              <span>
                                {count} {count === 1 ? "check" : "checks"}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pace-muted pace-safety-note">
              {clearChecks} of {all.length} checks found no concern across all
              four categories. These results are separate from answer quality
              ratings such as relevance or fluency.
            </p>
          </>
        )}
      </Panel>
      <div className="pace-grid pace-section">
        {categories.map((cat) => (
          <Chart
            key={cat}
            title={`${cat} · checks with a concern (%)`}
            unit="%"
            points={series(runs, hours, (rs) => {
              const checks = rs.flatMap((r) => r.moderation);
              const classified = checks.filter((m) => m.categories[cat]);
              return classified.length
                ? (classified.filter(
                    (m) => m.categories[cat].severity !== "Safe",
                  ).length /
                    classified.length) *
                    100
                : null;
            })}
          />
        ))}
      </div>
    </>
  );
}
function RunDetails({
  row,
  onSource,
  onFeedback,
  onCompare,
}: {
  row: RecordRow;
  onSource: (s: Source) => void;
  onFeedback: () => void;
  onCompare: () => void;
}) {
  const [tab, setTab] = useState("Run"),
    [span, setSpan] = useState(-1);
  const run = row.data as unknown as RunData;
  return (
    <>
      <div className="pace-toolbar">
        <div className="pace-row">
          <span className={`pace-badge ${run.status}`}>{run.status}</span>
          <span className="pace-muted">
            {run.name} · {run.model}
          </span>
        </div>
        <div className="pace-row">
          <button
            className="pace-btn"
            onClick={() => void navigator.clipboard.writeText(row.id)}
          >
            Copy run ID
          </button>
          <button className="pace-btn" onClick={onCompare}>
            Compare
          </button>
          <button
            className="pace-btn"
            onClick={() => download("epace-trace.json", row)}
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      <Tabs
        values={["Run", "Feedback", "Metadata"]}
        value={tab}
        onChange={setTab}
      />
      <div className="pace-trace-grid">
        <div>
          <div className="pace-mini" style={{ marginBottom: 14 }}>
            TRACE
          </div>
          <button
            className="pace-span"
            style={{ width: "100%", textAlign: "left", border: 0 }}
            onClick={() => setSpan(-1)}
          >
            {run.name}
            <small>{fmt(run.latency, " ms")} · root</small>
          </button>
          {run.spans.map((s, i) => (
            <button
              key={i}
              className="pace-span"
              style={{
                width: "100%",
                textAlign: "left",
                border:
                  span === i ? "1px solid #9885e9" : "1px solid transparent",
              }}
              onClick={() => setSpan(i)}
            >
              {s.name}
              <small>
                {s.kind} · {s.duration} ms
              </small>
            </button>
          ))}
        </div>
        <div>
          {tab === "Run" ? (
            <>
              {span >= 0 && (
                <div className="pace-note" style={{ marginBottom: 20 }}>
                  Span: {run.spans[span].name} · started{" "}
                  {new Date(run.spans[span].start).toLocaleString()} ·{" "}
                  {run.spans[span].duration} ms. This trace records timings and
                  the source evidence; it does not expose private model
                  reasoning.
                </div>
              )}
              <h3>Input</h3>
              <div className="pace-source">{run.input}</div>
              <h3 className="pace-section">Output</h3>
              <div className="pace-answer-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {run.output || run.error || "No output yet."}
                </ReactMarkdown>
              </div>
              {run.error && <p className="pace-error-line">{run.error}</p>}
              <h3 className="pace-section">Retrieved context</h3>
              {run.sources.map((s, i) => (
                <div key={s.id} className="pace-section">
                  <button className="link" onClick={() => onSource(s)}>
                    [{i + 1}] {s.name}
                  </button>
                  <p className="pace-muted">
                    Retrieval score: {s.score.toFixed(3)}
                  </p>
                  <div className="pace-source">{s.caption || s.content}</div>
                </div>
              ))}
              {!run.sources.length && (
                <p>No knowledge passages were retrieved.</p>
              )}
              {run.moderation.length > 0 && (
                <>
                  <h3 className="pace-section">Safety results</h3>
                  <div className="pace-source">
                    {JSON.stringify(run.moderation, null, 2)}
                  </div>
                </>
              )}
            </>
          ) : tab === "Feedback" ? (
            <>
              <h3>Model evaluation</h3>
              {run.evaluation ? (
                <>
                  <div className="pace-rule">
                    {metrics.map((m) => (
                      <div key={m}>
                        {m}
                        <strong style={{ display: "block", marginTop: 8 }}>
                          {run.evaluation!.scores[m]} / 5
                        </strong>
                      </div>
                    ))}
                  </div>
                  <p>{run.evaluation.reason}</p>
                  <p className="pace-muted">
                    Evaluator: {run.evaluation.model}
                  </p>
                </>
              ) : (
                <p>
                  {run.evaluationError ||
                    "This run was not sampled for evaluation. No quality score was assigned."}
                </p>
              )}
              <h3 className="pace-section">Human feedback</h3>
              {run.feedback && (
                <div className="pace-source">
                  {JSON.stringify(run.feedback, null, 2)}
                </div>
              )}
              <button className="pace-btn pace-section" onClick={onFeedback}>
                Add or update human feedback
              </button>
            </>
          ) : (
            <>
              <h3>Metadata</h3>
              <div className="pace-source">
                {JSON.stringify(
                  {
                    runId: row.id,
                    threadId: run.threadId,
                    projectId: row.project_id,
                    tags: run.tags,
                    settings: run.settings,
                  },
                  null,
                  2,
                )}
              </div>
            </>
          )}
        </div>
        <aside>
          {[
            ["Start time", new Date(run.start).toLocaleString()],
            [
              "End time",
              run.end ? new Date(run.end).toLocaleString() : "In progress",
            ],
            ["Time to first token", fmt(run.ttft, " ms")],
            ["Total latency", fmt(run.latency, " ms")],
            ["Input tokens", fmt(run.inputTokens)],
            ["Output tokens", fmt(run.outputTokens)],
            ["Total tokens", fmt(run.totalTokens)],
            [
              "Streaming delivered",
              run.streamed ? "Yes" : "No · moderated output",
            ],
          ].map(([l, v]) => (
            <div style={{ marginBottom: 22 }} key={l}>
              <div className="pace-mini">{l}</div>
              <div style={{ marginTop: 7, fontWeight: 600, fontSize: 13 }}>
                {v}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
function Compare({ row, runs }: { row: RecordRow; runs: RecordRow[] }) {
  const [other, setOther] = useState(
    runs.find((r) => r.id !== row.id)?.id || "",
  );
  return (
    <>
      <select
        aria-label="Compare with run"
        value={other}
        onChange={(e) => setOther(e.target.value)}
      >
        <option value="">Select another run</option>
        {runs
          .filter((r) => r.id !== row.id)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {String(r.data.input).slice(0, 70)} ·{" "}
              {new Date(r.created_at).toLocaleString()}
            </option>
          ))}
      </select>
      <div className="pace-grid pace-section">
        {[row, runs.find((r) => r.id === other)]
          .filter((r): r is RecordRow => !!r)
          .map((r) => {
            const d = r.data as unknown as RunData;
            return (
              <Panel key={r.id} title={new Date(r.created_at).toLocaleString()}>
                <div className="pace-row">
                  <span className={`pace-badge ${d.status}`}>{d.status}</span>
                  <span className="pace-muted">
                    {d.model} · {fmt(d.latency, " ms")} · {d.totalTokens} tokens
                  </span>
                </div>
                <h3 className="pace-section">Input</h3>
                <div className="pace-source">{d.input}</div>
                <h3 className="pace-section">Output</h3>
                <div className="pace-answer-content">
                  <ReactMarkdown>{d.output}</ReactMarkdown>
                </div>
                <h3 className="pace-section">Scores</h3>
                <div className="pace-source">
                  {d.evaluation
                    ? JSON.stringify(d.evaluation.scores, null, 2)
                    : "Not evaluated"}
                </div>
              </Panel>
            );
          })}
      </div>
    </>
  );
}
function FilterEditor({
  record,
  busy,
  onSave,
}: {
  record?: RecordRow;
  busy: boolean;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const steps = [
    "Basic information",
    "Input filter",
    "Output filter",
    "Deployment",
    "Review",
  ];
  const [step, setStep] = useState(0),
    [name, setName] = useState(String(record?.data.name || "")),
    [deployment, setDeployment] = useState(
      String(record?.data.deployment || ""),
    ),
    [blocklist, setBlocklist] = useState(String(record?.data.blocklist || ""));
  type Rules = Record<string, { action: string; threshold: string }>;
  const defaults = () =>
    Object.fromEntries(
      categories.map((c) => [c, { action: "Block", threshold: "Low" }]),
    );
  const [input, setInput] = useState<Rules>(
      (record?.data.input as Rules) || defaults(),
    ),
    [output, setOutput] = useState<Rules>(
      (record?.data.output as Rules) || defaults(),
    );
  const data = { name, deployment, blocklist, input, output };
  return (
    <>
      <div className="pace-steps">
        {steps.map((v, i) => (
          <span key={v} className={step === i ? "active" : ""}>
            {i + 1}. {v}
          </span>
        ))}
      </div>
      {step === 0 ? (
        <>
          <div className="pace-field">
            <label htmlFor="filterName">Filter name</label>
            <input
              id="filterName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <p>
            Define separate input and output policy thresholds. Apply the saved
            filter to activate it.
          </p>
        </>
      ) : step === 1 || step === 2 ? (
        <>
          <h2>Set {step === 1 ? "input" : "output"} filter</h2>
          <p>
            Categories are annotated by the moderation provider. Block content
            at or above your configured probability band.
          </p>
          <div className="pace-rule">
            <strong>Category</strong>
            <strong>Action</strong>
            <strong>Threshold</strong>
          </div>
          {categories.map((cat) => {
            const rules = step === 1 ? input : output,
              set = step === 1 ? setInput : setOutput;
            return (
              <div className="pace-rule" key={cat}>
                <span>
                  {cat} <small className="pace-muted">Text</small>
                </span>
                <select
                  aria-label={`${cat} action`}
                  value={rules[cat].action}
                  onChange={(e) =>
                    set({
                      ...rules,
                      [cat]: { ...rules[cat], action: e.target.value },
                    })
                  }
                >
                  {["Block", "Annotate"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <select
                  aria-label={`${cat} threshold`}
                  value={rules[cat].threshold}
                  onChange={(e) =>
                    set({
                      ...rules,
                      [cat]: { ...rules[cat], threshold: e.target.value },
                    })
                  }
                >
                  {["Low", "Medium", "High"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
            );
          })}
          <div className="pace-note pace-section">
            Low ≥ 0.2 · Medium ≥ 0.5 · High ≥ 0.8. The provider-s flagged
            categories also block at the Low setting.
          </div>
        </>
      ) : step === 3 ? (
        <>
          <div className="pace-field">
            <label htmlFor="deployment">Deployment label (optional)</label>
            <input
              id="deployment"
              value={deployment}
              onChange={(e) => setDeployment(e.target.value)}
              placeholder="Project chat"
              maxLength={200}
            />
          </div>
          <div className="pace-field">
            <label htmlFor="blocklist">Blocklist phrases · one per line</label>
            <textarea
              id="blocklist"
              value={blocklist}
              onChange={(e) => setBlocklist(e.target.value)}
              maxLength={4000}
            />
          </div>
          <p>
            This policy applies to this project-s chat and text tests. It does
            not update external Azure deployments.
          </p>
        </>
      ) : (
        <>
          <h2>Review filter</h2>
          <div className="pace-source">{JSON.stringify(data, null, 2)}</div>
          <p>Save this filter, then use Apply to enable it for your project.</p>
        </>
      )}
      <div className="pace-row spread pace-section">
        <button
          className="pace-btn"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </button>
        {step < 4 ? (
          <button
            className="pace-btn primary"
            disabled={!name.trim()}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
            <ArrowRight size={15} />
          </button>
        ) : (
          <button
            className="pace-btn primary"
            disabled={busy}
            onClick={() => onSave(data)}
          >
            Save filter
            <Check size={15} />
          </button>
        )}
      </div>
    </>
  );
}
const pillars = [
  "Platform",
  "Observability / Monitoring",
  "Use-case onboarding",
  "Automation",
  "Operations",
  "Governance / AI ethics",
];
function RecordEditor({
  kind,
  record,
  busy,
  models,
  onSave,
}: {
  kind: Kind;
  record?: RecordRow;
  busy: boolean;
  models: string[];
  onSave: (data: Record<string, unknown>) => void;
}) {
  const d = record?.data || {};
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      data: Record<string, unknown> = Object.fromEntries(f.entries());
    if (kind === "assessment")
      data.evidence = Object.fromEntries(
        pillars.map((key, i) => [
          key,
          {
            score: Number(f.get(`score${i}`)),
            note: String(f.get(`note${i}`) || ""),
          },
        ]),
      );
    onSave(data);
  };
  return (
    <form onSubmit={submit}>
      <Field
        label={
          kind === "component"
            ? "Component name"
            : kind === "assessment"
              ? "Assessment name"
              : kind === "radar"
                ? "Technology name"
                : "Name"
        }
        name="name"
        value={String(d.name || "")}
        required
      />
      {kind === "assessment" ? (
        <>
          <Field label="Lifecycle stage" name="stage">
            <select
              id="stage"
              name="stage"
              defaultValue={String(d.stage || "Design & build")}
            >
              {[
                "Design & build",
                "Onboard & stabilize",
                "Operate & improve",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          {pillars.map((key, i) => {
            const value = (
              d.evidence as Record<string, { score: number; note: string }>
            )?.[key];
            return (
              <div
                key={key}
                className="pace-panel"
                style={{ marginBottom: 15 }}
              >
                <h3>{key}</h3>
                <Field label="Capability rating" name={`score${i}`}>
                  <select
                    id={`score${i}`}
                    name={`score${i}`}
                    defaultValue={value?.score || 0}
                  >
                    {[
                      [0, "Not assessed"],
                      [1, "Initial"],
                      [2, "Developing"],
                      [3, "Defined"],
                      [4, "Measured"],
                      [5, "Optimizing"],
                    ].map(([v, n]) => (
                      <option key={v} value={v}>
                        {v} · {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Evidence and observed gaps (required for a rating above 0)"
                  name={`note${i}`}
                  type="textarea"
                  value={value?.note || ""}
                />
              </div>
            );
          })}
        </>
      ) : (
        <>
          <Field
            label="Description / decision evidence"
            name="description"
            type="textarea"
            value={String(d.description || "")}
            required={kind === "radar"}
          />
          {kind === "prompt" ? (
            <>
              <Field
                label="Prompt instructions"
                name="prompt"
                type="textarea"
                value={String(d.prompt || "")}
                required
              />
              <Field label="Model (optional)" name="model">
                <select
                  id="model"
                  name="model"
                  defaultValue={String(d.model || "")}
                >
                  <option value="">Keep runtime model</option>
                  {models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <>
              <div className="pace-grid">
                <Field
                  label="Owner"
                  name="owner"
                  value={String(d.owner || "")}
                  required={kind === "component"}
                />
                <Field
                  label="Category"
                  name="category"
                  value={String(d.category || "service")}
                />
              </div>
              {kind === "radar" ? (
                <Field label="Adoption ring" name="ring">
                  <select
                    id="ring"
                    name="ring"
                    defaultValue={String(d.ring || "Assess")}
                  >
                    {["Adopt", "Trial", "Assess", "Hold"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="Lifecycle" name="lifecycle">
                    <select
                      id="lifecycle"
                      name="lifecycle"
                      defaultValue={String(d.lifecycle || "Design & build")}
                    >
                      {[
                        "Design & build",
                        "Onboard & stabilize",
                        "Operate & improve",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Repository URL"
                    name="repo"
                    type="url"
                    value={String(d.repo || "")}
                  />
                  <Field
                    label="API URL"
                    name="api"
                    type="url"
                    value={String(d.api || "")}
                  />
                  <Field
                    label="Documentation URL"
                    name="docs"
                    type="url"
                    value={String(d.docs || "")}
                  />
                  {kind === "template" && (
                    <Field
                      label="Template instructions"
                      name="instructions"
                      type="textarea"
                      value={String(d.instructions || "")}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      <button className="pace-btn primary" disabled={busy}>
        {record?.id
          ? "Save changes"
          : kind === "component"
            ? "Register component & download starter"
            : "Save record"}
      </button>
    </form>
  );
}
