import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { purgeExpiredAgentTrash } from "@/lib/agent-trash";

export const runtime = "nodejs";

type AgentRow = {
  id: string;
  name: string;
  purpose: string;
  modelId: string;
  instructions: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  purgeAt?: Date | null;
};

function parseAgentInput(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const purpose = typeof row.purpose === "string" ? row.purpose.trim() : "";
  const modelId = typeof row.modelId === "string" ? row.modelId.trim() : "";
  const instructions = typeof row.instructions === "string" ? row.instructions.trim() : "";
  if (!name || name.length > 64 || purpose.length > 2000 || modelId.length > 200 || instructions.length > 12000) return null;
  return { name, purpose, modelId, instructions };
}

function serializeAgent(row: AgentRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    purgeAt: row.purgeAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view agents." }, { status: 401 });

  try {
    await purgeExpiredAgentTrash();
    const inBin = new URL(request.url).searchParams.get("view") === "bin";
    const result = await db.query<AgentRow>(
      `SELECT id, name, purpose, model_id AS "modelId", instructions,
              created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt",
              deleted_at + interval '30 days' AS "purgeAt"
       FROM agents WHERE user_id = $1 AND (($2::boolean AND deleted_at IS NOT NULL) OR (NOT $2::boolean AND deleted_at IS NULL))
       ORDER BY COALESCE(deleted_at, updated_at) DESC`,
      [session.user.id, inBin],
    );
    return Response.json({ userId: session.user.id, view: inBin ? "bin" : "active", agents: result.rows.map(serializeAgent) });
  } catch {
    return Response.json({ error: "Could not load agents from PostgreSQL." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to create an agent." }, { status: 401 });

  try {
    const input = parseAgentInput(await request.json());
    if (!input) return Response.json({ error: "Enter an agent name and check the field lengths." }, { status: 400 });
    const result = await db.query<AgentRow>(
      `INSERT INTO agents (id, user_id, name, purpose, model_id, instructions)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, purpose, model_id AS "modelId", instructions, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [randomUUID(), session.user.id, input.name, input.purpose, input.modelId, input.instructions],
    );
    return Response.json({ agent: serializeAgent(result.rows[0]) }, { status: 201 });
  } catch {
    return Response.json({ error: "Could not save the agent to PostgreSQL." }, { status: 503 });
  }
}
