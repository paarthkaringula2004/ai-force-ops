import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/request-session";
import ServiceReviewCenter from "./service-review-center";

export const metadata: Metadata = { title: "Service Review Center", description: "AIForce.Ops service health and value dashboards." };

export default async function ServiceReviewCenterPage() {
  if (!(await getCurrentSession())?.user) redirect("/");
  return <ServiceReviewCenter />;
}
