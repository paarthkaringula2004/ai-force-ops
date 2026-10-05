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
    data: { ...(existingStart?.data ?? {}), label: "Start" },
  };
  const nextNodes = [start, ...filtered.filter((node) => node !== existingStart && node.id !== "start" && node.type !== "StartNode")];
  const ids = new Set(nextNodes.map((node) => node.id));
  const nextEdges = edges.filter((edge): edge is WorkflowEdge => {
    if (typeof edge !== "object" || edge === null) return false;
    const candidate = edge as WorkflowEdge;
    return typeof candidate.id === "string" && typeof candidate.source === "string" && typeof candidate.target === "string" && ids.has(candidate.source) && ids.has(candidate.target);
  }).map((edge) => ({ ...edge, type: "default" }));
  return { nodes: nextNodes, edges: nextEdges };
}
