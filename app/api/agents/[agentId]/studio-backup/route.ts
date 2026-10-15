import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
export async function GET(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const session = await getRequestSession(request); if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!permitted(await workspaceAccess(session.user.id), "agent_studio")) return Response.json({ error: "Agent Studio access required." }, { status: 403 });
  const { agentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) return Response.json({ error: "Invalid agent." }, { status: 400 });
  const result = await db.query(`SELECT created_at AS "createdAt" FROM agent_studio_backups WHERE user_id=$1 AND agent_id=$2 AND restored_at IS NULL ORDER BY created_at DESC LIMIT 1`, [session.user.id, agentId]);
  return Response.json({ backup: result.rows[0] || null });
}
export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const session = await getRequestSession(request); if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try { requireSameOrigin(request); } catch { return Response.json({ error: "Invalid origin." }, { status: 403 }); }
  if (!permitted(await workspaceAccess(session.user.id), "agent_studio")) return Response.json({ error: "Agent Studio access required." }, { status: 403 });
  const { agentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) return Response.json({ error: "Invalid agent." }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query(`SELECT id,graph FROM agent_studio_backups WHERE user_id=$1 AND agent_id=$2 AND restored_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [session.user.id, agentId]);
    if (!old.rowCount) { await client.query("ROLLBACK"); return Response.json({ error: "No previous draft is available." }, { status: 404 }); }
    await client.query(`UPDATE agent_workflows SET graph=$3,updated_at=now() WHERE user_id=$1 AND agent_id=$2`, [session.user.id, agentId, old.rows[0].graph]);
    await client.query(`UPDATE agent_studio_backups SET restored_at=now() WHERE id=$1`, [old.rows[0].id]);
    await client.query("COMMIT"); return Response.json({ restored: true });
  } catch { await client.query("ROLLBACK"); return Response.json({ error: "Could not restore the draft." }, { status: 503 }); }
  finally { client.release(); }
}
