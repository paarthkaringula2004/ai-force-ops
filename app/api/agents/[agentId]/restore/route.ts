import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { purgeExpiredAgentTrash } from "@/lib/agent-trash";

export const runtime = "nodejs";
type Context = { params: Promise<{ agentId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: Context) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to restore this agent." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found in the Bin." }, { status: 404 });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const restored = await client.query(
      `UPDATE agents SET deleted_at = NULL
       WHERE user_id = $1 AND id = $2 AND deleted_at > now() - interval '30 days'
       RETURNING id`,
      [session.user.id, agentId],
    );
    if (!restored.rowCount) {
      await client.query("ROLLBACK");
      await purgeExpiredAgentTrash();
      return Response.json({ error: "This agent has already been permanently deleted." }, { status: 404 });
    }
    await client.query(
      `UPDATE published_agents SET active = true
       WHERE id = (
         SELECT id FROM published_agents WHERE user_id = $1 AND agent_id = $2
         ORDER BY version DESC LIMIT 1
       )`,
      [session.user.id, agentId],
    );
    await client.query("COMMIT");
    return Response.json({ restored: true });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return Response.json({ error: "Could not restore this agent." }, { status: 503 });
  } finally {
    client.release();
  }
}
