import type { WorkflowNodeData } from "@/types/workflow";
import { NodeField } from "@/app/agent-builder/_components/NodeField";

export type NodeSettingsProps = { data: WorkflowNodeData; onChange: (updates: Partial<WorkflowNodeData>) => void };

export function LabelField({ data, onChange }: NodeSettingsProps) {
  return <NodeField label="Name" value={data.label} onChange={(label) => onChange({ label })} />;
}

export function TextSetting({ label, field, data, onChange, multiline = false, placeholder }: NodeSettingsProps & { label: string; field: keyof WorkflowNodeData; multiline?: boolean; placeholder?: string }) {
  const value = data[field];
  return <NodeField label={label} value={typeof value === "string" ? value : ""} onChange={(next) => onChange({ [field]: next })} multiline={multiline} placeholder={placeholder} />;
}
