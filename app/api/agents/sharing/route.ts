import { getRequestSession } from "@/lib/request-session";
import { listAgentShares } from "@/lib/agent-sharing";
import { InputError } from "@/lib/eassist/transport";
export const runtime = "nodejs";
export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to view shared agents." }, { status: 401 });
    try {
        return Response.json(
            { ...(await listAgentShares(session.user.id)), ownerName: session.user.name },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return Response.json(
            { error: error instanceof InputError ? error.message : "Could not load sharing." },
            { status: error instanceof InputError ? error.status : 503 },
        );
    }
}
