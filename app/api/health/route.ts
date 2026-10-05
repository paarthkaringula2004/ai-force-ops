import { db } from "@/lib/db";

export const runtime = "nodejs";
export async function GET() {
  try {
    await db.query("SELECT 1");
    return Response.json({ database: "connected", checkedAt: new Date().toISOString() });
  } catch {
    return Response.json({ database: "unavailable", checkedAt: new Date().toISOString() }, { status: 503 });
  }
}
