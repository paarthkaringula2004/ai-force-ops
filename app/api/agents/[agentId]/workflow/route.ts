import { db } from "@/lib/db";
import { encryptAgentApiKey } from "@/lib/agent-secrets";
import { getRequestSession } from "@/lib/request-session";
import type { WorkflowGraph } from "@/types/workflow";
import { normalizeWorkflowGraph } from "@/lib/workflow-graph";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ agentId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view this workflow." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });

  try {
    const [result, secrets] = await Promise.all([
      db.query<{ graph: WorkflowGraph }>(
      `SELECT graph FROM agent_workflows WHERE user_id = $1 AND agent_id = $2`,
      [session.user.id, agentId],
      ),
      db.query<{ nodeId: string }>(`SELECT node_id AS "nodeId" FROM agent_api_credentials WHERE user_id=$1 AND agent_id=$2`, [session.user.id, agentId]),
    ]);
    if (!result.rows[0]?.graph) return Response.json({ graph: null });
    const configuredKeys = new Set(secrets.rows.map((secret) => secret.nodeId));
    const graph = normalizeWorkflowGraph(result.rows[0].graph.nodes, result.rows[0].graph.edges);
    const nodes = graph.nodes.map((node) => {
      const data = { ...node.data };
      delete data.apiKey;
      delete data.apiKeyDraft;
      delete data.clearApiKey;
      data.apiKeyConfigured = configuredKeys.has(node.id);
      if (data.settings && typeof data.settings === "object") {
        const settings = { ...asRecord(data.settings) };
        delete settings.apiKey;
        delete settings.apiKeyDraft;
        data.settings = settings;
      }
      return { ...node, data };
    });
    return Response.json({ graph: { ...graph, nodes } });
  } catch {
    return Response.json({ error: "Could not load this workflow from PostgreSQL." }, { status: 503 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to save this workflow." }, { status: 401 });
  const { agentId } = await context.params;
  if (!UUID.test(agentId)) return Response.json({ error: "Agent not found." }, { status: 404 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000_000) return Response.json({ error: "The workflow is too large to save." }, { status: 413 });

  try {
    const value: unknown = await request.json();
    if (typeof value !== "object" || value === null) return Response.json({ error: "Invalid workflow graph." }, { status: 400 });
    const graph = value as Record<string, unknown>;
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > 500 || graph.edges.length > 1000) {
      return Response.json({ error: "Workflow nodes or connections are invalid or exceed the size limit." }, { status: 400 });
    }
    const normalized = normalizeWorkflowGraph(graph.nodes, graph.edges);
    const apiKeys: Array<{ nodeId: string; encryptedValue: string }> = [];
    const clearedKeys: string[] = [];
    const safeNodes = normalized.nodes.map((node) => {
      const data = { ...node.data };
      const settings = { ...asRecord(data.settings) };
      const draft = typeof data.apiKeyDraft === "string" ? data.apiKeyDraft : typeof data.apiKey === "string" ? data.apiKey : typeof settings.apiKey === "string" ? settings.apiKey : "";
      if (draft.length > 4096) throw new Error("API keys must be 4,096 characters or fewer.");
      if (node.type === "ApiNode" && draft.trim()) apiKeys.push({ nodeId: node.id, encryptedValue: encryptAgentApiKey(draft) });
      if (data.clearApiKey === true) clearedKeys.push(node.id);
      delete data.apiKey;
      delete data.apiKeyDraft;
      delete data.apiKeyConfigured;
      delete data.clearApiKey;
      delete settings.apiKey;
      delete settings.apiKeyDraft;
      if (Object.keys(settings).length) data.settings = settings;
      else delete data.settings;
      return { ...node, data };
    });
    const safeGraph = { ...normalized, nodes: safeNodes };
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
      `INSERT INTO agent_workflows (user_id, agent_id, graph, updated_at)
       SELECT $1, id, $3::jsonb, now() FROM agents WHERE user_id = $1 AND id = $2
       ON CONFLICT (user_id, agent_id) DO UPDATE SET graph = EXCLUDED.graph, updated_at = now()
       RETURNING updated_at AS "updatedAt"`,
      [session.user.id, agentId, JSON.stringify(safeGraph)],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return Response.json({ error: "Agent not found." }, { status: 404 });
      }
      for (const credential of apiKeys) {
        await client.query(
          `INSERT INTO agent_api_credentials (user_id,agent_id,node_id,encrypted_value,updated_at) VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (user_id,agent_id,node_id) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,updated_at=now()`,
          [session.user.id, agentId, credential.nodeId, credential.encryptedValue],
        );
      }
      if (clearedKeys.length) await client.query(
        `DELETE FROM agent_api_credentials WHERE user_id=$1 AND agent_id=$2 AND node_id=ANY($3::text[])`,
        [session.user.id, agentId, clearedKeys],
      );
      await client.query("COMMIT");
      return Response.json({ saved: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof Error && error.message === "API keys must be 4,096 characters or fewer.") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "Could not save this workflow to PostgreSQL." }, { status: 503 });
  }
}
