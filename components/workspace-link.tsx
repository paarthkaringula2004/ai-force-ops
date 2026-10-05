"use client";

import { useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WorkspaceTransition, { type WorkspaceDestination } from "./workspace-transition";

export default function WorkspaceLink({ href, destination, children, className, title }: {
  href: string;
  destination: WorkspaceDestination;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const router = useRouter();
  const [pending, startNavigation] = useTransition();

  return <>
    <Link href={href} className={className} title={title} aria-busy={pending} onNavigate={(event) => {
      event.preventDefault();
      if (!pending) startNavigation(() => router.push(href));
    }}>{children}</Link>
    {pending && createPortal(<WorkspaceTransition destination={destination} />, document.body)}
  </>;
}
