"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Drag = { id: string; x: number; y: number; target: string | null };
type Session = Drag & { startX: number; startY: number; active: boolean; pointerId: number; handle: HTMLButtonElement; scroll: HTMLElement; previousSelection: string; previousCursor: string };

export function useAgentCardDrag(disabled: boolean, onDrop: (source: string, target: string) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const session = useRef<Session | null>(null);
  const frame = useRef(0);

  function targetAt(x: number, y: number) {
    return document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-agent-id]")?.dataset.agentId ?? null;
  }
  function finish(commit: boolean) {
    const current = session.current;
    session.current = null;
    cancelAnimationFrame(frame.current);
    if (!current) return;
    document.body.style.userSelect = current.previousSelection;
    document.body.style.cursor = current.previousCursor;
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    setDrag(null);
    const target = targetAt(current.x, current.y);
    if (commit && current.active && target && target !== current.id) onDrop(current.id, target);
  }
  function scrollFrame() {
    const current = session.current;
    if (!current) return;
    if (current.active) {
      const bounds = current.scroll.getBoundingClientRect();
      const speed = current.y < bounds.top + 48 ? -14 : current.y > bounds.bottom - 48 ? 14 : 0;
      if (speed) {
        current.scroll.scrollTop += speed;
        current.target = targetAt(current.x, current.y);
        setDrag({ id: current.id, x: current.x, y: current.y, target: current.target });
      }
    }
    frame.current = requestAnimationFrame(scrollFrame);
  }
  function start(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (disabled || event.button !== 0 || session.current) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.focus({ preventScroll: true });
    let scroll: HTMLElement = handle;
    while (scroll.parentElement && !(scroll.scrollHeight > scroll.clientHeight && /auto|scroll/.test(getComputedStyle(scroll).overflowY))) scroll = scroll.parentElement;
    session.current = { id, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, active: false, pointerId: event.pointerId, handle, scroll, target: id, previousSelection: document.body.style.userSelect, previousCursor: document.body.style.cursor };
    handle.setPointerCapture(event.pointerId);
    frame.current = requestAnimationFrame(scrollFrame);
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = session.current;
    if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.active && Math.hypot(current.x-current.startX, current.y-current.startY) < 8) return;
    current.active = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    window.getSelection()?.removeAllRanges();
    current.target = targetAt(current.x, current.y);
    setDrag({ id: current.id, x: current.x, y: current.y, target: current.target });
  }
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") finish(false); };
    window.addEventListener("keydown", cancel);
    return () => { window.removeEventListener("keydown", cancel); finish(false); };
    // Cleanup reads only the active session; committing is handled by pointer-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { drag, start, move, finish };
}
