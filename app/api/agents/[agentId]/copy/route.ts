import { getRequestSession } from "@/lib/request-session";
import { sendAgentCopies } from "@/lib/agent-copies";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to send an agent." }, { status: 401 });
    try {
        requireSameOrigin(request);
        const { agentId } = await context.params;
        if (!/^[a-f0-9-]{36}$/i.test(agentId)) throw new InputError("Invalid agent.");
        const raw = await boundedJson(request);
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new InputError("Provide recipient user IDs.");
        const body = raw as { recipientIds?: unknown; requestId?: unknown };
        return Response.json(
            await sendAgentCopies(session.user.id, agentId, body.recipientIds, body.requestId),
        );
    } catch (error) {
        return Response.json(
            {
                error:
                    error instanceof InputError
                        ? error.message
                        : "Could not send this agent. Retry using the same dialog.",
            },
            { status: error instanceof InputError ? error.status : 503 },
        );
    }
}
