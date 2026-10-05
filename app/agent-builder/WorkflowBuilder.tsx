"use client";

import "@xyflow/react/dist/style.css";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { useParams, useRouter } from "next/navigation";
import { Check, Clipboard, LoaderCircle, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import { WorkflowContext, type AddWorkflowNode } from "@/context/WorkflowContext";
import { normalizeWorkflowGraph } from "@/lib/workflow-graph";
import type { AgentRecord } from "@/lib/agent-store";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode, WorkflowNodeData, WorkflowNodeKind } from "@/types/workflow";
import AgentToolsPanel from "./_components/AgentToolsPanel";
import Header from "./_components/Header";
import SettingPanel from "./_components/SettingPanel";
import AgentNode from "./_costumNodes/AgentNode";
import ApiNode from "./_costumNodes/ApiNode";
import EndNode from "./_costumNodes/EndNode";
import IfElseNode from "./_costumNodes/IfElseNode";
import StartNode from "./_costumNodes/StartNode";
import UserApprovalNode from "./_costumNodes/UserApprovalNode";
import WhileNode from "./_costumNodes/WhileNode";

const nodeTypes: NodeTypes = {
  StartNode,
  AgentNode,
  ApiNode,
  EndNode,
  IfElseNode,
  WhileNode,
  UserApprovalNode,
};

type PublishedSnapshot = {
  agent: { name?: string; purpose?: string; modelId?: string; instructions?: string };
  graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
};

type Publication = { publicId: string; version: number; active: boolean; snapshot?: PublishedSnapshot };

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["apiKey", "apiKeyDraft", "apiKeyConfigured", "clearApiKey"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function publicationState(agent: { name?: string; purpose?: string; modelId?: string; instructions?: string }, graph: WorkflowGraph) {
  const agentNode = graph.nodes.find((node) => node.type === "AgentNode");
  const data: WorkflowNodeData = agentNode?.data ?? { label: "" };
  const legacy = data.settings && typeof data.settings === "object" ? data.settings as Record<string, unknown> : {};
  const modelId = typeof data.modelId === "string" && data.modelId ? data.modelId : typeof legacy.model === "string" && legacy.model ? legacy.model : agent.modelId || "gpt-4.1-mini";
  const instructions = typeof data.instructions === "string" && data.instructions ? data.instructions : typeof legacy.instruction === "string" && legacy.instruction ? legacy.instruction : agent.instructions || "";
  return stableValue({ agent: { name: agent.name, purpose: agent.purpose, modelId, instructions }, graph });
}

function highlightTypeScript(source: string): ReactNode[] {
  const pattern = /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|export|async|function|return|if|throw|new|undefined)\b|\b(?:string|Promise|Error)\b|\b(?:fetch|JSON|console)\b|\b(?:sendMessageToAgent|agentEndpoint|conversationId|response|input|error|reply)\b|\b\d+\b|(?:=>|===|==|=|\?\?|[{}()[\].,;:?])/g;
  const tokens: ReactNode[] = [];
  let cursor = 0;

  for (const [index, match] of Array.from(source.matchAll(pattern)).entries()) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) tokens.push(source.slice(cursor, start));
    let color = "#d4d4d4";
    if (token.startsWith("//")) color = "#6a9955";
    else if (token.startsWith("\"") || token.startsWith("'")) color = "#ce9178";
    else if (/^(const|let|export|async|function|return|if|throw|new|undefined)$/.test(token)) color = "#569cd6";
    else if (/^(string|Promise|Error)$/.test(token)) color = "#4ec9b0";
    else if (/^(fetch|JSON|console|sendMessageToAgent)$/.test(token)) color = "#dcdcaa";
    else if (/^\d+$/.test(token)) color = "#b5cea8";
    else if (/^(agentEndpoint|conversationId|response|input|error|reply)$/.test(token)) color = "#9cdcfe";
    tokens.push(<span key={`${start}-${index}`} style={{ color }}>{token}</span>);
    cursor = start + token.length;
  }
  if (cursor < source.length) tokens.push(source.slice(cursor));
  return tokens;
}

function starterGraph(): WorkflowGraph {
  return {
    nodes: [{ id: "start", type: "StartNode", position: { x: 60, y: 260 }, data: { label: "Start" }, draggable: false, deletable: false }],
    edges: [],
  };
}

function defaultNodeData(kind: WorkflowNodeKind, agentName: string): WorkflowNodeData {
  switch (kind) {
    case "AgentNode": return { label: agentName || "Agent", instructions: "", modelId: "gpt-4.1-mini", includeHistory: true, output: "Text" };
    case "ApiNode": return { label: "API Request", method: "GET", url: "", includeApiKey: true, apiKeyLocation: "query", apiKeyName: "key", bodyParams: "" };
    case "IfElseNode": return { label: "If / Else", ifCondition: "Condition met", elseCondition: "Otherwise" };
    case "WhileNode": return { label: "While", condition: "", maxIterations: 3 };
    case "UserApprovalNode": return { label: "User Approval", approvalPrompt: "" };
    case "EndNode": return { label: "End", message: "" };
    default: return { label: "Start" };
  }
}

function markCredentialsPersisted(nodes: WorkflowNode[]) {
  return nodes.map((node) => {
    const data = { ...node.data };
    const hasDraft = typeof data.apiKeyDraft === "string" && Boolean(data.apiKeyDraft.trim());
    const isCleared = data.clearApiKey === true;
    delete data.apiKeyDraft;
    delete data.clearApiKey;
    if (hasDraft) data.apiKeyConfigured = true;
    if (isCleared) data.apiKeyConfigured = false;
    return { ...node, data };
  });
}

function useWorkflowAutosave() {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify);
      window.addEventListener("aiforce-autosave-change", notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener("aiforce-autosave-change", notify);
      };
    },
    () => window.localStorage.getItem("aiforce:workflow-autosave") !== "off",
    () => true,
  );
}

function BuilderCanvas({ agent, onBack, onOpenToolLibrary }: { agent: AgentRecord; onBack: () => void; onOpenToolLibrary: () => void }) {
  const router = useRouter();
  const { screenToFlowPosition, fitView } = useReactFlow<WorkflowNode, WorkflowEdge>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loadedForAgent, setLoadedForAgent] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loaded = loadedForAgent === agent.id;
  const [saved, setSaved] = useState(true);
  const [saveNotice, setSaveNotice] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [saveError, setSaveError] = useState("");
  const autosave = useWorkflowAutosave();
  const [codeTab, setCodeTab] = useState<"code" | "import">("code");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publication, setPublication] = useState<Publication | null>(null);
  const publicationNeedsUpdate = Boolean(publication?.active && (!saved || !publication.snapshot || publicationState(publication.snapshot.agent, publication.snapshot.graph) !== publicationState(agent, { nodes, edges })));
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`aiforce-agent-builder:${agent.id}`);
    channel.onmessage = (event: MessageEvent<{ type?: string; mode?: string }>) => {
      if (event.data?.type !== "open-dialog") return;
      if (event.data.mode === "code") {
        setCodeTab("code");
        setImportText("");
        setImportError("");
        setCodeOpen(true);
      } else if (event.data.mode === "publish") {
        setPublishOpen(true);
      }
    };
    return () => channel.close();
  }, [agent.id]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadWorkflow() {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/workflow`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load this workflow from PostgreSQL.");
        const graph = data.graph ? normalizeWorkflowGraph(data.graph.nodes, data.graph.edges) : starterGraph();
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setSaved(Boolean(data.graph));
        setSaveError("");
        setLoadedForAgent(agent.id);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSaveError(error instanceof Error ? error.message : "Could not load this workflow from PostgreSQL.");
      }
    }
    void loadWorkflow();
    return () => controller.abort();
  }, [agent, loadAttempt]);

  useEffect(() => {
    if (!loaded) return;
    fetch(`/api/agents/${encodeURIComponent(agent.id)}/publish`).then(async (response) => {
      const data = await response.json();
      if (response.ok) setPublication(data.publication);
    }).catch(() => {});
  }, [agent.id, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (saved) return;
    if (!autosave) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/workflow`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes, edges }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save this workflow to PostgreSQL.");
        setNodes((current) => markCredentialsPersisted(current));
        setSaved(true);
        setSaveError("");
      } catch (error) {
        setSaved(false);
        setSaveError(error instanceof Error ? error.message : "Could not save this workflow to PostgreSQL.");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [agent.id, autosave, edges, loaded, nodes, saved]);

  useEffect(() => {
    if (loaded && nodes.length) window.requestAnimationFrame(() => void fitView({ padding: 0.22, duration: 280 }));
  }, [fitView, loaded, nodes.length]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const onNodesChange = useCallback((changes: NodeChange<WorkflowNode>[]) => {
    const protectedChanges = changes.filter((change) => !(change.type === "remove" && change.id === "start"));
    if (protectedChanges.some((change) => change.type !== "select")) setSaved(false);
    setNodes((current) => normalizeWorkflowGraph(applyNodeChanges(protectedChanges, current), []).nodes);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<WorkflowEdge>[]) => { if (changes.some((change) => change.type !== "select")) setSaved(false); setEdges((current) => applyEdgeChanges(changes, current) as WorkflowEdge[]); }, []);
  const onConnect = useCallback((connection: Connection) => { setSaved(false); setEdges((current) => addEdge({ ...connection, type: "default", style: { stroke: "#9ba3b1", strokeWidth: 1.5 }, label: connection.sourceHandle === "if" ? "If" : connection.sourceHandle === "else" ? "Else" : undefined }, current)); }, []);

  const addNode = useCallback<AddWorkflowNode>((kind, point, overrides) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = point ?? screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 900) * 0.55, y: (rect?.top ?? 0) + (rect?.height ?? 600) * 0.5 });
    const node: WorkflowNode = {
      id: `${kind.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
      type: kind,
      position: { x: center.x - 50 + Math.random() * 36, y: center.y - 22 + Math.random() * 36 },
      data: { ...defaultNodeData(kind, agent.name), ...overrides },
    };
    setSaved(false);
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
  }, [agent.name, screenToFlowPosition]);

  const updateNode = useCallback((id: string, updates: Partial<WorkflowNodeData>) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, ...updates } } : node));
    setSaved(false);
  }, []);

  const saveNow = useCallback(async () => {
    if (!loaded) return false;
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/workflow`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes, edges }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this workflow to PostgreSQL.");
      setNodes((current) => markCredentialsPersisted(current));
      setSaved(true);
      setSaveError("");
      setSaveNotice("Workflow saved to PostgreSQL");
      window.setTimeout(() => setSaveNotice(""), 2300);
      return true;
    } catch (error) {
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : "Could not save this workflow to PostgreSQL.");
      return false;
    }
  }, [agent.id, edges, loaded, nodes]);

  const openPreview = useCallback(async () => {
    if (!loaded) return;
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setSaveError("Your browser blocked the Preview window. Allow pop-ups for this site and try again.");
      return;
    }
    previewWindow.opener = null;
    previewWindow.document.title = "Opening agent preview…";
    const isSaved = await saveNow();
    if (isSaved) previewWindow.location.href = `/agent-builder/${encodeURIComponent(agent.id)}/preview`;
    else previewWindow.close();
  }, [agent.id, loaded, saveNow]);

  const setAutosavePreference = useCallback((enabled: boolean) => {
    window.localStorage.setItem("aiforce:workflow-autosave", enabled ? "on" : "off");
    window.dispatchEvent(new Event("aiforce-autosave-change"));
    if (enabled && loaded && !saved) setSaveNotice("Autosave enabled");
    window.setTimeout(() => setSaveNotice(""), 1800);
  }, [loaded, saved]);

  async function importWorkflow() {
    if (!importText.trim()) return;
    try {
      const response = await fetch("/api/agents/import-published", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: importText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import the published workflow.");
      setImportError("");
      setCodeOpen(false);
      router.push(`/agent-builder/${encodeURIComponent(data.agentId)}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import the published workflow.");
    }
  }

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/aiforce-node") as WorkflowNodeKind;
    const valid: WorkflowNodeKind[] = ["AgentNode", "EndNode", "IfElseNode", "WhileNode", "UserApprovalNode", "ApiNode"];
    if (valid.includes(kind)) addNode(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [addNode, screenToFlowPosition]);

  const agentEndpoint = `${typeof window === "undefined" ? "" : window.location.origin}/api/published-agents/${publication?.publicId ?? "<PUBLISHED_AGENT_ID>"}/chat`;
  const integrationCode = `const agentEndpoint = ${JSON.stringify(agentEndpoint)};\nlet conversationId: string | undefined;\n\nexport async function sendMessageToAgent(input: string): Promise<string> {\n  const response = await fetch(agentEndpoint, {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ input, conversationId }),\n  });\n\n  conversationId = response.headers.get('X-Agent-Conversation-Id') ?? conversationId;\n\n  if (!response.ok) {\n    const error = await response.json().catch(() => ({}));\n    throw new Error(error.error || 'The agent request failed');\n  }\n\n  return response.text();\n}\n\n// Example:\nconst reply = await sendMessageToAgent('Hello');\nconsole.log(reply);`;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(integrationCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      setCodeCopied(false);
    }
  }

  async function publishAgent() {
    setPublishing(true);
    try {
      const saveResponse = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/workflow`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes, edges }),
      });
      const saveData = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveData.error || "Save the workflow before publishing.");
      setSaved(true);
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/publish`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not publish this agent.");
      setPublication(data.publication);
      setSaveError("");
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not publish this agent."); }
    finally { setPublishing(false); }
  }

  async function unpublishAgent() {
    setPublishing(true);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/publish`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not unpublish this agent.");
      setPublication((current) => current ? { ...current, active: false } : null);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not unpublish this agent."); }
    finally { setPublishing(false); }
  }

  return <WorkflowContext.Provider value={{ addNode, openToolLibrary: onOpenToolLibrary }}><div className="flex h-dvh min-h-[520px] flex-col overflow-hidden bg-white text-[#172033]">
    <Header name={agent.name} onBack={onBack} onCode={() => { setCodeTab("code"); setImportText(""); setImportError(""); setCodeOpen(true); }} onPreview={() => void openPreview()} onSave={() => void saveNow()} onPublish={() => setPublishOpen(true)} saved={saved} loading={!loaded} autosave={autosave} onAutosaveChange={setAutosavePreference} />
    <div ref={canvasRef} onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} className="relative min-h-0 flex-1 bg-white">
      {!loaded ? saveError ? <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center"><p role="alert" className="max-w-md text-sm leading-6 text-rose-700">{saveError}</p><button type="button" onClick={() => { setSaveError(""); setLoadAttempt((attempt) => attempt + 1); }} className="rounded-lg bg-[#6255e8] px-4 py-2.5 text-xs font-semibold text-white">Retry loading workflow</button></div> : <div className="flex h-full items-center justify-center text-sm text-[#7c8595]"><LoaderCircle className="mr-2 size-4 animate-spin" />Loading workflow from PostgreSQL…</div> : <>
        <ReactFlow<WorkflowNode, WorkflowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.12}
          maxZoom={1.8}
          defaultEdgeOptions={{ type: "default", style: { stroke: "#9ba3b1", strokeWidth: 1.5 } }}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.6} color="#b9c1cf" />
          <Controls position="bottom-left" />
          <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={2} maskColor="rgba(242,244,248,0.7)" className="!mb-3 !mr-3 !rounded-xl !border !border-[#e5e7eb] !bg-white !shadow-sm" />
          <Panel position="top-left" className="!m-3 sm:!m-5"><AgentToolsPanel /></Panel>
        </ReactFlow>
        {selectedNode && <SettingPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} onChange={updateNode} />}
        {saveNotice && <div role="status" className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#202331] px-4 py-2.5 text-[11px] font-medium text-white shadow-lg"><Check className="size-4 text-emerald-300" />{saveNotice}</div>}
        {saveError && <div role="alert" className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-[10px] text-rose-700 shadow-lg">{saveError}</div>}
      </>}
    </div>
    {codeOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101522]/35 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setCodeOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="workflow-code-title" className="flex max-h-[92vh] w-full max-w-[930px] flex-col overflow-hidden rounded-2xl border border-[#e0e3ea] bg-white shadow-[0_30px_90px_rgba(16,21,34,.22)]"><header className="flex shrink-0 items-start justify-between border-b border-[#eceef2] px-5 py-4 sm:px-6"><div><h2 id="workflow-code-title" className="text-[14px] font-semibold text-[#283144]">Agent Integration Code</h2><p className="mt-1 text-[10px] leading-5 text-[#7f8999]">Copy this code into your application to send messages to the published agent.</p></div><button type="button" aria-label="Close code" onClick={() => setCodeOpen(false)} className="flex size-8 items-center justify-center rounded-lg text-[#737d8c] hover:bg-[#f4f5f7]"><X className="size-4" /></button></header>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-6"><div className="flex items-center gap-2"><button type="button" onClick={() => setCodeTab("code")} className={"h-8 rounded-lg px-3 text-[10px] font-semibold " + (codeTab === "code" ? "bg-[#171923] text-white" : "border border-[#e2e5ed] text-[#465064] hover:bg-[#f8f9fb]")}>View Code</button><button type="button" onClick={() => setCodeTab("import")} className={"h-8 rounded-lg px-3 text-[10px] font-semibold " + (codeTab === "import" ? "bg-[#171923] text-white" : "border border-[#e2e5ed] text-[#465064] hover:bg-[#f8f9fb]")}>Paste Code to Import Flow</button></div>{codeTab === "code" && publication?.active && <button type="button" onClick={copyCode} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e5ed] px-3 text-[10px] font-semibold text-[#515b6c] hover:bg-[#f7f8fa]">{codeCopied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}{codeCopied ? "Copied" : "Copy code"}</button>}</div>
      {codeTab === "code" ? (publication?.active ? <><div className="mt-4 flex shrink-0 items-center gap-1 border-b border-[#eceef2] px-5 sm:px-6"><span className="border-b-2 border-[#6255e8] px-3 py-2 text-[10px] font-medium text-[#5146d2]">agent.ts</span></div><div className="mx-5 my-4 min-h-0 overflow-auto rounded-xl border border-[#30343b] bg-[#1e1e1e] sm:mx-6"><div className="sticky top-0 flex items-center justify-between border-b border-[#30343b] bg-[#252526] px-4 py-3"><span className="text-[10px] font-semibold text-[#d4d4d4]">agent.ts</span><span className="text-[9px] text-[#858585]">ts</span></div><pre className="overflow-x-auto p-4 text-[10px] leading-[1.75] text-[#d4d4d4] sm:p-5 sm:text-[11px]"><code>{highlightTypeScript(integrationCode)}</code></pre></div><footer className="shrink-0 border-t border-[#eceef2] px-5 py-3 text-[9px] leading-5 text-[#858e9d] sm:px-6">Published endpoint · {publication.publicId}</footer></> : <div className="m-5 rounded-xl border border-[#e6e8ee] bg-[#fafbfc] p-4 text-[11px] leading-5 text-[#697386]">This agent has not been published yet, so it does not have an integration endpoint. Publish the agent to generate its <span className="font-semibold text-[#343d4d]">agent.ts</span> code.</div>) : <><div className="flex min-h-[250px] flex-1 flex-col px-5 py-4 sm:px-6"><div className="mb-3"><label htmlFor="published-agent-code" className="text-[11px] font-semibold text-[#283144]">Paste the published agent code or endpoint</label><p className="mt-1 text-[10px] leading-5 text-[#7f8999]">The app imports the saved graph into your account. API keys are removed; add your own key and reboot the agent after import.</p></div><textarea id="published-agent-code" value={importText} onChange={(event) => { setImportText(event.currentTarget.value); setImportError(""); }} spellCheck={false} placeholder="Paste the copied agent.ts snippet or /api/published-agents/.../chat URL here" className="min-h-[190px] flex-1 resize-y rounded-xl border border-[#dfe2e9] bg-[#fbfcfe] p-4 font-mono text-[10px] leading-5 text-[#394457] outline-none focus:border-[#a9a2f2] focus:ring-3 focus:ring-[#6255e8]/10" maxLength={48 * 1024} />{importError && <p role="alert" className="mt-2 text-[10px] text-rose-700">{importError}</p>}</div><footer className="flex shrink-0 justify-end border-t border-[#eceef2] px-5 py-3 sm:px-6"><button type="button" onClick={() => void importWorkflow()} disabled={!importText.trim()} className="h-9 rounded-lg bg-[#171923] px-4 text-[10px] font-semibold text-white disabled:opacity-45">Import Workflow</button></footer></>}</section></div>}
    {publishOpen && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#101522]/35 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setPublishOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="publish-agent-title" className="w-full max-w-[650px] overflow-hidden rounded-2xl border border-[#e0e3ea] bg-white shadow-[0_30px_90px_rgba(16,21,34,.22)]"><header className="flex items-start justify-between border-b border-[#eceef2] px-5 py-4"><div><h2 id="publish-agent-title" className="text-[14px] font-semibold text-[#283144]">Publish Agent</h2><p className="mt-1 text-[10px] leading-5 text-[#7f8999]">Publishing creates a server-side release snapshot and a callable HTTPS endpoint.</p></div><button type="button" aria-label="Close publish dialog" onClick={() => setPublishOpen(false)} className="flex size-8 items-center justify-center rounded-lg text-[#737d8c] hover:bg-[#f4f5f7]"><X className="size-4" /></button></header><div className="p-5">{saveError && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700">{saveError}</p>}{publication?.active ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e6e8ee] p-4"><div className="min-w-0"><p className="flex items-center gap-2 text-[11px] font-semibold text-[#3c4657]"><span className="size-2 shrink-0 rounded-full bg-emerald-500" />Published · version {publication.version}</p><p className="mt-1 break-all text-[9px] text-[#8992a2]">{typeof window !== "undefined" ? window.location.origin : ""}/api/published-agents/{publication.publicId}/chat</p><p className="mt-1 text-[9px] text-[#8992a2]">{publicationNeedsUpdate ? "Changes are ready to publish as a new version." : "The published version is up to date."}</p></div><div className="flex shrink-0 gap-2"><button type="button" disabled={publishing || !publicationNeedsUpdate} onClick={() => void publishAgent()} className="h-9 rounded-lg bg-[#171923] px-3 text-[10px] font-semibold text-white disabled:opacity-50">{publishing ? "Publishing…" : publicationNeedsUpdate ? "Update Published Version" : "Published"}</button><button type="button" disabled={publishing} onClick={() => void unpublishAgent()} className="h-9 rounded-lg border border-[#e2e5ed] px-3 text-[10px] font-semibold text-[#596477] disabled:opacity-50">Unpublish</button></div></div> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e6e8ee] p-4"><div><p className="text-[11px] font-semibold text-[#3c4657]">{publication ? "Unpublished" : "Ready to publish"}</p><p className="mt-1 text-[9px] text-[#8992a2]">Publishing saves this version and creates an integration endpoint.</p></div><button type="button" disabled={publishing} onClick={() => void publishAgent()} className="h-9 rounded-lg bg-[#171923] px-4 text-[10px] font-semibold text-white disabled:opacity-50">{publishing ? "Publishing…" : "Publish Agent"}</button></div>}</div></section></div>}
  </div></WorkflowContext.Provider>;
}

export default function WorkflowBuilder() {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const agentId = Array.isArray(params.agentId) ? params.agentId[0] : params.agentId;
  const decodedAgentId = decodeURIComponent(agentId);
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAgent() {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(decodedAgentId)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Agent not found.");
        setAgent(data.agent as AgentRecord);
      } catch {
        if (!controller.signal.aborted) setAgent(null);
      } finally {
        if (!controller.signal.aborted) setHydrated(true);
      }
    }
    void loadAgent();
    return () => controller.abort();
  }, [decodedAgentId]);

  if (!hydrated) return <div className="flex h-dvh items-center justify-center bg-white text-sm text-[#7c8595]"><LoaderCircle className="mr-2 size-4 animate-spin" />Opening agent…</div>;
  if (!agent) return <div className="flex h-dvh items-center justify-center bg-[#f7f8fc] p-5"><div className="max-w-md rounded-2xl border border-[#e7e9ef] bg-white p-7 text-center shadow-sm"><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-[#f0eeff] text-[#6255e8]"><Save className="size-5" /></div><h1 className="mt-4 text-lg font-semibold text-[#273142]">Agent not found</h1><p className="mt-2 text-xs leading-5 text-[#7f8999]">This agent is not in your PostgreSQL workspace. Open an agent from the Agents page.</p><button type="button" onClick={() => router.push("/dashboard/agents")} className="mt-5 rounded-lg bg-[#171923] px-4 py-2.5 text-xs font-semibold text-white">Go to Agents</button></div></div>;

  return <ReactFlowProvider><BuilderCanvas agent={agent} onBack={() => router.push("/dashboard/agents")} onOpenToolLibrary={() => router.push("/dashboard/tools")} /></ReactFlowProvider>;
}
