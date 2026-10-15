import type { WorkflowGraph, WorkflowNode, WorkflowNodeKind } from "@/types/workflow";

export function studioGraph(name: string, modelId = "gpt-4.1-mini", instructions = ""): WorkflowGraph {
  const node = (id: string, type: WorkflowNodeKind, x: number, y: number, data: WorkflowNode["data"]): WorkflowNode => ({ id, type, position: { x, y }, data });
  return {
    nodes: [
      node("start", "StartNode", 60, 240, { label: "Info" }),
      node("main", "AgentNode", 340, 240, { label: name, modelId, instructions, includeHistory: true }),
      node("model", "ModelNode", 60, 440, { label: "Model", modelId, maxOutputTokens: 2048, historyMessages: 20 }),
      node("memory", "MemoryNode", 340, 440, { label: "Memory" }),
      node("tools", "ToolsNode", 620, 440, { label: "Tools" }),
      node("agents", "AgentsNode", 660, 240, { label: "Agents" }),
    ],
    edges: [
      { id: "info-main", source: "start", target: "main" },
      { id: "main-model", source: "main", sourceHandle: "model", target: "model", targetHandle: "attachment" },
      { id: "main-memory", source: "main", sourceHandle: "memory", target: "memory", targetHandle: "attachment" },
      { id: "main-tools", source: "main", sourceHandle: "tools", target: "tools", targetHandle: "attachment" },
      { id: "main-agents", source: "main", target: "agents" },
    ],
  };
}

// Only directly wired dependencies are available. Unconnected canvas items never execute.
export function studioDependencies(graph: WorkflowGraph, rootId?: string) {
  const start = graph.nodes.find(n => n.type === "StartNode");
  const root = graph.nodes.find(n => n.type === "AgentNode" && (rootId ? n.id === rootId : graph.edges.some(edge => edge.source === start?.id && edge.target === n.id)));
  if (!root) return { root: null, model: undefined, references: [] as WorkflowNode[] };
  const direct = graph.edges.filter(e => e.source === root.id).map(e => graph.nodes.find(n => n.id === e.target)).filter((n): n is WorkflowNode => Boolean(n));
  const hubs = direct.filter(n => ["ToolsNode", "AgentsNode", "MemoryNode"].includes(n.type!));
  const children = graph.edges.filter(e => hubs.some(h => h.id === e.source)).map(e => graph.nodes.find(n => n.id === e.target)).filter((n): n is WorkflowNode => Boolean(n));
  return { root, model: direct.find(n => n.type === "ModelNode"), references: [...direct, ...children].filter(n => n.type === "ReferenceNode") };
}

export function mergeStudioGraph(existing: WorkflowGraph, incoming: WorkflowGraph): WorkflowGraph {
  if (!existing.nodes?.length) return incoming;
  const graph: WorkflowGraph = { nodes: existing.nodes.map(n => ({ ...n, data: { ...n.data } })), edges: [...(existing.edges || [])] };
  const root = graph.nodes.find(n => n.type === "AgentNode") || incoming.nodes.find(n => n.type === "AgentNode")!;
  if (!graph.nodes.some(n => n.id === root.id)) graph.nodes.push(root);
  const ids = new Map<string, string>([["start", "start"], ["main", root.id]]);
  for (const node of incoming.nodes.filter(n => ["ModelNode", "MemoryNode", "ToolsNode", "AgentsNode"].includes(n.type!))) {
    const old = graph.nodes.find(n => n.type === node.type);
    if (old) ids.set(node.id, old.id);
    else {
      const id = graph.nodes.some(n => n.id === node.id) ? `studio-${node.id}` : node.id;
      const data = node.type === "ModelNode" ? { ...node.data, modelId: root.data.modelId || node.data.modelId } : node.data;
      graph.nodes.push({ ...node, id, data }); ids.set(node.id, id);
    }
  }
  for (const node of incoming.nodes.filter(n => n.type === "ReferenceNode")) {
    const old = graph.nodes.find(n => n.type === "ReferenceNode" && n.data.referenceKind === node.data.referenceKind && n.data.referenceId === node.data.referenceId);
    if (old) ids.set(node.id, old.id);
    else {
      let id = node.id; while (graph.nodes.some(n => n.id === id)) id = `studio-${id}`;
      graph.nodes.push({ ...node, id }); ids.set(node.id, id);
    }
  }
  for (const edge of incoming.edges) {
    const source = ids.get(edge.source), target = ids.get(edge.target);
    if (!source || !target || graph.edges.some(e => e.source === source && e.target === target)) continue;
    graph.edges.push({ ...edge, id: `studio-${source}-${target}`, source, target });
  }
  return graph;
}
