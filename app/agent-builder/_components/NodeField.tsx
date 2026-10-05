import type { ReactNode } from "react";

export function NodeField({ label, value, onChange, placeholder, multiline = false, children }: {
  label: string;
  value?: string | number;
  onChange?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  children?: ReactNode;
}) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-[#5d6676]">{label}</span>{children ?? (multiline
    ? <textarea value={String(value ?? "")} onChange={(event) => onChange?.(event.currentTarget.value)} placeholder={placeholder} rows={4} className="w-full resize-y rounded-lg border border-[#e4e7ee] bg-white px-3 py-2.5 text-[11px] leading-5 text-[#374151] outline-none placeholder:text-[#a0a7b3] focus:border-indigo-300 focus:ring-3 focus:ring-indigo-500/10" />
    : <input type={typeof value === "number" ? "number" : "text"} value={value ?? ""} onChange={(event) => onChange?.(event.currentTarget.value)} placeholder={placeholder} className="h-9 w-full rounded-lg border border-[#e4e7ee] bg-white px-3 text-[11px] text-[#374151] outline-none placeholder:text-[#a0a7b3] focus:border-indigo-300 focus:ring-3 focus:ring-indigo-500/10" />)}</label>;
}
