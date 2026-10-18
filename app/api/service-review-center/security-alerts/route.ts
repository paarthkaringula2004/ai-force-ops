import { InputError } from "@/lib/eassist/transport";
import { changeOrganizationAlert } from "@/lib/eassist/organization-alerts";
import { securityPolicy } from "@/lib/eassist/security";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/organization-session";
import { boundedJson } from "@/lib/epace/runtime";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
export const runtime = "nodejs";
export async function GET(request: Request) {
    const user = (await getRequestSession(request))?.user?.id;
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        const [alerts, findings] = await Promise.all([
            db.query(
                `SELECT a.id,a.user_id,COALESCE(a.affected_user_id,a.user_id) AS account_user_id,a.source,a.summary,a.detail,a.severity,a.state,a.updated_at,a.created_at,
 COALESCE((SELECT array_agg(o.occurred_at ORDER BY o.occurred_at DESC) FROM platform_alert_occurrences o WHERE o.alert_id=a.id),ARRAY[a.created_at]) AS occurrence_times,
 (SELECT f.facts->>'url' FROM vulnerability_findings f WHERE a.event_key='vulnerability:'||f.id::text) AS resource_name
 FROM platform_alerts a WHERE $1::text IS NOT NULL AND (event_key LIKE 'vulnerability:%' OR event_key='security-worker' OR event_key LIKE 'security-connector:%') ORDER BY updated_at DESC LIMIT 1000`,
                [user],
            ),
            db.query(
                "SELECT count(*)::int AS total,max(scanned_at) AS observed_at,count(*) FILTER(WHERE facts->>'severity' IN ('Critical','High') AND facts->>'status'<>'Fixed')::int AS urgent FROM vulnerability_findings WHERE $1::text IS NOT NULL AND (scope LIKE 'Automated%' OR scope LIKE 'API%')",
                [user],
            ),
        ]);
        return Response.json(
            { alerts: alerts.rows, summary: findings.rows[0] },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        return Response.json({ error: "Automated alert storage unavailable." }, { status: 503 });
    }
}
export async function POST(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        requireSameOrigin(request);
        if (!(await securityPolicy(session.user.id)).allow_writes)
            return Response.json(
                { error: "Alert acknowledgment is disabled in eAssist Security configurations." },
                { status: 403 },
            );
        const b = await boundedJson(request, 1000);
        if (
            b.action !== "acknowledge" ||
            typeof b.id !== "string" ||
            !/^[0-9a-f-]{36}$/i.test(b.id)
        )
            return Response.json({ error: "Invalid alert." }, { status: 400 });
        const found = await db.query(
            "SELECT id FROM platform_alerts WHERE id=$1 AND (event_key LIKE 'vulnerability:%' OR event_key='security-worker' OR event_key LIKE 'security-connector:%')",
            [b.id],
        );
        if (!found.rowCount)
            return Response.json({ error: "Security alert not found." }, { status: 404 });
        await changeOrganizationAlert(session.actorId, b.id, "acknowledged");
        return Response.json({ ok: true });
    } catch (e) {
        return Response.json(
            {
                error:
                    e instanceof InputError || e instanceof IngestionError
                        ? e.message
                        : "Could not acknowledge the alert.",
            },
            {
                status:
                    e instanceof IngestionError
                        ? e.status
                        : typeof (e as { status?: number }).status === "number"
                          ? (e as { status: number }).status
                          : 503,
            },
        );
    }
}
