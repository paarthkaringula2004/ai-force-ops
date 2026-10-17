import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/request-session";
import EAssistWorkspace from "./workspace";
export const metadata = {
    title: "eAssist | AIForce.Ops",
    description: "Alerts, incidents, and automation operations.",
};
export default async function EAssistPage() {
    const session = await getCurrentSession();
    if (!session?.user) redirect("/");
    if (!permitted(await workspaceAccess(session.user.id), "admin"))
        redirect("/service-review-center");
    return (
        <EAssistWorkspace
            userName={session.user.name || session.user.email}
            userId={session.user.id}
        />
    );
}
