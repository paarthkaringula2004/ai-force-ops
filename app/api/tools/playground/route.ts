import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { workspaceAccess } from "@/lib/workspace-access";
import {
    playgroundToolSources,
    listPlaygroundTools,
    savePlaygroundTool,
    playgroundConnectionSources,
} from "@/lib/playground-tools";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
import { organizationWriteAllowed, OrganizationPolicyError } from "@/lib/organization-security";
export const runtime = "nodejs";
const failure = (e: unknown) =>
    Response.json(
        {
            error:
                e instanceof InputError ||
                e instanceof IngestionError ||
                e instanceof OrganizationPolicyError
                    ? e.message
                    : "Could not load or save Playground tool connections.",
        },
        {
            status:
                e instanceof InputError ||
                e instanceof IngestionError ||
                e instanceof OrganizationPolicyError
                    ? e.status
                    : 503,
            headers: { "Cache-Control": "no-store" },
        },
    );
export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
    try {
        const user = session.user.id,
            member = await workspaceAccess(user);
        if (!member.active) throw new InputError("Active account required.", 403);
        const [sources, connections] = await Promise.all([
            playgroundToolSources(user, member),
            listPlaygroundTools(user, member),
        ]);
        const resolved = await playgroundConnectionSources(user, member, connections);
        return Response.json(
            {
                sources,
                canShare: member.role === "admin",
                connections: connections.map((c) => ({ ...c, source: resolved.get(c.id) })),
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    } catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
    try {
        requireSameOrigin(request);
        const b = (await boundedJson(request)) as Record<string, unknown>;
        if (!b || typeof b !== "object" || Array.isArray(b))
            throw new InputError("Provide tool configuration.");
        const user = session.user.id,
            member = await workspaceAccess(user);
        if (!member.active) throw new InputError("Active account required.", 403);
        if (b.action === "remove") {
            if (typeof b.id !== "string" || !/^[a-f0-9-]{36}$/i.test(b.id))
                throw new InputError("Choose a connection.");
            await organizationWriteAllowed(user);
            await db.query("DELETE FROM playground_tool_connections WHERE user_id=$1 AND id=$2", [
                user,
                b.id,
            ]);
        } else if (b.action === "save") await savePlaygroundTool(user, member, b);
        else throw new InputError("Choose save or remove.");
        return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        return failure(e);
    }
}
