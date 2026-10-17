import { LabelField, TextSetting, type NodeSettingsProps } from "./SettingsFields";

export default function UserApproval({ data, onChange }: NodeSettingsProps) {
    return (
        <div className="space-y-4">
            <LabelField data={data} onChange={onChange} />
            <TextSetting
                label="Approval request"
                field="approvalPrompt"
                data={data}
                onChange={onChange}
                multiline
                placeholder="What should the reviewer approve?"
            />
            <p className="text-xs leading-5 text-slate-500">
                Pauses the private preview for human review. Approve or Reject resumes the matching
                branch once. Connect both outputs. API writes still require their own exact request
                confirmation.
            </p>
        </div>
    );
}
