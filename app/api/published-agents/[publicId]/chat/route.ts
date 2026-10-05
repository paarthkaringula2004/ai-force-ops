import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { protectOpenAiRequest } from "@/config/Arcjet";
import { db } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ publicId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Agent-Conversation-Id", "Access-Control-Expose-Headers": "X-Agent-Conversation-Id" };

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(request: Request, context: Context) {
  const { publicId } = await context.params;
  if (!UUID.test(publicId)) return Response.json({ error: "Published agent not found." }, { status: 404, headers: CORS });
  const blocked = await protectOpenAiRequest(request);
  if (blocked) return Response.json(await blocked.json(), { status: blocked.status, headers: CORS });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "The agent runtime is not configured." }, { status: 503, headers: CORS });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid JSON." }, { status: 400, headers: CORS }); }
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input || input.length > 12000) return Response.json({ error: "Enter a message of 1 to 12,000 characters." }, { status: 400, headers: CORS });
  const suppliedConversationId = typeof body.conversationId === "string" ? body.conversationId : request.headers.get("x-agent-conversation-id");
  if (suppliedConversationId && !UUID.test(suppliedConversationId)) return Response.json({ error: "The conversation ID is invalid. Start a new conversation." }, { status: 400, headers: CORS });
  try {
    const publication = await db.query<{ userId: string; agentId: string; snapshot: { agent: { name: string; instructions: string; modelId: string }; graph: unknown } }>(
      `SELECT user_id AS "userId", agent_id AS "agentId", snapshot FROM published_agents WHERE public_id = $1 AND active = true LIMIT 1`, [publicId]);
    const release = publication.rows[0];
    if (!release) return Response.json({ error: "This agent is not currently published." }, { status: 404, headers: CORS });
    const config = release.snapshot.agent;
    const modelId = config.modelId || "gpt-4.1-mini";
    const conversationId = suppliedConversationId || randomUUID();
    const stored = await db.query<{ messages: { role: "user" | "assistant"; content: string }[] }>(
      `SELECT messages FROM published_conversations WHERE public_id=$1 AND conversation_id=$2 AND user_id=$3`, [publicId, conversationId, release.userId]);
    const history = stored.rows[0]?.messages ?? [];
    const messages = [...history.slice(-38), { role: "user" as const, content: input }];
    const client = new OpenAI({ apiKey });
    const result = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: "system", content: config.instructions || `You are ${config.name}, an AI assistant. Clearly say when operational data or connected tools are unavailable.` },
        ...messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      ],
    });
    const reply = result.choices[0]?.message.content ?? "The agent completed without a text response.";
    await db.query(
      `INSERT INTO published_conversations (public_id,conversation_id,user_id,messages,updated_at) VALUES ($1,$2,$3,$4::jsonb,now())
       ON CONFLICT (public_id,conversation_id) DO UPDATE SET messages=EXCLUDED.messages,updated_at=now()`,
      [publicId, conversationId, release.userId, JSON.stringify([...messages, { role: "assistant", content: reply }].slice(-40))]);
    const usage = result.usage;
    if (usage) await db.query(
      `INSERT INTO usage_events (id, user_id, source, model_id, input_tokens, output_tokens, total_tokens) VALUES ($1,$2,'published-agent',$3,$4,$5,$6)`,
      [randomUUID(), release.userId, modelId, usage.prompt_tokens, usage.completion_tokens, usage.total_tokens]);
    return new Response(reply, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "X-Agent-Conversation-Id": conversationId } });
  } catch {
    return Response.json({ error: "The published agent request could not be completed." }, { status: 502, headers: CORS });
  }
}
