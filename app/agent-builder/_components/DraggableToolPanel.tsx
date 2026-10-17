"use client";

import { useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

export default function DraggableToolPanel({
    title,
    action,
    children,
    footer,
}: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
}) {
    const panel = useRef<HTMLElement>(null);
    // Palette positions are temporary UI state, separate from the saved workflow.
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [moving, setMoving] = useState(false);
    const drag = useRef<{
        pointerId: number;
        x: number;
        y: number;
        origin: { x: number; y: number };
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    } | null>(null);

    return (
        <section
            ref={panel}
            aria-label={title}
            style={{
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                zIndex: moving ? 40 : 10,
            }}
            className="nodrag nopan nowheel relative flex h-[212px] max-h-[calc(100dvh-130px)] w-[236px] shrink-0 flex-col rounded-[18px] border border-gray-100 bg-white p-4 shadow-sm"
        >
            <header className="mb-3 flex shrink-0 items-center justify-between gap-1">
                <h2 className="min-w-0 font-semibold text-gray-700">
                    <button
                        type="button"
                        aria-label={`Move ${title} panel`}
                        title="Drag to move"
                        className="flex touch-none select-none items-center gap-1.5 text-left cursor-grab active:cursor-grabbing focus-visible:outline-indigo-400"
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            const rect = panel.current?.getBoundingClientRect();
                            const canvas = panel.current
                                ?.closest(".react-flow")
                                ?.getBoundingClientRect();
                            if (!rect || !canvas) return;
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            drag.current = {
                                pointerId: event.pointerId,
                                x: event.clientX,
                                y: event.clientY,
                                origin: offset,
                                minX: canvas.left - rect.left,
                                maxX: canvas.right - rect.right,
                                minY: canvas.top - rect.top,
                                maxY: canvas.bottom - rect.bottom,
                            };
                            setMoving(true);
                        }}
                        onPointerMove={(event) => {
                            const current = drag.current;
                            if (!current || current.pointerId !== event.pointerId) return;
                            event.stopPropagation();
                            setOffset({
                                x:
                                    current.origin.x +
                                    Math.max(
                                        current.minX,
                                        Math.min(current.maxX, event.clientX - current.x),
                                    ),
                                y:
                                    current.origin.y +
                                    Math.max(
                                        current.minY,
                                        Math.min(current.maxY, event.clientY - current.y),
                                    ),
                            });
                        }}
                        onPointerUp={(event) => {
                            if (drag.current?.pointerId === event.pointerId) {
                                drag.current = null;
                                setMoving(false);
                                event.currentTarget.releasePointerCapture(event.pointerId);
                            }
                        }}
                        onPointerCancel={() => {
                            drag.current = null;
                            setMoving(false);
                        }}
                        onLostPointerCapture={() => {
                            drag.current = null;
                            setMoving(false);
                        }}
                    >
                        <GripVertical className="size-3.5 shrink-0 text-gray-400" />
                        <span>{title}</span>
                    </button>
                </h2>
                {action}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
            {footer}
        </section>
    );
}
