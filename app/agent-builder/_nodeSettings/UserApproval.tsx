import { LabelField, TextSetting, type NodeSettingsProps } from "./SettingsFields";

export default function UserApproval({ data, onChange }: NodeSettingsProps) {
  return <div className="space-y-4"><LabelField data={data} onChange={onChange} /><TextSetting label="Approval request" field="approvalPrompt" data={data} onChange={onChange} multiline placeholder="What should the reviewer approve?" /><p className="text-[9px] leading-4 text-[#8b94a3]">The approval step is modeled in the flow. Human review routing will be connected with the runtime.</p></div>;
}
