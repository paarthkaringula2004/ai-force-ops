import { db } from "@/lib/db";

export const runtime = "nodejs";
export async function GET() {
  try {
    const required = ['user', 'session', 'workspace_members', 'mail_outbox', 'aiforce_schema_migrations'];
    const result = await db.query<{ ready: boolean }>("SELECT bool_and(to_regclass(name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name", [required]);
    const ready = result.rows[0]?.ready === true;
    return Response.json({ database: "connected", schema: ready ? "ready" : "migration_required", checkedAt: new Date().toISOString() }, { status: ready ? 200 : 503 });
  } catch {
    return Response.json({ database: "unavailable", checkedAt: new Date().toISOString() }, { status: 503 });
  }
}
