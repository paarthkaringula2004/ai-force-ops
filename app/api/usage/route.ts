import { getRequestSession } from "@/lib/request-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view usage." }, { status: 401 });
  const daysValue = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysValue) ? Math.max(1, Math.min(365, Math.floor(daysValue))) : 30;
  try {
    const [total, recent] = await Promise.all([
      db.query(`SELECT COALESCE(sum(input_tokens),0)::int AS "inputTokens", COALESCE(sum(output_tokens),0)::int AS "outputTokens", COALESCE(sum(total_tokens),0)::int AS "totalTokens", count(*)::int AS requests FROM usage_events WHERE user_id=$1 AND created_at >= now() - ($2::int * interval '1 day')`, [session.user.id, days]),
      db.query(`SELECT id, source, model_id AS "modelId", input_tokens AS "inputTokens", output_tokens AS "outputTokens", total_tokens AS "totalTokens", created_at AS "createdAt" FROM usage_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [session.user.id]),
    ]);
    return Response.json({ days, totals: total.rows[0], events: recent.rows });
  } catch { return Response.json({ error: "Could not load usage from PostgreSQL." }, { status: 503 }); }
}
