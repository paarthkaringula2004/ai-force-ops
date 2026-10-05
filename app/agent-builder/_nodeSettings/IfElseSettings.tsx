import { LabelField, TextSetting, type NodeSettingsProps } from "./SettingsFields";

export default function IfElseSettings({ data, onChange }: NodeSettingsProps) {
  return <div className="space-y-4"><LabelField data={data} onChange={onChange} /><TextSetting label="If condition" field="ifCondition" data={data} onChange={onChange} placeholder="Condition for the upper branch" /><TextSetting label="Else condition" field="elseCondition" data={data} onChange={onChange} placeholder="Fallback for the lower branch" /></div>;
}
