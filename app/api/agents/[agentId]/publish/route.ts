import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ agentId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== "object") return value;
  const privateKeys = new Set(["apiKey", "apiKeyDraft", "apiKeyConfigured", "clearApiKey"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !privateKeys.has(key))
    .map(([key, item]) => [key, withoutSecrets(item)]));
}

export async function GET(request: Request, context: Context) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view publishing status." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });
  try {
    const result = await db.query(
      `SELECT public_id AS "publicId", version, active, published_at AS "publishedAt", snapshot
       FROM published_agents WHERE user_id = $1 AND agent_id = $2
       ORDER BY version DESC LIMIT 1`, [session.user.id, agentId]);
    const publication = result.rows[0] ?? null;
    return Response.json({ publication: publication ? { ...publication, snapshot: withoutSecrets(publication.snapshot) } : null });
  } catch {
    return Response.json({ error: "Could not read publication status." }, { status: 503 });
  }
}

export async function POST(request: Request, context: Context) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to publish this agent." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const agent = await client.query(
      `SELECT id, name, purpose, model_id AS "modelId", instructions FROM agents WHERE user_id = $1 AND id = $2 FOR UPDATE`,
      [session.user.id, agentId]);
    if (!agent.rowCount) { await client.query("ROLLBACK"); return Response.json({ error: "Agent not found." }, { status: 404 }); }
    const previous = await client.query<{ publicId: string; version: number }>(
      `SELECT public_id AS "publicId", version FROM published_agents WHERE user_id = $1 AND agent_id = $2 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      [session.user.id, agentId]);
    const publicId = previous.rows[0]?.publicId ?? randomUUID();
    const version = Number(previous.rows[0]?.version ?? 0) + 1;
    const workflow = await client.query(`SELECT graph FROM agent_workflows WHERE user_id = $1 AND agent_id = $2`, [session.user.id, agentId]);
    const graph = withoutSecrets(workflow.rows[0]?.graph ?? { nodes: [], edges: [] }) as { nodes?: unknown[]; edges?: unknown[] };
    const nodes = Array.isArray(graph.nodes) ? graph.nodes as Array<{ type?: string; data?: Record<string, unknown> }> : [];
    const agentNode = nodes.find((node) => node.type === "AgentNode");
    const agentData = agentNode?.data ?? {};
    const legacy = agentData.settings && typeof agentData.settings === "object" ? agentData.settings as Record<string, unknown> : {};
    const effectiveModel = typeof agentData.modelId === "string" && agentData.modelId
      ? agentData.modelId
      : typeof legacy.model === "string" && legacy.model
        ? legacy.model
        : agent.rows[0].modelId || "gpt-4.1-mini";
    const effectiveInstructions = typeof agentData.instructions === "string" && agentData.instructions
      ? agentData.instructions
      : typeof legacy.instruction === "string" && legacy.instruction
        ? legacy.instruction
        : agent.rows[0].instructions;
    const snapshot = { agent: { ...agent.rows[0], modelId: effectiveModel, instructions: effectiveInstructions }, graph };
    await client.query(`UPDATE published_agents SET active = false WHERE user_id = $1 AND agent_id = $2 AND active`, [session.user.id, agentId]);
    await client.query(
      `INSERT INTO published_agents (id, public_id, user_id, agent_id, version, active, snapshot)
       VALUES ($1, $2, $3, $4, $5, true, $6::jsonb)`,
      [randomUUID(), publicId, session.user.id, agentId, version, JSON.stringify(snapshot)]);
    await client.query("COMMIT");
    return Response.json({ publication: { publicId, version, active: true, snapshot } }, { status: 201 });
  } catch {
    await client.query("ROLLBACK");
    return Response.json({ error: "Could not publish this agent." }, { status: 503 });
  } finally { client.release(); }
}

export async function DELETE(request: Request, context: Context) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to unpublish this agent." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });
  try {
    const result = await db.query(`UPDATE published_agents SET active = false WHERE user_id = $1 AND agent_id = $2 AND active`, [session.user.id, agentId]);
    return Response.json({ unpublished: Boolean(result.rowCount) });
  } catch { return Response.json({ error: "Could not unpublish this agent." }, { status: 503 }); }
}
