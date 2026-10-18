import { db } from "@/lib/db";

import { getRequestSession } from "@/lib/request-session";

import { builtinTools } from "@/lib/builtin-project-tool-settings";

import { workspaceAccess } from "@/lib/workspace-access";

import { permitted } from "@/lib/workspace-permissions";
import { listProviders } from "@/lib/integrations/registry";
import { integrationPurpose } from "@/lib/integrations/catalog";
import { projectBindings, bindingTool } from "@/lib/integrations/project-tools";

export async function GET(request: Request) {
    const session = await getRequestSession(request);

    if (!session?.user)
        return Response.json({ error: "Sign in to choose connections." }, { status: 401 });

    const member = await workspaceAccess(session.user.id);

    if (!permitted(member, "agent_studio"))
        return Response.json({ error: "Agent Studio access required." }, { status: 403 });

    const kind = new URL(request.url).searchParams.get("kind");

    if (kind === "agents")
        return Response.json({
            items: (
                await db.query(
                    `SELECT id,name,purpose,'agent' AS "referenceKind" FROM agents WHERE admin_library_access($1,user_id) AND deleted_at IS NULL ORDER BY name`,
                    [session.user.id],
                )
            ).rows,
        });

    if (kind === "memory") {
        if (!permitted(member, "knowledge"))
            return Response.json({ error: "Knowledge access required." }, { status: 403 });

        return Response.json({
            items: (
                await db.query(
                    `SELECT id,name,'Search this project’s indexed documents' AS purpose,'knowledge' AS "referenceKind" FROM epace_projects WHERE user_id=$1 ORDER BY updated_at DESC`,
                    [session.user.id],
                )
            ).rows,
        });
    }

    if (kind === "tools") {
        const admin = permitted(member, "admin");
        const integrations = (await listProviders(session.user.id)).map((p) => ({
            id: `integration:${p.id}`,
            name: p.name,
            purpose: integrationPurpose(p),
            referenceKind: "builtin",
        }));
        const custom = admin ? (await projectBindings(session.user.id)).map(bindingTool) : [];
        const builtin = (await builtinTools(session.user.id))
            .filter(
                (tool) =>
                    tool.enabled &&
                    (admin ||
                        [
                            "profile",
                            "requests",
                            "agent_assist",
                            "chart_visualizer",
                            "meeting_rooms",
                        ].includes(tool.id)),
            )
            .map((tool) => ({
                ...tool,
                purpose: `${tool.purpose}\nCapability limits: ${tool.capabilityPurpose}${tool.defaultRequest ? `\nDefault request when no input is supplied: ${tool.defaultRequest}` : ""}`,
                referenceKind: "builtin",
            }));
        return Response.json(
            {
                items: [
                    ...builtin,
                    ...integrations,
                    ...custom,
                    ...(
                        await db.query(
                            `SELECT id,name,purpose,method,endpoint_url AS "endpointUrl",'tool' AS "referenceKind" FROM tools WHERE admin_library_access($1,user_id) ORDER BY name`,
                            [session.user.id],
                        )
                    ).rows,
                ],
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    }

    return Response.json({ error: "Choose agents, tools or memory." }, { status: 400 });
}
