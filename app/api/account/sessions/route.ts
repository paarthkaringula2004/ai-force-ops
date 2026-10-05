import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view sessions." }, { status: 401 });
  try {
    const result = await db.query(`SELECT id, "createdAt" AS "createdAt", "updatedAt" AS "updatedAt", "expiresAt" AS "expiresAt", "ipAddress" AS "ipAddress", "userAgent" AS "userAgent" FROM "session" WHERE "userId"=$1 AND "expiresAt">now() ORDER BY "updatedAt" DESC LIMIT 50`, [session.user.id]);
    return Response.json({ sessions: result.rows.map((row) => ({ ...row, isCurrent: row.id === session.session.id })) });
  } catch { return Response.json({ error: "Could not load active login sessions." }, { status: 503 }); }
}
export async function DELETE(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to manage sessions." }, { status: 401 });
  try {
    const body: unknown = await request.json();
    const id = body && typeof body === "object" && typeof (body as Record<string, unknown>).id === "string" ? (body as Record<string, unknown>).id as string : "";
    if (!id || id.length > 200) return Response.json({ error: "Choose a valid session." }, { status: 400 });
    const result = await db.query(`DELETE FROM "session" WHERE id=$1 AND "userId"=$2`, [id, session.user.id]);
    return result.rowCount ? Response.json({ revoked: true }) : Response.json({ error: "Session not found." }, { status: 404 });
  } catch { return Response.json({ error: "Could not revoke this session." }, { status: 503 }); }
}
