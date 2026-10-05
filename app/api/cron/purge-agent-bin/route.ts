import { purgeExpiredAgentTrash } from "@/lib/agent-trash";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const deletedCount = await purgeExpiredAgentTrash();
    return Response.json({ deletedCount });
  } catch {
    return Response.json({ error: "Could not purge expired agents." }, { status: 503 });
  }
}
