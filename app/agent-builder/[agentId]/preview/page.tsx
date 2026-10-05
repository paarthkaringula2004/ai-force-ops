"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Code2, Eye, LoaderCircle, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { WorkflowContext } from "@/context/WorkflowContext";
import { normalizeWorkflowGraph } from "@/lib/workflow-graph";
import type { AgentRecord } from "@/lib/agent-store";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/types/workflow";
import AgentNode from "../../_costumNodes/AgentNode";
import ApiNode from "../../_costumNodes/ApiNode";
import EndNode from "../../_costumNodes/EndNode";
import IfElseNode from "../../_costumNodes/IfElseNode";
import StartNode from "../../_costumNodes/StartNode";
import UserApprovalNode from "../../_costumNodes/UserApprovalNode";
import WhileNode from "../../_costumNodes/WhileNode";

const nodeTypes: NodeTypes = { StartNode, AgentNode, ApiNode, EndNode, IfElseNode, WhileNode, UserApprovalNode };
type Message = { role: "user" | "assistant"; content: string };

function PreviewWorkspace({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [graph, setGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const channelName = useMemo(() => `aiforce-agent-builder:${agentId}`, [agentId]);
  const agentNode = graph.nodes.find((node) => node.type === "AgentNode");
  const agentNodeSettings = agentNode?.data.settings && typeof agentNode.data.settings === "object" ? agentNode.data.settings as Record<string, unknown> : {};
  const previewModel = typeof agentNode?.data.modelId === "string" && agentNode.data.modelId ? agentNode.data.modelId : typeof agentNodeSettings.model === "string" ? agentNodeSettings.model : agent?.modelId ?? "";
  const previewInstructions = typeof agentNode?.data.instructions === "string" && agentNode.data.instructions ? agentNode.data.instructions : typeof agentNodeSettings.instruction === "string" ? agentNodeSettings.instruction : agent?.instructions ?? "";
  const includeChatHistory = typeof agentNode?.data.includeHistory === "boolean" ? agentNode.data.includeHistory : typeof agentNodeSettings.includeHistory === "boolean" ? agentNodeSettings.includeHistory : true;
  const previewOutput = agentNode?.data.output ?? agentNodeSettings.output;
  const previewSchema = typeof agentNode?.data.schema === "string" ? agentNode.data.schema : typeof agentNodeSettings.schema === "string" ? agentNodeSettings.schema : "";
  const previewContext = typeof agentNode?.data.context === "string" ? agentNode.data.context : typeof agentNodeSettings.context === "string" ? agentNodeSettings.context : "";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [agentResponse, workflowResponse] = await Promise.all([
          fetch(`/api/agents/${encodeURIComponent(agentId)}`, { signal: controller.signal }),
          fetch(`/api/agents/${encodeURIComponent(agentId)}/workflow`, { signal: controller.signal }),
        ]);
        const agentData = await agentResponse.json();
        const workflowData = await workflowResponse.json();
        if (!agentResponse.ok) throw new Error(agentData.error || "Could not load this agent.");
        if (!workflowResponse.ok) throw new Error(workflowData.error || "Could not load this workflow.");
        setAgent(agentData.agent as AgentRecord);
        const nextGraph = workflowData.graph
          ? normalizeWorkflowGraph(workflowData.graph.nodes, workflowData.graph.edges)
          : { nodes: [], edges: [] };
        setGraph(nextGraph);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Could not load this agent preview.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [agentId]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const openEditorDialog = useCallback((mode: "code" | "publish") => {
    if (typeof BroadcastChannel === "undefined") {
      setChatError("Open this Preview from the builder tab to access Code and Publish.");
      return;
    }
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "open-dialog", mode });
    channel.close();
    setChatError(mode === "code" ? "Code opened in the builder tab." : "Publish opened in the builder tab.");
    window.setTimeout(() => setChatError(""), 2500);
  }, [channelName]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !agent || sending) return;
    if (!previewModel) {
      setChatError("Choose a model for this agent before testing it.");
      return;
    }
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    const instructions = [previewInstructions, previewContext ? `Additional context:\n${previewContext}` : "", previewOutput === "Json" && previewSchema ? `Return valid JSON matching this schema:\n${previewSchema}` : ""].filter(Boolean).join("\n\n");
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setChatError("");
    setSending(true);
    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: previewModel, instructions, messages: includeChatHistory ? nextMessages : [{ role: "user", content: text }] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The agent request failed.");
      setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: data.reply || "The agent completed without a text response." } : message));
    } catch (error) {
      setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: "" } : message));
      setChatError(error instanceof Error ? error.message : "Could not reach the agent.");
    } finally {
      setSending(false);
    }
  }

  const noop = useCallback(() => {}, []);

  if (loading) return <div className="flex h-dvh items-center justify-center text-sm text-[#7c8595]"><LoaderCircle className="mr-2 size-4 animate-spin" />Loading saved agent preview…</div>;
  if (loadError || !agent) return <div className="flex h-dvh items-center justify-center p-5"><div className="max-w-md rounded-2xl border border-[#e7e9ef] bg-white p-7 text-center"><p role="alert" className="text-sm text-rose-700">{loadError || "Agent not found."}</p><button type="button" onClick={() => router.push(`/agent-builder/${encodeURIComponent(agentId)}`)} className="mt-4 rounded-lg bg-[#171923] px-4 py-2 text-xs font-semibold text-white">Back to builder</button></div></div>;

  return <WorkflowContext.Provider value={{ addNode: noop, openToolLibrary: noop }}>
    <div className="flex h-dvh min-h-[520px] flex-col overflow-hidden bg-[#f7f8fc] text-[#172033]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#e7e9ed] bg-white px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Back to builder" onClick={() => router.push(`/agent-builder/${encodeURIComponent(agentId)}`)} className="flex size-9 items-center justify-center rounded-lg text-[#475467] hover:bg-[#f3f4f7]"><ArrowLeft className="size-5" /></button><div className="min-w-0"><h1 className="truncate text-[15px] font-semibold sm:text-[17px]">{agent.name}</h1><p className="text-[10px] text-[#8992a2]">Agent preview</p></div></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => openEditorDialog("code")} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-[#344054] hover:bg-[#f3f4f7]"><Code2 className="size-4" /><span>Code</span></button><button type="button" onClick={() => openEditorDialog("publish")} className="h-9 rounded-lg bg-[#171923] px-4 text-[11px] font-semibold text-white hover:bg-[#302e48]">Publish</button></div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)] lg:gap-4 lg:p-5">
        <section className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e4e7ee] bg-white p-4">
          <div className="mb-3 flex shrink-0 items-center gap-2"><Eye className="size-4 text-[#6255e8]" /><h2 className="text-sm font-semibold">Preview</h2><span className="ml-auto text-[10px] text-[#8992a2]">Saved workflow · {graph.nodes.length} nodes</span></div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-[#f7f8fc]">
            <ReactFlow<WorkflowNode, WorkflowEdge> nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnDoubleClick={false} fitView fitViewOptions={{ padding: 0.22 }} minZoom={0.12} maxZoom={1.6} proOptions={{ hideAttribution: false }}>
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.6} color="#b9c1cf" />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-[#858e9d]">This preview displays your saved workflow. Chat uses the agent’s saved model and instructions; visual graph nodes are not executed yet.</p>
        </section>
        <section className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e4e7ee] bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-[#eceef2] px-4 py-3"><div><h2 className="text-sm font-semibold">Test your agent</h2><p className="mt-0.5 text-[10px] text-[#8992a2]">{previewModel || "Choose a model to start"}{previewOutput === "Json" ? " · JSON output" : ""}</p></div><span className={`size-2 rounded-full ${previewModel ? "bg-emerald-500" : "bg-amber-400"}`} /></div>
          <div ref={messagesRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {messages.length === 0 ? <div className="m-auto max-w-xs text-center text-xs leading-5 text-[#8992a2]">Send a message to test the saved agent instructions and model.</div> : messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[96%] rounded-xl px-4 py-3 text-[13px] leading-6 sm:max-w-[92%] ${message.role === "user" ? "self-end whitespace-pre-wrap bg-[#6255e8] text-white" : "self-start bg-[#f1f2f6] text-[#30394a]"}`}>{message.content ? message.role === "assistant" ? <div className="space-y-2 [&_a]:font-medium [&_a]:text-[#5749cc] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#c7c2fb] [&_blockquote]:pl-3 [&_blockquote]:text-[#657084] [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:leading-6 [&_h1:first-child]:mt-0 [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:leading-6 [&_h2:first-child]:mt-0 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3:first-child]:mt-0 [&_li]:pl-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p+p]:mt-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[#202631] [&_pre]:p-3 [&_pre]:text-[11px] [&_pre]:leading-5 [&_pre]:text-white [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <p>{children}</p>, code: ({ children, className }) => <code className={`${className ?? ""} rounded bg-white/70 px-1 py-0.5 font-mono text-[11px] text-[#5146b8]`}>{children}</code>, a: ({ children, href }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined}>{children}</a> }}>{message.content}</ReactMarkdown></div> : message.content : sending && index === messages.length - 1 ? <LoaderCircle className="size-4 animate-spin" /> : null}</div>)}
          </div>
          {chatError && <p role="status" className="mx-4 mb-2 text-[10px] text-rose-700">{chatError}</p>}
          <form onSubmit={(event) => void sendMessage(event)} className="flex shrink-0 items-end gap-2 border-t border-[#eceef2] p-3"><textarea value={input} onChange={(event) => setInput(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={sending} rows={2} maxLength={12000} placeholder="Message your agent…" className="min-h-10 flex-1 resize-none rounded-lg border border-[#dfe2e9] px-3 py-2 text-xs outline-none focus:border-[#aaa3f0] disabled:bg-[#f8f9fb]" /><button type="submit" disabled={!input.trim() || sending} aria-label="Send message" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#171923] text-white disabled:opacity-45"><Send className="size-4" /></button></form>
        </section>
      </main>
    </div>
  </WorkflowContext.Provider>;
}

export default function AgentPreviewPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = Array.isArray(params.agentId) ? params.agentId[0] : params.agentId;
  return <ReactFlowProvider><PreviewWorkspace agentId={decodeURIComponent(agentId)} /></ReactFlowProvider>;
}
