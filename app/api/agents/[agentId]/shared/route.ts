import { getRequestSession } from "@/lib/request-session";
import { loadSharedAgent } from "@/lib/agent-sharing";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { runStudioAgent, type StudioMessage } from "@/lib/agent-studio-runtime";
import { protectOpenAiRequest } from "@/config/Arcjet";
export const runtime = "nodejs";
type Context = { params: Promise<{ agentId: string }> };
function failure(error: unknown) {
    return Response.json(
        {
            error:
                error instanceof InputError
                    ? error.message
                    : "Shared preview is unavailable. Retry later.",
        },
        { status: error instanceof InputError ? error.status : 502 },
    );
}
export async function GET(request: Request, context: Context) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to view this agent." }, { status: 401 });
    try {
        const { agentId } = await context.params;
        if (!/^[a-f0-9-]{36}$/i.test(agentId)) throw new InputError("Invalid agent.");
        const share = await loadSharedAgent(session.user.id, agentId);
        return Response.json(
            {
                agent: { id: agentId, name: share.agent.name, purpose: share.agent.purpose },
                ownerName: share.ownerName,
                version: share.version,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request, context: Context) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to chat with this agent." }, { status: 401 });
    try {
        requireSameOrigin(request);
        const { agentId } = await context.params;
        if (!/^[a-f0-9-]{36}$/i.test(agentId)) throw new InputError("Invalid agent.");
        const share = await loadSharedAgent(session.user.id, agentId);
        const blocked = await protectOpenAiRequest(request);
        if (blocked) return blocked;
        const body = (await boundedJson(request)) as {
            messages?: StudioMessage[];
            approvalToken?: unknown;
        };
        if (body.approvalToken)
            throw new InputError("Shared previews cannot approve actions.", 403);
        const messages = Array.isArray(body.messages) ? body.messages.slice(-50) : [];
        if (
            !messages.length ||
            messages.at(-1)?.role !== "user" ||
            messages.some(
                (message) =>
                    !message ||
                    !["user", "assistant"].includes(message.role) ||
                    typeof message.content !== "string" ||
                    !message.content.trim() ||
                    message.content.length > 12000,
            )
        )
            throw new InputError("Enter a message of up to 12,000 characters.");
        const result = await runStudioAgent(
            share.ownerId,
            share.agentId,
            messages.map(({ role, content }) => ({ role, content })),
            {
                releases: share.snapshot.releases,
                sharedViewer: session.user.id,
                checkSharedAccess: async () => {
                    const current = await loadSharedAgent(session.user.id, agentId);
                    if (current.version !== share.version)
                        throw new InputError("Sharing changed. Reload this preview.", 409);
                },
            },
        );
        return Response.json(
            {
                reply: result.reply,
                charts: result.charts,
                trace: result.trace,
                usage: result.usage,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
