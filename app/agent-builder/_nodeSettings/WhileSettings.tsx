import { type NodeSettingsProps } from "./SettingsFields";
import IfElseSettings from "./IfElseSettings";
import { NodeField } from "@/app/agent-builder/_components/NodeField";

export default function WhileSettings({ data, onChange }: NodeSettingsProps) {
  return <div className="space-y-4"><IfElseSettings loop data={{...data,ifCondition:data.condition}} onChange={updates=>{const {ifCondition,...rest}=updates;onChange({...rest,...(ifCondition!==undefined?{condition:ifCondition}:{})});}} /><NodeField label="Maximum iterations (1–20)" value={data.maxIterations ?? 3} onChange={(value) => onChange({ maxIterations: Math.max(1, Math.min(20, Math.floor(Number(value) || 1))) })} /><p className="text-xs leading-5 text-slate-500">A match enters Body. Connect the last body step back to While. Done runs when the condition is false. Reaching the iteration limit stops with an error; every run also has a 24-step budget.</p></div>;
}
