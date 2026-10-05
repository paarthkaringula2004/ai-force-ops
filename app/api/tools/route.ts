import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type ToolRow = { id: string; name: string; purpose: string; method: string; endpointUrl: string; createdAt: Date; updatedAt: Date; summary: string | null; operations: string[] | null; analyzedAt: Date | null };

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view the Tool Library." }, { status: 401 });
  try {
    const result = await db.query<ToolRow>(
      `SELECT t.id, t.name, t.purpose, t.method, t.endpoint_url AS "endpointUrl", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
       k.summary, k.operations, k.model_id AS "modelId", k.analyzed_at AS "analyzedAt"
       FROM tools t LEFT JOIN tool_knowledge k ON k.user_id = t.user_id AND k.tool_id = t.id
       WHERE t.user_id = $1 ORDER BY t.updated_at DESC`, [session.user.id]);
    return Response.json({ tools: result.rows });
  } catch { return Response.json({ error: "Could not load tools from PostgreSQL." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to add a tool." }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Enter valid tool details." }, { status: 400 });
    const value = body as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const purpose = typeof value.purpose === "string" ? value.purpose.trim() : "";
    const method = typeof value.method === "string" ? value.method.toUpperCase() : "GET";
    const endpoint = typeof value.endpointUrl === "string" ? value.endpointUrl.trim() : "";
    let parsed: URL;
    try { parsed = new URL(endpoint); } catch { return Response.json({ error: "Enter a valid HTTPS endpoint URL." }, { status: 400 }); }
    if (!name || name.length > 100 || purpose.length > 4000 || !METHODS.includes(method as typeof METHODS[number]) || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return Response.json({ error: "Use a name, a supported HTTP method, and an HTTPS endpoint without embedded credentials, query strings, or fragments." }, { status: 400 });
    }
    const result = await db.query(
      `INSERT INTO tools (id, user_id, name, purpose, method, endpoint_url) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, purpose, method, endpoint_url AS "endpointUrl", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [randomUUID(), session.user.id, name, purpose, method, parsed.toString()]);
    return Response.json({ tool: result.rows[0] }, { status: 201 });
  } catch { return Response.json({ error: "Could not save this tool to PostgreSQL." }, { status: 503 }); }
}
