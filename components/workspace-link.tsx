"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { type WorkspaceDestination } from "./workspace-transition";

export default function WorkspaceLink({
    href,
    children,
    className,
    title,
}: {
    href: string;
    destination: WorkspaceDestination;
    children: ReactNode;
    className?: string;
    title?: string;
}) {
    // Let the route's loading boundary own pending UI. A second portal overlay
    // can outlive the navigation and obscure a destination that already loaded.
    return (
        <Link href={href} prefetch className={className} title={title}>
            {children}
        </Link>
    );
}
