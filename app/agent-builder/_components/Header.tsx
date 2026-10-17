"use client";

import { ArrowLeft, Code2, Save, Lock, Unlock, ExternalLink, Upload } from "lucide-react";

export default function Header({
    name,
    onBack,
    onCode,
    onLaunch,
    onPublish,
    onSave,
    saved,
    loading,
    autosave,
    onAutosaveChange,
    locked,
    onLock,
}: {
    name: string;
    onBack: () => void;
    onCode: () => void;
    onLaunch: () => void;
    onPublish: () => void;
    onSave: () => void;
    locked: boolean;
    onLock: () => void;
    saved: boolean;
    loading: boolean;
    autosave: boolean;
    onAutosaveChange: (enabled: boolean) => void;
}) {
    return (
        <header className="font-sans relative z-20 flex min-h-16 flex-wrap gap-2 py-2 shrink-0 items-center justify-between border-b border-[#e7e9ed] bg-white px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
                <button
                    type="button"
                    aria-label="Back to agents"
                    onClick={onBack}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#475467] hover:bg-[#f3f4f7]"
                >
                    <ArrowLeft className="size-5" />
                </button>
                <div className="min-w-0">
                    <h1 className="truncate text-[15px] font-semibold text-[#172033] sm:text-[17px]">
                        {name}
                    </h1>
                    <p className="hidden text-[10px] text-[#8992a2] sm:block">
                        Workflow builder · Draft
                    </p>
                </div>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="mr-1 hidden items-center gap-1.5 text-[10px] text-[#858e9d] lg:inline-flex">
                    <span
                        className={`size-1.5 rounded-full ${loading ? "bg-indigo-400" : saved ? "bg-emerald-500" : "bg-amber-400"}`}
                    />
                    {loading
                        ? "Loading from PostgreSQL"
                        : saved
                          ? "Saved to PostgreSQL"
                          : autosave
                            ? "Autosave pending"
                            : "Unsaved changes"}
                </span>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-medium text-[#596477]">
                    <span>Autosave</span>
                    <input
                        type="checkbox"
                        role="switch"
                        checked={autosave}
                        onChange={(event) => onAutosaveChange(event.currentTarget.checked)}
                        className="peer sr-only"
                    />
                    <span
                        aria-hidden="true"
                        className={`relative h-[18px] w-8 rounded-full transition ${autosave ? "bg-[#6255e8]" : "bg-[#c9ced8]"}`}
                    >
                        <span
                            className={`absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition ${autosave ? "left-[17px]" : "left-[3px]"}`}
                        />
                    </span>
                    <span className="sr-only">Autosave {autosave ? "on" : "off"}</span>
                </label>
                <button
                    type="button"
                    onClick={onLock}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dfe2e9] px-3 text-[11px] font-semibold text-slate-600"
                >
                    {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                    <span>{locked ? "Unlock" : "Lock"}</span>
                </button>
                <button
                    type="button"
                    onClick={onCode}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-[#344054] hover:bg-[#f3f4f7]"
                >
                    <Code2 className="size-4" />
                    <span className="hidden sm:inline">Code</span>
                </button>
                <button
                    type="button"
                    onClick={onLaunch}
                    disabled={loading}
                    className="inline-flex h-9 items-center rounded-lg bg-[#171923] px-3 text-[11px] font-semibold text-white hover:bg-[#302e48] disabled:opacity-50"
                >
                    <ExternalLink className="mr-1 size-4" />
                    Launch
                </button>
                <button
                    type="button"
                    onClick={onPublish}
                    disabled={loading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#6255e8] px-3 text-[11px] font-semibold text-white hover:bg-[#5145cf] disabled:opacity-50"
                >
                    <Upload className="size-4" />
                    Publish
                </button>
                {!autosave && (
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={loading || saved}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dfe2e9] bg-white px-3 text-[11px] font-semibold text-[#344054] transition hover:border-indigo-200 hover:bg-[#f8f7ff] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                        <Save className="size-4" />
                        <span className="hidden sm:inline">Save</span>
                    </button>
                )}
            </div>
        </header>
    );
}
