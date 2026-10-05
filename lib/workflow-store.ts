import type { WorkflowGraph } from "@/types/workflow";

export function workflowStorageKey(agentId: string, userId: string) {
  return `aiforce-ops:workflow:v1:${encodeURIComponent(userId)}:${agentId}`;
}

export function readWorkflow(agentId: string, userId: string): WorkflowGraph | null {
  try {
    if (userId === "local-browser") {
      const legacyKey = `aiforce-ops:workflow:v1:${agentId}`;
      const candidates = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => key !== null && (key === legacyKey || (key.startsWith("aiforce-ops:workflow:v1:") && key.endsWith(`:${agentId}`))));
      for (const key of candidates) {
        const graph = parseWorkflow(window.localStorage.getItem(key));
        if (graph) return graph;
      }
      return null;
    }
    const scopedKey = workflowStorageKey(agentId, userId);
    let serialized = window.localStorage.getItem(scopedKey);
    if (serialized === null && window.localStorage.getItem("aiforce-ops:legacy-browser-data-owner:v1") === userId) {
      serialized = window.localStorage.getItem(`aiforce-ops:workflow:v1:${agentId}`);
      if (serialized) window.localStorage.setItem(scopedKey, serialized);
    }
    return parseWorkflow(serialized);
  } catch {
    return null;
  }
}

export function readLocalWorkflow(agentId: string): WorkflowGraph | null {
  try {
    const localGraph = window.localStorage.getItem(workflowStorageKey(agentId, "local-browser"));
    if (localGraph !== null) return parseWorkflow(localGraph);
    const legacyOwner = window.localStorage.getItem("aiforce-ops:legacy-browser-data-owner:v1");
    if (legacyOwner && legacyOwner !== "local-browser") return null;
    return parseWorkflow(window.localStorage.getItem(`aiforce-ops:workflow:v1:${agentId}`));
  } catch {
    return null;
  }
}

function parseWorkflow(serialized: string | null): WorkflowGraph | null {
  try {
    const value: unknown = JSON.parse(serialized ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const graph = value as Record<string, unknown>;
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
    return { nodes: graph.nodes as WorkflowGraph["nodes"], edges: graph.edges as WorkflowGraph["edges"] };
  } catch {
    return null;
  }
}

export function saveWorkflow(agentId: string, graph: WorkflowGraph, userId: string) {
  window.localStorage.setItem(workflowStorageKey(agentId, userId), JSON.stringify(graph));
}
