"use client";

import { createContext, useContext } from "react";
import type { WorkflowNodeData, WorkflowNodeKind } from "@/types/workflow";

export type AddWorkflowNode = (kind: WorkflowNodeKind, position?: { x: number; y: number }, data?: Partial<WorkflowNodeData>) => void;
export const WorkflowContext = createContext<{ addNode: AddWorkflowNode; openToolLibrary: () => void } | null>(null);

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) throw new Error("Workflow tools must be rendered inside a WorkflowContext provider.");
  return context;
}
