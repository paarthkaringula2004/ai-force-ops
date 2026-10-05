import { LabelField, TextSetting, type NodeSettingsProps } from "./SettingsFields";

export default function EndSettings({ data, onChange }: NodeSettingsProps) {
  return <div className="space-y-4"><LabelField data={data} onChange={onChange} /><TextSetting label="Completion message" field="message" data={data} onChange={onChange} multiline placeholder="Optional message for this path" /></div>;
}
