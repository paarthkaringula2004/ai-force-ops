import { relayPlatformAlerts, maintainPlatformOperations } from "@/lib/eassist/platform";
import { maintainEpace } from "@/lib/epace/maintenance";
import { maintainIntegrationMonitors } from "@/lib/integrations/monitor";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { syncConnection } from "@/lib/eassist/sync";
import type { PrivateConnection } from "@/lib/eassist/transport";
export const runtime = "nodejs";
export async function POST(request: Request) {
    const secret = process.env.EASSIST_WORKER_TOKEN || "",
        provided = request.headers.get("authorization")?.replace(/^Bearer /i, "") || "";
    if (
        secret.length < 32 ||
        provided.length !== secret.length ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
    )
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await db.query<PrivateConnection>(
        "SELECT * FROM eassist_connections WHERE user_id IN (SELECT user_id FROM workspace_members WHERE active=true AND (role='admin' OR (role='manager' AND 'integrations'=ANY(permissions)))) AND enabled=true AND sync_after<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY sync_after LIMIT 10",
    );
    const results = await Promise.allSettled(rows.rows.map((c) => syncConnection(c)));
    await maintainEpace().catch(() => {});
    await maintainIntegrationMonitors().catch(() => {});
    await maintainPlatformOperations();
    await relayPlatformAlerts();
    await db.query(
        `INSERT INTO integration_worker_health(id,checked_at,processed) VALUES(true,now(),$1) ON CONFLICT(id) DO UPDATE SET checked_at=EXCLUDED.checked_at,processed=EXCLUDED.processed`,
        [results.length],
    );
    return Response.json({ processed: results.length });
}
