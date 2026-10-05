import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/request-session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!(await getCurrentSession())?.user) redirect("/");
  return children;
}
