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

export async function PUT(request: Request, context: Context) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to edit this tool." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const { toolId } = await context.params;
  if (!UUID.test(toolId)) return Response.json({ error: "Tool not found." }, { status: 404 });
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const purpose = typeof body?.purpose === "string" ? body.purpose.trim() : "";
    const method = typeof body?.method === "string" ? body.method.toUpperCase() : "";
    const endpoint = new URL(typeof body?.endpointUrl === "string" ? body.endpointUrl : "");
    if (!name || name.length > 100 || purpose.length > 4000 || !["GET","POST","PUT","PATCH","DELETE"].includes(method) || endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return Response.json({ error: "Use a supported method and HTTPS endpoint without credentials, query strings or fragments." }, { status: 400 });
    const result = await db.query(`UPDATE tools SET name=$3,purpose=$4,method=$5,endpoint_url=$6,updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING id,name,purpose,method,endpoint_url AS "endpointUrl"`, [session.user.id,toolId,name,purpose,method,endpoint.toString()]);
    return result.rowCount ? Response.json({ tool: result.rows[0] }) : Response.json({ error: "Tool not found." }, { status: 404 });
  } catch { return Response.json({ error: "Check the tool details and endpoint." }, { status: 400 }); }
}
