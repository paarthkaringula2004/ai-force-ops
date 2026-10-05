import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

const defaults = {
  model: "",
  maxTokens: 0,
  temperature: 0.8,
  topP: 0.6,
  frequencyPenalty: 0.2,
  presencePenalty: 0.6,
  instructions: "",
};

function validSettings(value: unknown): typeof defaults | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const number = (key: keyof typeof defaults, min: number, max: number) => {
    const candidate = input[key];
    return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= min && candidate <= max ? candidate : null;
  };
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const instructions = typeof input.instructions === "string" ? input.instructions : "";
  const maxTokens = number("maxTokens", 0, 4000);
  const temperature = number("temperature", 0, 2);
  const topP = number("topP", 0, 1);
  const frequencyPenalty = number("frequencyPenalty", -2, 2);
  const presencePenalty = number("presencePenalty", -2, 2);
  if (model.length > 200 || instructions.length > 12000 || maxTokens === null || temperature === null || topP === null || frequencyPenalty === null || presencePenalty === null) return null;
  return { model, maxTokens, temperature, topP, frequencyPenalty, presencePenalty, instructions };
}

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to open the Playground." }, { status: 401 });
  try {
    const [settings, messages] = await Promise.all([
      db.query<{ settings: Partial<typeof defaults> }>("SELECT settings FROM playground_settings WHERE user_id = $1", [session.user.id]),
      db.query<{ id: string; role: "user" | "assistant"; content: string; createdAt: Date }>(
        `SELECT id, role, content, created_at AS "createdAt" FROM (
           SELECT id, role, content, created_at FROM playground_messages WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 200
         ) recent ORDER BY created_at ASC`,
        [session.user.id],
      ),
    ]);
    return Response.json({ settings: { ...defaults, ...settings.rows[0]?.settings }, messages: messages.rows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) });
  } catch {
    return Response.json({ error: "Could not load Playground data from PostgreSQL." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to save Playground settings." }, { status: 401 });
  try {
    const settings = validSettings(await request.json());
    if (!settings) return Response.json({ error: "Check Playground settings and their allowed ranges." }, { status: 400 });
    await db.query(
      `INSERT INTO playground_settings (user_id, settings, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`,
      [session.user.id, JSON.stringify(settings)],
    );
    return Response.json({ saved: true });
  } catch {
    return Response.json({ error: "Could not save Playground settings to PostgreSQL." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to save Playground messages." }, { status: 401 });
  try {
    const value: unknown = await request.json();
    if (typeof value !== "object" || value === null) return Response.json({ error: "Invalid Playground message." }, { status: 400 });
    const body = value as Record<string, unknown>;
    const role = body.role;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if ((role !== "user" && role !== "assistant") || !content || content.length > 12000) return Response.json({ error: "Messages must contain 1 to 12,000 characters." }, { status: 400 });
    const result = await db.query<{ id: string; role: "user" | "assistant"; content: string; createdAt: Date }>(
      `INSERT INTO playground_messages (id, user_id, role, content) VALUES ($1, $2, $3, $4)
       RETURNING id, role, content, created_at AS "createdAt"`,
      [randomUUID(), session.user.id, role, content],
    );
    return Response.json({ message: { ...result.rows[0], createdAt: result.rows[0].createdAt.toISOString() } }, { status: 201 });
  } catch {
    return Response.json({ error: "Could not save this message to PostgreSQL." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to clear Playground messages." }, { status: 401 });
  try {
    await db.query("DELETE FROM playground_messages WHERE user_id = $1", [session.user.id]);
    return Response.json({ cleared: true });
  } catch {
    return Response.json({ error: "Could not clear Playground messages from PostgreSQL." }, { status: 503 });
  }
}
