import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to load your token calculator." }, { status: 401 });
  try {
    const result = await db.query<{ inputText: string; outputText: string; updatedAt: Date }>(
      `SELECT input_text AS "inputText", output_text AS "outputText", updated_at AS "updatedAt"
       FROM token_calculator_state WHERE user_id = $1`,
      [session.user.id],
    );
    const state = result.rows[0];
    return Response.json({ input: state?.inputText ?? "", output: state?.outputText ?? "", updatedAt: state?.updatedAt?.toISOString() ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not load token calculator data from PostgreSQL." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to save your token calculator." }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) return Response.json({ error: "Invalid token calculator data." }, { status: 400 });
    const { input, output } = body as Record<string, unknown>;
    if (typeof input !== "string" || typeof output !== "string" || input.length > 50000 || output.length > 50000) {
      return Response.json({ error: "Each calculator field must be text up to 50,000 characters." }, { status: 400 });
    }
    const result = await db.query<{ updatedAt: Date }>(
      `INSERT INTO token_calculator_state (user_id, input_text, output_text, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET input_text = EXCLUDED.input_text, output_text = EXCLUDED.output_text, updated_at = now()
       RETURNING updated_at AS "updatedAt"`,
      [session.user.id, input, output],
    );
    return Response.json({ saved: true, updatedAt: result.rows[0].updatedAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not save token calculator data to PostgreSQL." }, { status: 503 });
  }
}
