"use client";
import { useEffect, useState } from "react";
import { Bot, Command, Layers3, LoaderCircle, Sparkles } from "lucide-react";
import { claimNavigationRecovery } from "@/lib/workspace-navigation-recovery";

export type WorkspaceDestination = "eAssist" | "ePACE" | "Review Center" | "Agent Studio";

export default function WorkspaceTransition({
    destination,
    href,
}: {
    destination: WorkspaceDestination;
    href?: string;
}) {
    const [slow, setSlow] = useState(false);
    const [failed, setFailed] = useState(false);
    const defaultHref = {
        eAssist: "/service-review-center/eassist",
        ePACE: "/service-review-center/epace",
        "Review Center": "/service-review-center",
        "Agent Studio": "/dashboard",
    }[destination];
    const [recovery, setRecovery] = useState(href || defaultHref);
    useEffect(() => {
        const path = window.location.pathname;
        const target =
            href ||
            (path === defaultHref || path.startsWith(defaultHref + "/")
                ? path + window.location.search
                : defaultHref);
        const slowTimer = setTimeout(() => {
            setSlow(true);
            setRecovery(target);
        }, 10000);
        const retryTimer = setTimeout(() => {
            try {
                if (claimNavigationRecovery(window.sessionStorage, target)) {
                    window.location.replace(target);
                    return;
                }
            } catch {
                /* Storage can be unavailable in private browser sessions. */
            }
            setFailed(true);
        }, 30000);
        return () => {
            clearTimeout(slowTimer);
            clearTimeout(retryTimer);
        };
    }, [href, defaultHref]);
    const Icon = {
        eAssist: Bot,
        ePACE: Sparkles,
        "Review Center": Layers3,
        "Agent Studio": Command,
    }[destination];

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50/95 px-6 backdrop-blur-md"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            <div className="w-full max-w-sm rounded-3xl border border-indigo-100 bg-white p-10 text-center shadow-[0_24px_80px_rgba(45,64,115,.12)]">
                <div className="relative mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-200">
                    <span
                        aria-hidden="true"
                        className="absolute -inset-2 rounded-[2rem] border border-indigo-200 motion-safe:animate-pulse"
                    />
                    <Icon aria-hidden="true" className="size-9" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                    {failed ? `Couldn't open ${destination}` : `Opening ${destination}…`}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                    {failed
                        ? "The connection did not finish. Try opening the page again."
                        : slow
                          ? "This is taking longer than expected. Reconnecting if needed…"
                          : "Preparing your workspace"}
                </p>
                {!failed && (
                    <LoaderCircle
                        aria-hidden="true"
                        className="mx-auto mt-6 size-5 text-indigo-600 motion-safe:animate-spin"
                    />
                )}
                {slow && (
                    <a
                        href={recovery}
                        className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white"
                    >
                        Open {destination}
                    </a>
                )}
            </div>
        </div>
    );
}
