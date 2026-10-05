import { LabelField, TextSetting, type NodeSettingsProps } from "./SettingsFields";
import { NodeField } from "@/app/agent-builder/_components/NodeField";

export default function WhileSettings({ data, onChange }: NodeSettingsProps) {
  return <div className="space-y-4"><LabelField data={data} onChange={onChange} /><TextSetting label="Loop condition" field="condition" data={data} onChange={onChange} placeholder="Repeat while…" /><NodeField label="Maximum iterations" value={data.maxIterations ?? 3} onChange={(value) => onChange({ maxIterations: Math.max(1, Math.min(100, Number(value) || 1)) })} /></div>;
}
