import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ agentId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: RouteContext) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view this agent." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });

  try {
    const result = await db.query(
      `SELECT id, name, purpose, model_id AS "modelId", instructions, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM agents WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [session.user.id, agentId],
    );
    return result.rowCount ? Response.json({ agent: result.rows[0] }) : Response.json({ error: "Agent not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Could not load this agent from PostgreSQL." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to update this agent." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });

  try {
    const value: unknown = await request.json();
    if (typeof value !== "object" || value === null) return Response.json({ error: "Invalid agent details." }, { status: 400 });
    const body = value as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    if (!name || name.length > 64 || purpose.length > 2000 || modelId.length > 200 || instructions.length > 12000) {
      return Response.json({ error: "Enter an agent name and check the field lengths." }, { status: 400 });
    }
    const result = await db.query(
      `UPDATE agents SET name = $3, purpose = $4, model_id = $5, instructions = $6, updated_at = now()
       WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING id, name, purpose, model_id AS "modelId", instructions, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [session.user.id, agentId, name, purpose, modelId, instructions],
    );
    return result.rowCount ? Response.json({ agent: result.rows[0] }) : Response.json({ error: "Agent not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Could not update the agent in PostgreSQL." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to delete this agent." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });
  const permanently = new URL(request.url).searchParams.get("permanent") === "true";

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const releases = await client.query<{ publicId: string }>(
      "SELECT public_id AS \"publicId\" FROM published_agents WHERE user_id = $1 AND agent_id = $2",
      [session.user.id, agentId],
    );
    if (permanently && releases.rows.length) {
      await client.query(
        "DELETE FROM published_conversations WHERE user_id = $1 AND public_id = ANY($2::uuid[])",
        [session.user.id, releases.rows.map((release) => release.publicId)],
      );
    }
    if (permanently) {
      const result = await client.query("DELETE FROM agents WHERE user_id = $1 AND id = $2 AND deleted_at IS NOT NULL", [session.user.id, agentId]);
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return Response.json({ error: "This agent is not in the Bin." }, { status: 404 });
      }
      await client.query("COMMIT");
      return new Response(null, { status: 204 });
    }

    const result = await client.query<{ deletedAt: Date }>(
      "UPDATE agents SET deleted_at = now() WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING deleted_at AS \"deletedAt\"",
      [session.user.id, agentId],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }
    await client.query("UPDATE published_agents SET active = false WHERE user_id = $1 AND agent_id = $2 AND active", [session.user.id, agentId]);
    await client.query("COMMIT");
    const deletedAt = result.rows[0].deletedAt;
    return Response.json({ deletedAt: deletedAt.toISOString(), purgeAt: new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return Response.json({ error: "Could not delete the agent from PostgreSQL." }, { status: 503 });
  } finally {
    client.release();
  }
}
