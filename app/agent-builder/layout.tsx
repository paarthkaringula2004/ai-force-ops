import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/request-session";

export default async function AgentBuilderLayout({ children }: { children: ReactNode }) {
  if (!(await getCurrentSession())?.user) redirect("/sign-in");
  return children;
}
