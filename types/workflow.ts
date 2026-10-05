import type { Edge, Node } from "@xyflow/react";

export type WorkflowNodeKind =
  | "StartNode"
  | "AgentNode"
  | "EndNode"
  | "IfElseNode"
  | "WhileNode"
  | "UserApprovalNode"
  | "ApiNode";

export type WorkflowNodeData = {
  label: string;
  bgColor?: string;
  instructions?: string;
  modelId?: string;
  includeHistory?: boolean;
  output?: "Text" | "Json";
  schema?: string;
  context?: string;
  ifCondition?: string;
  elseCondition?: string;
  condition?: string;
  url?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  includeApiKey?: boolean;
  apiKeyDraft?: string;
  apiKeyConfigured?: boolean;
  clearApiKey?: boolean;
  apiKeyLocation?: "query" | "header";
  apiKeyName?: string;
  apiKeyPrefix?: string;
  bodyParams?: string;
  approvalPrompt?: string;
  maxIterations?: number;
  message?: string;
  [key: string]: unknown;
};

export type WorkflowNode = Node<WorkflowNodeData, WorkflowNodeKind>;
export type WorkflowEdge = Edge;
export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
