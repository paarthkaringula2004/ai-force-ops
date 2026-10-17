"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Download, Eye, LoaderCircle, X } from "lucide-react";
import { attachmentSize, type AttachmentMetadata } from "@/lib/mail-attachment-types";

function placement(rect: DOMRect) {
    const width = Math.min(460, window.innerWidth - 32),
        above = rect.top - 16,
        below = window.innerHeight - rect.bottom - 16,
        flip = below < 410 && above > below;
    const height = Math.min(410, Math.max(100, (flip ? above : below) - 8));
    return {
        left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
        top: flip ? rect.top - height - 8 : rect.bottom + 8,
        width,
        height,
    };
}
type Content = {
    url: string;
    kind: "image" | "pdf" | "text" | "video" | "audio" | "other";
    text?: string;
};
export default function AttachmentPreview({ file }: { file: AttachmentMetadata }) {
    const suppressFocus = useRef(false);
    const id = useId(),
        trigger = useRef<HTMLButtonElement>(null),
        panel = useRef<HTMLDivElement>(null),
        timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [open, setOpen] = useState(false),
        [pinned, setPinned] = useState(false),
        [position, setPosition] = useState({ left: 0, top: 0, width: 460, height: 410 });
    const [content, setContent] = useState<Content | null>(null),
        [error, setError] = useState("");
    const download = "/api/workspace/admin/mail/attachments?id=" + file.id;
    function clearTimer() {
        if (timer.current) clearTimeout(timer.current);
    }
    function show() {
        clearTimer();
        const rect = trigger.current?.getBoundingClientRect();
        if (rect) setPosition(placement(rect));
        setOpen(true);
    }
    function leave() {
        clearTimer();
        if (!pinned) timer.current = setTimeout(() => setOpen(false), 200);
    }
    function close() {
        clearTimer();
        setOpen(false);
        setPinned(false);
        suppressFocus.current = true;
        trigger.current?.focus({ preventScroll: true });
        suppressFocus.current = false;
    }
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    useEffect(() => {
        if (!open) return;
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                setPinned(false);
                suppressFocus.current = true;
                trigger.current?.focus({ preventScroll: true });
                suppressFocus.current = false;
            }
        };
        const outside = (event: PointerEvent) => {
            if (
                !panel.current?.contains(event.target as Node) &&
                !trigger.current?.contains(event.target as Node)
            ) {
                setOpen(false);
                setPinned(false);
            }
        };
        const reposition = () => {
            const rect = trigger.current?.getBoundingClientRect();
            if (!rect) return;
            setPosition(placement(rect));
        };
        document.addEventListener("keydown", escape);
        document.addEventListener("pointerdown", outside);
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        return () => {
            document.removeEventListener("keydown", escape);
            document.removeEventListener("pointerdown", outside);
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [open]);
    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        let url = "";
        fetch(download, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error("Could not load this file preview.");
                const blob = await response.blob(),
                    mime = file.contentType.toLowerCase();
                const kind: Content["kind"] = mime.startsWith("image/")
                    ? "image"
                    : mime === "application/pdf"
                      ? "pdf"
                      : mime.startsWith("video/")
                        ? "video"
                        : mime.startsWith("audio/")
                          ? "audio"
                          : mime.startsWith("text/") ||
                              ["application/json", "application/xml"].includes(mime)
                            ? "text"
                            : "other";
                const text = kind === "text" ? await blob.slice(0, 100000).text() : undefined;
                if (controller.signal.aborted) return;
                url = URL.createObjectURL(blob);
                setContent({ url, kind, text });
                setError("");
            })
            .catch((e) => {
                if (!controller.signal.aborted)
                    setError(e instanceof Error ? e.message : "Could not load preview.");
            });
        return () => {
            controller.abort();
            if (url) URL.revokeObjectURL(url);
            setContent(null);
            setError("");
        };
    }, [open, download, file.contentType]);
    return (
        <>
            <button
                ref={trigger}
                type="button"
                aria-label={"Preview " + file.filename}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                title="Preview file"
                className="rounded-md p-1.5 text-[#6255e8] hover:bg-[#efecff] focus-visible:outline-2 focus-visible:outline-[#6255e8]"
                onMouseEnter={show}
                onMouseLeave={leave}
                onFocus={() => {
                    if (!suppressFocus.current) show();
                }}
                onBlur={leave}
                onClick={() => {
                    show();
                    setPinned(true);
                }}
            >
                <Eye className="size-4" />
            </button>
            {open &&
                createPortal(
                    <div
                        id={id}
                        ref={panel}
                        role="dialog"
                        aria-label={"File preview: " + file.filename}
                        onMouseEnter={clearTimer}
                        onMouseLeave={leave}
                        onFocusCapture={clearTimer}
                        className="overflow-hidden rounded-2xl border border-[#ded5f2] bg-[#fbf9ff] text-[#263247] shadow-[0_16px_60px_#24183f30]"
                        style={{
                            position: "fixed",
                            zIndex: 300,
                            left: position.left,
                            top: position.top,
                            width: position.width,
                            maxHeight: position.height,
                        }}
                    >
                        <header className="flex items-center gap-3 border-b border-[#e5def3] bg-white px-4 py-3">
                            <Eye className="size-4 shrink-0 text-[#7446b8]" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold" title={file.filename}>
                                    {file.filename}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {attachmentSize(file.size)}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="Close file preview"
                                onClick={close}
                                className="rounded-lg p-1 text-slate-500 hover:bg-[#efecff]"
                            >
                                <X className="size-4" />
                            </button>
                        </header>
                        <div
                            className="flex items-center justify-center overflow-auto p-3"
                            style={{ height: Math.max(60, position.height - 110) }}
                        >
                            {error ? (
                                <p role="alert" className="p-5 text-sm text-rose-600">
                                    {error}
                                </p>
                            ) : !content ? (
                                <div
                                    role="status"
                                    className="flex items-center gap-2 text-sm text-slate-500"
                                >
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Loading preview…
                                </div>
                            ) : content.kind === "image" ? (
                                <Image
                                    unoptimized
                                    src={content.url}
                                    width={440}
                                    height={280}
                                    alt={"Preview of " + file.filename}
                                    className="max-h-full max-w-full rounded-lg object-contain"
                                />
                            ) : content.kind === "pdf" ? (
                                <iframe
                                    title={"PDF preview: " + file.filename}
                                    src={content.url}
                                    className="h-full w-full rounded-lg border-0"
                                />
                            ) : content.kind === "text" ? (
                                <pre className="h-full w-full whitespace-pre-wrap break-words text-xs leading-5">
                                    {content.text}
                                    {file.size > 100000
                                        ? "\n\nShowing the first 100 KB. Download to read the full file."
                                        : ""}
                                </pre>
                            ) : content.kind === "video" ? (
                                <video
                                    src={content.url}
                                    controls
                                    className="max-h-full max-w-full"
                                />
                            ) : content.kind === "audio" ? (
                                <audio src={content.url} controls className="w-full" />
                            ) : (
                                <div className="p-5 text-center text-sm text-slate-500">
                                    <p>This format does not have an in-browser preview.</p>
                                    <p className="mt-2">
                                        Download the file to open it in its application.
                                    </p>
                                </div>
                            )}
                        </div>
                        <footer className="flex items-center justify-between gap-3 border-t border-[#e5def3] bg-white px-4 py-3">
                            <span className="text-[11px] text-slate-500">
                                {pinned
                                    ? "Click outside or press Esc to close"
                                    : "Click the eye to keep this preview open"}
                            </span>
                            <a
                                href={download}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7446b8]"
                            >
                                <Download className="size-3.5" />
                                Download
                            </a>
                        </footer>
                    </div>,
                    document.body,
                )}
        </>
    );
}
