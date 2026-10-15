import { getRequestSession } from "@/lib/request-session";
import { saveAgentShare } from "@/lib/agent-sharing";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to share an agent." }, { status: 401 });
  try {
    requireSameOrigin(request);
    const { agentId } = await context.params;
    if (!/^[a-f0-9-]{36}$/i.test(agentId)) throw new InputError("Invalid agent.");
    const body = await boundedJson(request) as { roles?: unknown };
    return Response.json(await saveAgentShare(session.user.id, agentId, body.roles));
  } catch (error) { return Response.json({ error: error instanceof InputError ? error.message : "Could not save sharing." }, { status: error instanceof InputError ? error.status : 503 }); }
}
