import OpenAI from "openai";
import { protectOpenAiRequest } from "@/config/Arcjet";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to load OpenAI models." }, { status: 401 });
  const blocked = await protectOpenAiRequest(request);
  if (blocked) return blocked;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const page = await client.models.list();
    const models = page.data.map((model) => model.id).sort((a, b) => a.localeCompare(b));
    return Response.json({ models });
  } catch {
    return Response.json(
      { error: "Could not load model IDs from OpenAI. Check the server API key and connection." },
      { status: 502 },
    );
  }
}
