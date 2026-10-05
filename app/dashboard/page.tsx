import type { Metadata } from "next";
import AgentStudio from "./_components/AgentStudio";

export const metadata: Metadata = {
  title: "Agent Studio",
  description: "AIForce.Ops Agent Studio interface preview.",
};

export default function DashboardPage() {
  return <AgentStudio />;
}
