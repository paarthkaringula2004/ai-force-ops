import { notFound } from "next/navigation";
import AgentStudio from "../_components/AgentStudio";

const sections: Record<
    string,
    | "My Customization"
    | "My Requests"
    | "Team Requests"
    | "Administration"
    | "Tool Library"
    | "Knowledge Management"
    | "General Instructions"
    | "Models"
    | "Settings"
    | "Usage"
    | "Token Calculator"
    | "Payments"
> = {
    "my-requests": "My Requests",
    "team-requests": "Team Requests",
    administration: "Administration",
    "my-customization": "My Customization",
    tools: "Tool Library",
    "tool-library": "Tool Library",
    "knowledge-management": "Knowledge Management",
    "general-instructions": "General Instructions",
    models: "Models",
    settings: "Settings",
    usage: "Usage",
    "token-calculator": "Token Calculator",
    payments: "Payments",
};

export default async function WorkspaceSectionPage({ params }: PageProps<"/dashboard/[section]">) {
    const { section } = await params;
    const initialSection = sections[section];
    if (!initialSection) notFound();
    return <AgentStudio initialSection={initialSection} />;
}
