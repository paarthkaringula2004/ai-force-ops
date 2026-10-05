import { Agent, run, type AgentInputItem } from "@openai/agents";
import { randomUUID } from "node:crypto";
import { protectOpenAiRequest } from "@/config/Arcjet";
import { getRequestSession } from "@/lib/request-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.length > 0 &&
    message.content.length <= 12000
  );
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to use the Playground." }, { status: 401 });
  const blocked = await protectOpenAiRequest(request);
  if (blocked) return blocked;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512_000) {
    return Response.json({ error: "The Playground request is too large." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages.slice(-40);
  const lastMessage = messages.at(-1);

  if (!model || model.length > 200) {
    return Response.json({ error: "Choose a valid OpenAI model ID." }, { status: 400 });
  }
  if (instructions.length > 12000) {
    return Response.json({ error: "Instructions must be 12,000 characters or less." }, { status: 400 });
  }
  if (!messages.length || !messages.every(isChatMessage) || !isChatMessage(lastMessage) || lastMessage.role !== "user") {
    return Response.json({ error: "A user message is required. Keep each message under 12,000 characters." }, { status: 400 });
  }

  const numberSetting = (key: string, min: number, max: number) => {
    const value = body[key];
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
      ? value
      : undefined;
  };
  const maxTokens = numberSetting("maxTokens", 1, 4000);
  const modelSettings = {
    temperature: numberSetting("temperature", 0, 2),
    topP: numberSetting("topP", 0, 1),
    frequencyPenalty: numberSetting("frequencyPenalty", -2, 2),
    presencePenalty: numberSetting("presencePenalty", -2, 2),
    ...(maxTokens ? { maxTokens } : {}),
  };

  const input: AgentInputItem[] = messages.map((message) =>
    message.role === "user"
      ? { role: "user", content: message.content }
      : {
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: message.content }],
        },
  );

  try {
    const agent = new Agent({
      name: "AIForce.Ops Playground",
      instructions: instructions || "You are a helpful assistant for AIForce.Ops service operations. Be clear when the user has not supplied operational data or integrations.",
      model,
      modelSettings,
    });
    const result = await run(agent, input);
    const reply = typeof result.finalOutput === "string"
      ? result.finalOutput
      : result.finalOutput == null
        ? "The agent completed without a text response."
        : JSON.stringify(result.finalOutput);

    const usage = result.state.usage;
    if (usage) await db.query(
      `INSERT INTO usage_events (id, user_id, source, model_id, input_tokens, output_tokens, total_tokens)
       VALUES ($1, $2, 'playground', $3, $4, $5, $6)`,
      [randomUUID(), session.user.id, model, usage.inputTokens, usage.outputTokens, usage.totalTokens],
    );
    return Response.json({ reply, usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens } : null });
  } catch {
    return Response.json(
      { error: "The agent run failed. Check that the selected model supports the Agents SDK and that the OpenAI account can access it." },
      { status: 502 },
    );
  }
}
