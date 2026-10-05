import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to empty your Bin." }, { status: 401 });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const releases = await client.query<{ publicId: string }>(
      `SELECT release.public_id AS "publicId"
       FROM published_agents AS release
       JOIN agents AS agent ON agent.user_id = release.user_id AND agent.id = release.agent_id
       WHERE agent.user_id = $1 AND agent.deleted_at IS NOT NULL`,
      [session.user.id],
    );
    if (releases.rows.length) {
      await client.query(
        "DELETE FROM published_conversations WHERE user_id = $1 AND public_id = ANY($2::uuid[])",
        [session.user.id, releases.rows.map((release) => release.publicId)],
      );
    }
    const deleted = await client.query(
      "DELETE FROM agents WHERE user_id = $1 AND deleted_at IS NOT NULL RETURNING id",
      [session.user.id],
    );
    await client.query("COMMIT");
    return Response.json({ deletedCount: deleted.rowCount ?? 0 });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return Response.json({ error: "Could not empty the Bin." }, { status: 503 });
  } finally {
    client.release();
  }
}
