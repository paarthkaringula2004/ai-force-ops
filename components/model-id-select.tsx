"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import ThemedSelect from "@/components/themed-select";

type Props = {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

export default function ModelIdSelect({ value, onChange, compact = false }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/playground/models", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load available OpenAI models.");
        if (controller.signal.aborted) return;
        setModels(Array.isArray(data.models) ? data.models.filter((item: unknown): item is string => typeof item === "string") : []);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load model IDs.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  const select = <ThemedSelect
    aria-label="Model ID"
    aria-describedby="model-id-status"
    aria-invalid={!value || (!!value && !models.includes(value))}
    value={value || ""}
    onChange={(event) => onChange(event.currentTarget.value)}
    disabled={loading || models.length === 0}
    required
    className={`${compact ? "h-9 min-w-[170px]" : "h-11 w-full"} rounded-lg border border-[#dfe2e8] bg-white px-3.5 text-[12px] text-[#515b6c] outline-none focus:border-[#a9a2f2]`}
  >
    <option value="">{loading ? "Loading available models…" : "Choose an OpenAI text-chat model"}</option>
    {value && !models.includes(value) && <option value={value} disabled>Previously selected model is unavailable</option>}
    {models.map((model, index) => <option key={model} value={model}>{index + 1}. {model}</option>)}
  </ThemedSelect>;

  if (compact) {
    return <div className="min-w-0">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-[#202331]">Model ID <span className="text-rose-500">*</span></span>
        {select}
      </label>
      <p id="model-id-status" role={error ? "alert" : undefined} className={`mt-1 text-[10px] ${error ? "text-rose-600" : "text-[#8992a2]"}`}>
        {error || (!loading && models.length === 0 ? "No models are available for this account." : "Choose a model available to this account.")}
        {error && <button type="button" onClick={() => { setLoading(true); setError(""); setReload((current) => current + 1); }} className="ml-2 inline-flex items-center gap-1 text-indigo-600 hover:underline"><RotateCcw className="size-3" />Retry</button>}
      </p>
    </div>;
  }

  return <div>
    <label className="block">
      <span className="mb-2 block text-[12px] font-medium text-[#465064]">Model ID <span className="text-[#df6b6b]">*</span></span>
      {select}
    </label>
    <p id="model-id-status" role={error ? "alert" : undefined} className={`mt-2 flex min-h-4 items-center text-[10px] ${error ? "text-rose-600" : "text-[#8992a2]"}`}>
      {error || (loading ? "Loading models available to this account…" : models.length ? "Choose from the text-chat models available to this account." : "No text-chat models are available for this account.")}
      {error && <button type="button" onClick={() => { setLoading(true); setError(""); setReload((current) => current + 1); }} className="ml-2 inline-flex items-center gap-1 text-indigo-600 hover:underline"><RotateCcw className="size-3" />Retry</button>}
    </p>
  </div>;
}
