import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/request-session";
import ServiceReviewCenter from "./service-review-center";

export const metadata: Metadata = { title: "Service Review Center", description: "AIForce.Ops service health and value dashboards." };

export default async function ServiceReviewCenterPage({searchParams}:PageProps<'/service-review-center'>) {
  if (!(await getCurrentSession())?.user) redirect("/");
  const query=await searchParams;
  const views=['services','value','observability','geo','aiops','executive','details','sources'] as const;
  const view=views.find(view=>view===query.view)||'services';
  return <ServiceReviewCenter initialView={view} />;
}
