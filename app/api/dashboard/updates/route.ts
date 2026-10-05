import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

type UpdateRow = {
  playground: Date | null;
  agents: Date | null;
  tools: Date | null;
  knowledge: Date | null;
  instructions: Date | null;
  models: Date | null;
  settings: Date | null;
  usage: Date | null;
  tokenCalculator: Date | null;
};

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to check dashboard updates." }, { status: 401 });

  try {
    const result = await db.query<UpdateRow>(
      `SELECT
        (SELECT GREATEST(MAX(created_at), (SELECT updated_at FROM playground_settings WHERE user_id = $1))
         FROM playground_messages WHERE user_id = $1) AS playground,
        (SELECT MAX(GREATEST(updated_at, COALESCE(deleted_at, updated_at))) FROM agents WHERE user_id = $1) AS agents,
        (SELECT GREATEST((SELECT MAX(updated_at) FROM tools WHERE user_id = $1), (SELECT MAX(analyzed_at) FROM tool_knowledge WHERE user_id = $1))::timestamptz) AS tools,
        (SELECT MAX(analyzed_at) FROM tool_knowledge WHERE user_id = $1) AS knowledge,
        (SELECT MAX(updated_at) FROM agents WHERE user_id = $1 AND instructions <> '') AS instructions,
        (SELECT MAX(created_at) FROM usage_events WHERE user_id = $1) AS models,
        (SELECT GREATEST((SELECT updated_at FROM account_profiles WHERE user_id = $1), (SELECT "updatedAt" FROM "user" WHERE id = $1))::timestamptz) AS settings,
        (SELECT MAX(created_at) FROM usage_events WHERE user_id = $1) AS usage,
        (SELECT updated_at FROM token_calculator_state WHERE user_id = $1) AS "tokenCalculator"`,
      [session.user.id],
    );
    const row = result.rows[0];
    const updates = Object.fromEntries(
      Object.entries(row).map(([section, timestamp]) => [section, timestamp ? new Date(timestamp).toISOString() : null]),
    );
    return Response.json({ updates, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not check recent dashboard updates." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
