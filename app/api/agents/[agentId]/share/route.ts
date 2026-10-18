import { getRequestSession } from "@/lib/request-session";
import { saveAgentShare } from "@/lib/agent-sharing";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { agentLibraryOwner } from "@/lib/admin-library";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to share an agent." }, { status: 401 });
    try {
        requireSameOrigin(request);
        const { agentId } = await context.params;
        if (!/^[a-f0-9-]{36}$/i.test(agentId)) throw new InputError("Invalid agent.");
        const raw = await boundedJson(request);
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new InputError("Provide sharing settings.");
        const body = raw as { roles?: unknown; recipientIds?: unknown };
        return Response.json(
            await saveAgentShare(await agentLibraryOwner(session.user.id, agentId), agentId, body.roles, body.recipientIds),
        );
    } catch (error) {
        return Response.json(
            { error: error instanceof InputError ? error.message : "Could not save sharing." },
            { status: error instanceof InputError ? error.status : 503 },
        );
    }
}
