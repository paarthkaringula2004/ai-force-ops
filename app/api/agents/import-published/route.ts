import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

const PUBLIC_ID = /\/api\/published-agents\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/chat(?:[/?#"'`\\\s]|$)/i;
const PRIVATE_KEYS = new Set(["apiKey", "apiKeyDraft", "apiKeyConfigured", "clearApiKey"]);

function removeApiSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeApiSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !PRIVATE_KEYS.has(key))
    .map(([key, item]) => [key, removeApiSecrets(item)]));
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in before importing a workflow." }, { status: 401 });
  if (!permitted(await workspaceAccess(session.user.id), "agent_studio")) return Response.json({ error: "Agent Studio access required." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin imports are not allowed." }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 64 * 1024) return Response.json({ error: "The pasted code is too large." }, { status: 413 });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) return Response.json({ error: "The pasted code is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(rawBody);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    body = value as Record<string, unknown>;
  } catch { return Response.json({ error: "Send the pasted agent code as a JSON object." }, { status: 400 }); }
  const code = typeof body.code === "string" ? body.code : "";
  if (!code || code.length > 48 * 1024) return Response.json({ error: "Paste the published agent code, then try again." }, { status: 400 });
  let imported: { agent?: Record<string, unknown>; graph?: { nodes?: unknown[]; edges?: unknown[] } } | undefined;
  try { imported = JSON.parse(code); } catch {}
  const publicId = PUBLIC_ID.exec(code)?.[1];
  if (!publicId && !imported?.graph) return Response.json({ error: "That code does not contain a published-agent endpoint. Copy agent.ts from a published agent and paste it here." }, { status: 400 });

  try {
    const result = await db.query<{ snapshot: { agent?: Record<string, unknown>; graph?: { nodes?: unknown[]; edges?: unknown[] } } }>(
      `SELECT snapshot FROM published_agents WHERE public_id = $1 AND active = true AND (NOT COALESCE((snapshot->>'requiresOwnerSession')::boolean,false) OR user_id=$2) LIMIT 1`, [publicId, session.user.id]);
    const snapshot = imported || result.rows[0]?.snapshot;
    const graph = snapshot?.graph;
    const agent = snapshot?.agent;
    if (!snapshot || !agent || !graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return Response.json({ error: "This agent is not published or its link has been revoked." }, { status: 404 });
    }
    if (graph.nodes.length > 500 || graph.edges.length > 1000) return Response.json({ error: "The published workflow exceeds the supported size." }, { status: 400 });
    const kinds = new Set(["StartNode","AgentNode","ModelNode","MemoryNode","ToolsNode","AgentsNode","ReferenceNode","ApiNode","EndNode","IfElseNode","WhileNode","UserApprovalNode"]);
    const ids = new Set<string>();
    for (const candidate of graph.nodes) {
      const n = candidate as { id?: string; type?: string; data?: unknown; position?: { x?: number; y?: number } };
      if (!n || typeof n.id !== "string" || ids.has(n.id) || !kinds.has(n.type || "") || !n.data || typeof n.data !== "object" || !Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y)) return Response.json({ error: "Invalid workflow node." }, { status: 400 });
      ids.add(n.id);
    }
    if (graph.edges.some(e => !e || !ids.has((e as { source: string }).source) || !ids.has((e as { target: string }).target))) return Response.json({ error: "Invalid workflow connection." }, { status: 400 });
    const name = typeof agent.name === "string" && agent.name.trim() ? agent.name.trim().slice(0, 64) : "Imported Agent";
    const purpose = typeof agent.purpose === "string" ? agent.purpose.slice(0, 2000) : "";
    const modelId = typeof agent.modelId === "string" ? agent.modelId.slice(0, 200) : "gpt-4.1-mini";
    const instructions = typeof agent.instructions === "string" ? agent.instructions.slice(0, 12000) : "";
    const safeGraph = removeApiSecrets({ nodes: graph.nodes, edges: graph.edges });
    const agentId = randomUUID();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO agents (id, user_id, name, purpose, model_id, instructions) VALUES ($1,$2,$3,$4,$5,$6)`,
        [agentId, session.user.id, name, purpose, modelId, instructions]);
      await client.query(
        `INSERT INTO agent_workflows (user_id, agent_id, graph) VALUES ($1,$2,$3::jsonb)`,
        [session.user.id, agentId, JSON.stringify(safeGraph)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    return Response.json({ agentId }, { status: 201 });
  } catch {
    return Response.json({ error: "Could not import the published workflow." }, { status: 503 });
  }
}
