import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function removeApiSecrets(nodes: unknown[]) {
  return nodes.map((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return node;
    const value = node as Record<string, unknown>;
    if (!value.data || typeof value.data !== "object" || Array.isArray(value.data)) return node;
    const data = { ...(value.data as Record<string, unknown>) };
    delete data.apiKey;
    delete data.apiKeyDraft;
    delete data.apiKeyConfigured;
    delete data.clearApiKey;
    if (data.settings && typeof data.settings === "object" && !Array.isArray(data.settings)) {
      const settings = { ...(data.settings as Record<string, unknown>) };
      delete settings.apiKey;
      delete settings.apiKeyDraft;
      data.settings = settings;
    }
    return { ...value, data };
  });
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to import saved drafts." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 3_000_000) return Response.json({ error: "The saved drafts are too large to import." }, { status: 413 });

  let agents: unknown[];
  let workflows: unknown[];
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) throw new Error("invalid");
    agents = Array.isArray((body as Record<string, unknown>).agents) ? (body as { agents: unknown[] }).agents : [];
    workflows = Array.isArray((body as Record<string, unknown>).workflows) ? (body as { workflows: unknown[] }).workflows : [];
  } catch {
    return Response.json({ error: "Invalid saved drafts." }, { status: 400 });
  }
  if (agents.length > 200 || workflows.length > 200) return Response.json({ error: "You can import up to 200 agents at a time." }, { status: 400 });

  const normalizedAgents: Array<{ id: string; name: string; purpose: string; modelId: string; instructions: string }> = [];
  for (const value of agents) {
    if (typeof value !== "object" || value === null) return Response.json({ error: "An agent draft is invalid." }, { status: 400 });
    const row = value as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const purpose = typeof row.purpose === "string" ? row.purpose.trim() : "";
    const modelId = typeof row.modelId === "string" ? row.modelId.trim() : "";
    const instructions = typeof row.instructions === "string" ? row.instructions.trim() : "";
    if (typeof row.id !== "string" || !UUID.test(row.id) || !name || name.length > 64 || purpose.length > 2000 || modelId.length > 200 || instructions.length > 12000) {
      return Response.json({ error: "An agent draft has invalid fields." }, { status: 400 });
    }
    normalizedAgents.push({ id: row.id, name, purpose, modelId, instructions });
  }

  const normalizedWorkflows: Array<{ agentId: string; graph: { nodes: unknown[]; edges: unknown[] } }> = [];
  for (const value of workflows) {
    if (typeof value !== "object" || value === null) return Response.json({ error: "A workflow draft is invalid." }, { status: 400 });
    const row = value as Record<string, unknown>;
    const graph = row.graph;
    if (typeof row.agentId !== "string" || !UUID.test(row.agentId) || typeof graph !== "object" || graph === null) return Response.json({ error: "A workflow draft is invalid." }, { status: 400 });
    const candidate = graph as Record<string, unknown>;
    if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges) || candidate.nodes.length > 500 || candidate.edges.length > 1000) return Response.json({ error: "A workflow draft exceeds the supported size." }, { status: 400 });
    normalizedWorkflows.push({ agentId: row.agentId, graph: { nodes: removeApiSecrets(candidate.nodes), edges: candidate.edges } });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    let importedAgents = 0;
    let importedWorkflows = 0;
    for (const agent of normalizedAgents) {
      const result = await client.query(
        `INSERT INTO agents (id, user_id, name, purpose, model_id, instructions)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, id) DO NOTHING`,
        [agent.id, session.user.id, agent.name, agent.purpose, agent.modelId, agent.instructions],
      );
      importedAgents += result.rowCount ?? 0;
    }
    for (const workflow of normalizedWorkflows) {
      const result = await client.query(
        `INSERT INTO agent_workflows (user_id, agent_id, graph)
         SELECT $1, id, $3::jsonb FROM agents WHERE user_id = $1 AND id = $2
         ON CONFLICT (user_id, agent_id) DO NOTHING`,
        [session.user.id, workflow.agentId, JSON.stringify(workflow.graph)],
      );
      importedWorkflows += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return Response.json({ importedAgents, importedWorkflows });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return Response.json({ error: "Could not import saved drafts into PostgreSQL." }, { status: 503 });
  } finally {
    client.release();
  }
}
