import type { Metadata } from "next";
import AgentStudio from "../_components/AgentStudio";

export const metadata: Metadata = {
  title: "Agents",
  description: "Create and configure AIForce.Ops agent drafts.",
};

export default function AgentsPage() {
  return <AgentStudio initialSection="Agents" />;
}
