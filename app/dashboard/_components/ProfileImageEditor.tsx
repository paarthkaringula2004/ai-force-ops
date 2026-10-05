"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { ImagePlus, LoaderCircle, Move, RotateCcw, Upload, X, ZoomIn } from "lucide-react";

type MediaKind = "photo" | "banner";
const outputSize: Record<MediaKind, { width: number; height: number }> = {
  photo: { width: 512, height: 512 },
  banner: { width: 1600, height: 520 },
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export function ProfileImageEditor({ name, photo, banner, onPhotoChange, onBannerChange }: {
  name: string;
  photo: string;
  banner: string;
  onPhotoChange: (value: string) => void;
  onBannerChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState<MediaKind | null>(null);
  const [source, setSource] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [frameWidth, setFrameWidth] = useState(420);
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const frame = editing ? outputSize[editing] : outputSize.photo;
  const frameHeight = frameWidth * frame.height / frame.width;
  const baseScale = imageSize.width && imageSize.height ? Math.max(frameWidth / imageSize.width, frameHeight / imageSize.height) : 1;
  const shownWidth = imageSize.width * baseScale * zoom;
  const shownHeight = imageSize.height * baseScale * zoom;

  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape" && !busy) setEditing(null); }
    window.addEventListener("keydown", closeOnEscape);
    const frameElement = frameRef.current;
    if (frameElement) {
      const measure = () => setFrameWidth(frameElement.clientWidth);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(frameElement);
      return () => { observer.disconnect(); window.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
    }
    return () => { window.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [editing, busy]);

  useEffect(() => {
    if (!editing) return;
    function finishDrag() { setDragging(false); }
    window.addEventListener("pointerup", finishDrag);
    return () => window.removeEventListener("pointerup", finishDrag);
  }, [editing]);

  function openEditor(kind: MediaKind) {
    setEditing(kind);
    setSource(kind === "photo" ? photo : banner);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
  }

  function selectFile(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("Choose a JPG, PNG, or WebP image."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Choose an image smaller than 10 MB."); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        setSource(String(reader.result));
        setImageSize({ width, height });
        setZoom(1);
        const scale = Math.max(frameWidth / width, frameHeight / height);
        setOffset({ x: (frameWidth - width * scale) / 2, y: (frameHeight - height * scale) / 2 });
      };
      image.onerror = () => setError("This image could not be opened. Choose a different file.");
      image.src = String(reader.result);
    };
    reader.onerror = () => setError("This image could not be read.");
    reader.readAsDataURL(file);
  }

  function loadedImage(image: HTMLImageElement) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    setImageSize({ width, height });
    const scale = Math.max(frameWidth / width, frameHeight / height) * zoom;
    setOffset((current) => current.x === 0 && current.y === 0
      ? { x: (frameWidth - width * scale) / 2, y: (frameHeight - height * scale) / 2 }
      : current);
  }

  function applyCrop() {
    if (!source || !frameRef.current || !editing) return;
    setBusy(true);
    setError("");
    const image = new Image();
    image.onload = () => {
      const width = outputSize[editing].width;
      const height = outputSize[editing].height;
      const scale = width / frameRef.current!.clientWidth;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) { setBusy(false); setError("Your browser could not prepare this image."); return; }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, offset.x * scale, offset.y * scale, shownWidth * scale, shownHeight * scale);
      const result = canvas.toDataURL("image/jpeg", 0.86);
      if (result.length > 1_250_000) { setBusy(false); setError("This image is too detailed to save. Choose a smaller or simpler image."); return; }
      if (editing === "photo") onPhotoChange(result); else onBannerChange(result);
      setEditing(null);
      setBusy(false);
    };
    image.onerror = () => { setBusy(false); setError("This image could not be prepared."); };
    image.src = source;
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !frameRef.current) return;
    const bounds = frameRef.current.getBoundingClientRect();
    const nextX = event.clientX - dragStart.x - bounds.left;
    const nextY = event.clientY - dragStart.y - bounds.top;
    setOffset({ x: Math.min(0, Math.max(frameWidth - shownWidth, nextX)), y: Math.min(0, Math.max(frameHeight - shownHeight, nextY)) });
  }

  return <>
    <section className="overflow-hidden rounded-2xl border border-[#e7e9ef] bg-white shadow-[0_4px_18px_rgba(25,39,70,.035)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f3] px-5 py-4"><div><h2 className="text-[14px] font-semibold text-[#283144]">Profile appearance</h2><p className="mt-1 text-[10px] text-[#8992a2]">Personalize the profile your team sees across AIForce.Ops.</p></div><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[9px] font-medium text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" />Your workspace identity</span></div>
      <div className="p-4 sm:p-5">
        <div className="relative h-36 overflow-hidden rounded-xl bg-gradient-to-br from-[#252346] via-[#5147a8] to-[#8876e7] sm:h-44">
          {banner && <NextImage src={banner} alt="Profile banner" width={1600} height={520} unoptimized className="size-full object-cover" />}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141629]/45 via-transparent to-white/5" />
          <div className="absolute right-3 top-3 flex gap-2"><button type="button" onClick={() => openEditor("banner")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/25 bg-[#171923]/55 px-2.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur transition hover:bg-[#171923]/75"><ImagePlus className="size-3.5" />{banner ? "Edit banner" : "Add banner"}</button>{banner && <button type="button" aria-label="Remove banner" title="Remove banner" onClick={onBannerChange.bind(null, "")} className="flex size-8 items-center justify-center rounded-lg border border-white/25 bg-[#171923]/55 text-white backdrop-blur hover:bg-rose-600"><X className="size-3.5" /></button>}</div>
          <div className="absolute bottom-3 left-4 flex items-end gap-3 sm:bottom-4 sm:left-5"><button type="button" onClick={() => openEditor("photo")} aria-label="Edit profile photo" title="Edit profile photo" className="relative flex size-[68px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-[3px] border-white bg-gradient-to-br from-[#ddd9ff] to-[#bcb3ff] p-0 text-[19px] font-semibold text-[#554bd1] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#5147a8] sm:size-[78px]">{photo ? <NextImage src={photo} alt="Profile photo" width={512} height={512} unoptimized className="size-full object-cover" /> : initials(name)}</button><div className="pb-1 text-white drop-shadow"><p className="text-[13px] font-semibold">{name || "Your name"}</p><p className="mt-0.5 text-[9px] text-white/75">AIForce.Ops workspace profile</p></div></div>
        </div>
        <p className="mt-3 text-[9px] leading-4 text-[#9aa1ac]">Images are optimized and saved to your account. Maximum upload size: 10 MB.</p>
      </div>
    </section>
    {editing && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#111827]/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="media-editor-title" className="my-auto w-full max-w-[760px] overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_30px_100px_rgba(10,15,30,.35)]"><header className="flex items-start justify-between border-b border-[#eef0f3] px-5 py-4"><div><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#6255e8]">Profile studio</p><h2 id="media-editor-title" className="mt-1 text-[17px] font-semibold tracking-[-.02em] text-[#283144]">Edit {editing === "photo" ? "profile photo" : "banner"}</h2><p className="mt-1 text-[10px] text-[#8992a2]">Position and zoom your image to create a clean, balanced crop.</p></div><button type="button" aria-label="Close editor" disabled={busy} onClick={() => setEditing(null)} className="flex size-8 items-center justify-center rounded-lg text-[#7b8493] hover:bg-[#f4f5f8]"><X className="size-4" /></button></header>
      <div className="p-4 sm:p-5"><div ref={frameRef} onPointerDown={(event) => { if (!source) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); setDragStart({ x: event.clientX - offset.x - frameRef.current!.getBoundingClientRect().left, y: event.clientY - offset.y - frameRef.current!.getBoundingClientRect().top }); }} onPointerMove={move} className={`relative mx-auto overflow-hidden rounded-xl bg-[#eceef3] ${editing === "photo" ? "aspect-square w-full max-w-[420px]" : "aspect-[3.077/1] w-full"} ${source ? "cursor-grab active:cursor-grabbing" : ""}`}>
        {source ? <NextImage src={source} alt="Image crop preview" width={Math.max(1, Math.round(shownWidth))} height={Math.max(1, Math.round(shownHeight))} unoptimized draggable={false} onLoad={(event) => loadedImage(event.currentTarget)} className="pointer-events-none absolute max-w-none select-none" style={{ width: shownWidth, height: shownHeight, left: offset.x, top: offset.y }} /> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#8992a2]"><ImagePlus className="size-7 text-[#8278df]" /><span className="text-[11px] font-medium">Choose an image to get started</span><span className="text-[9px]">Drag to position it inside the frame</span></div>}
        <div className="pointer-events-none absolute inset-0 border border-black/10" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe2e9] px-3 text-[10px] font-semibold text-[#424d61] transition hover:bg-[#fafbfc]"><Upload className="size-3.5" />{source ? "Replace image" : "Choose image"}</button><button type="button" disabled={!source} onClick={() => setOffset({ x: (frameWidth - shownWidth) / 2, y: (frameHeight - shownHeight) / 2 })} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[10px] font-medium text-[#737d8d] hover:bg-[#f7f8fa] disabled:opacity-40"><RotateCcw className="size-3" />Center</button><div className="ml-auto flex min-w-[170px] flex-1 items-center gap-2 sm:max-w-[250px]"><ZoomIn className="size-3.5 shrink-0 text-[#7f8898]" /><input aria-label="Image zoom" type="range" min="1" max="3" step="0.01" value={zoom} disabled={!source} onChange={(event) => { const nextZoom = Number(event.currentTarget.value); const ratio = nextZoom / zoom; setOffset((current) => ({ x: frameWidth / 2 - (frameWidth / 2 - current.x) * ratio, y: frameHeight / 2 - (frameHeight / 2 - current.y) * ratio })); setZoom(nextZoom); }} className="w-full accent-[#6255e8]" /><span className="w-9 text-right text-[9px] tabular-nums text-[#8992a2]">{Math.round(zoom * 100)}%</span></div></div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /><p className="mt-2 flex items-center gap-1.5 text-[9px] text-[#9aa1ac]"><Move className="size-3" />Drag image to reposition · Use the slider to zoom in or out</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] text-rose-700">{error}</p>}
      <footer className="mt-5 flex justify-end gap-2 border-t border-[#eef0f3] pt-4"><button type="button" disabled={busy} onClick={() => setEditing(null)} className="h-9 rounded-lg border border-[#dfe2e9] px-4 text-[10px] font-semibold text-[#626d7e] hover:bg-[#fafbfc]">Cancel</button><button type="button" disabled={busy || !source} onClick={applyCrop} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#6255e8] px-4 text-[10px] font-semibold text-white transition hover:bg-[#5146d2] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}Apply crop</button></footer>
      </div></section></div>}
  </>;
}
