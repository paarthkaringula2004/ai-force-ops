import { LabelField, TextSetting, type NodeSettingsProps } from "./SettingsFields";
import ThemedSelect from "@/components/themed-select";

export default function IfElseSettings({
    data,
    onChange,
    loop = false,
}: NodeSettingsProps & { loop?: boolean }) {
    return (
        <div className="space-y-4">
            <LabelField data={data} onChange={onChange} />
            <label className="block text-xs">
                Compare
                <ThemedSelect
                    aria-label="Condition source"
                    value={String(data.conditionSource || "previous")}
                    onChange={(e) => onChange({ conditionSource: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-purple-100 px-3 py-2"
                >
                    <option value="previous">Previous step result</option>
                    <option value="message">User message</option>
                </ThemedSelect>
            </label>
            <label className="block text-xs">
                Comparison
                <ThemedSelect
                    aria-label="Condition comparison"
                    value={String(data.conditionOperator || "contains")}
                    onChange={(e) => onChange({ conditionOperator: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-purple-100 px-3 py-2"
                >
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="not_contains">Does not contain</option>
                </ThemedSelect>
            </label>
            <TextSetting
                label="Text to compare"
                field="ifCondition"
                data={data}
                onChange={onChange}
                placeholder="e.g. urgent"
            />
            <p className="text-xs leading-5 text-slate-500">
                {loop
                    ? "Case-insensitive comparison. A match enters Body; otherwise Done."
                    : "Case-insensitive comparison. A match takes If; otherwise Else."}{" "}
                Connect both outputs. This is routing, not an authorization check.
            </p>
        </div>
    );
}
