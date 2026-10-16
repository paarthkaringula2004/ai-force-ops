import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/types/workflow";

/** Keep one immovable Start node in every persisted workflow. */
export function normalizeWorkflowGraph(nodes: unknown[], edges: unknown[]): WorkflowGraph {
  const filtered = nodes.filter((node): node is WorkflowNode =>
    typeof node === "object" && node !== null && typeof (node as WorkflowNode).id === "string" && typeof (node as WorkflowNode).type === "string",
  );
  const existingStart = filtered.find((node) => node.type === "StartNode" || node.id === "start");
  const start: WorkflowNode = {
    ...(existingStart ?? { id: "start", type: "StartNode" as const, position: { x: 60, y: 260 }, data: { label: "Start" } }),
    id: "start",
    type: "StartNode",
    draggable: false,
    deletable: false,
    data: { ...(existingStart?.data ?? {}), label: existingStart?.data?.label || "Info" },
  };
  const nextNodes = [start, ...filtered.filter((node) => node !== existingStart && node.id !== "start" && node.type !== "StartNode")];
  const ids = new Set(nextNodes.map((node) => node.id));
  // React Flow treats a missing target ID as "first target", not the unnamed target.
  // Studio nodes have top and left targets, so persist the left handle explicitly.
  const studioTargets = new Set(nextNodes.filter(node => ['ModelNode','MemoryNode','ToolsNode','AgentsNode','ReferenceNode'].includes(node.type)).map(node => node.id));
  const actual = start.data.workflowMode === "actual";
  const actualAgents = new Set(nextNodes.filter(node => node.type === "AgentNode").map(node => node.id));
  const nextEdges = edges.filter((edge): edge is WorkflowEdge => {
    if (typeof edge !== "object" || edge === null) return false;
    const candidate = edge as WorkflowEdge;
    return typeof candidate.id === "string" && typeof candidate.source === "string" && typeof candidate.target === "string" && ids.has(candidate.source) && ids.has(candidate.target);
  }).map((edge) => ({
    ...edge,
    ...(studioTargets.has(edge.target) && (!edge.targetHandle || actual) ? { targetHandle: "input" } : {}),
    ...((studioTargets.has(edge.source) || actualAgents.has(edge.source)) && !edge.sourceHandle ? { sourceHandle: "output" } : {}),
    ...(actual && (studioTargets.has(edge.source) || actualAgents.has(edge.source) && studioTargets.has(edge.target)) ? { sourceHandle: "output" } : {}),
    type: "default",
  }));
  // A reference is one dependency even if connected through both its top and left handles.
  // Keep control-flow branches and references belonging to different agents distinct.
  const references=new Set(nextNodes.filter(node=>node.type==='ReferenceNode').map(node=>node.id));
  const attachments=new Set<string>();
  const uniqueEdges=nextEdges.filter(edge=>{
    if(!references.has(edge.target))return true;
    const key=JSON.stringify([edge.source,edge.target]);
    if(attachments.has(key))return false;
    attachments.add(key);return true;
  });
  return { nodes: nextNodes, edges: uniqueEdges };
}

/** Preview is a read-only projection; saved editor selection is not preview state. */
export function workflowPreviewGraph(nodes:unknown[],edges:unknown[]):WorkflowGraph {
 const graph=normalizeWorkflowGraph(nodes,edges);
 return {nodes:graph.nodes.map(node=>({...node,selected:false,dragging:false})),edges:graph.edges.map(edge=>({...edge,selected:false}))};
}

/** Reattaching a reference replaces its old wire, preserving the handle just chosen. */
export function edgesBeforeConnection(nodes: WorkflowNode[], edges: WorkflowEdge[], connection: {source:string;target:string}) {
  if (!nodes.some(node => node.id === connection.target && node.type === 'ReferenceNode')) return edges;
  return edges.filter(edge => edge.source !== connection.source || edge.target !== connection.target);
}
