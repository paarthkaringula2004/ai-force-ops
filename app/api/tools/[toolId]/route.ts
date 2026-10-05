import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ toolId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: Context) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to remove a tool." }, { status: 401 });
  const { toolId } = await context.params;
  if (!UUID.test(toolId)) return Response.json({ error: "Tool not found." }, { status: 404 });
  try {
    const result = await db.query(`DELETE FROM tools WHERE user_id = $1 AND id = $2`, [session.user.id, toolId]);
    return result.rowCount ? new Response(null, { status: 204 }) : Response.json({ error: "Tool not found." }, { status: 404 });
  } catch { return Response.json({ error: "Could not remove this tool." }, { status: 503 }); }
}
