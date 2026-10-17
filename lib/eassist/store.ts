import { sharedOperationsOwner, operationsActor } from "./organization-context";
import { organizationAlertData, organizationAlertRevision } from "./organization-alerts";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { InputError, type PrivateConnection } from "./transport";
import { object, type Json } from "./types";
import { securityPolicy } from "./security";

export async function connection(user: string, id: string) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new InputError("Select an integration.");
    const result = await db.query<PrivateConnection>(
        "SELECT * FROM eassist_connections WHERE user_id=$1 AND id=$2",
        [user, id],
    );
    if (!result.rows[0]) throw new InputError("Integration not found.", 404);
    return result.rows[0];
}
export async function audit(
    user: string,
    connectionId: string | null,
    action: string,
    target = "",
    detail = "",
) {
    await db.query(
        "INSERT INTO eassist_activity(user_id,connection_id,action,target,detail,actor_id) VALUES($1,$2,$3,$4,$5,$6)",
        [user, connectionId, action, target, detail.slice(0, 4000), operationsActor(user)],
    );
}
export async function putRecord(c: PrivateConnection, kind: string, id: string, data: Json) {
    await db.query(
        `INSERT INTO eassist_records(id,user_id,connection_id,kind,external_id,data) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(user_id,connection_id,kind,external_id) DO UPDATE SET data=EXCLUDED.data,observed_at=now(),updated_at=now()
    WHERE eassist_records.data IS DISTINCT FROM EXCLUDED.data`,
        [randomUUID(), c.user_id, c.id, kind, id, JSON.stringify(data)],
    );
}
export async function snapshot(viewer: string) {
    const user = await sharedOperationsOwner(viewer);
    const globalRevision = await organizationAlertRevision();
    const organizationAlerts = await organizationAlertData(viewer);
    const canSecurity = permitted(await workspaceAccess(user), "security");
    // Read the cursor first: a concurrent write must cause another refresh,
    // rather than advancing the client beyond data it has not received yet.

    const [connections, records, activity, platformAlerts, platformEvents, securityEvents] =
        await Promise.all([
            db.query(
                `SELECT id,name,kind,base_url,project_id,auth_type,username,enabled,state,last_error,checked_at,secret_cipher<>'' AS has_secret,webhook_hash IS NOT NULL AS has_webhook FROM eassist_connections WHERE user_id=$1 ORDER BY created_at`,
                [user],
            ),
            db.query(
                `SELECT id,connection_id,kind,external_id,data,observed_at,updated_at FROM eassist_records r WHERE user_id=$1 AND kind NOT IN ('output','journal') AND ($2::boolean OR NOT EXISTS(SELECT 1 FROM platform_alerts a WHERE a.user_id=$1 AND a.id::text=r.data->'labels'->>'platform_alert_id' AND (a.event_key LIKE 'vulnerability:%' OR a.event_key LIKE 'security%'))) ORDER BY updated_at DESC LIMIT 5000`,
                [user, canSecurity],
            ),
            db.query(
                'SELECT a.id,a.action,a.target,a.detail,a.created_at,u.name AS actor_name FROM eassist_activity a LEFT JOIN \"user\" u ON u.id=a.actor_id WHERE a.user_id=$1 ORDER BY a.id DESC LIMIT 100',
                [user],
            ),
            db.query(
                "SELECT * FROM platform_alerts WHERE user_id=$1 AND ($2::boolean OR (event_key NOT LIKE 'vulnerability:%' AND event_key NOT LIKE 'security%')) ORDER BY updated_at DESC LIMIT 1000",
                [user, canSecurity],
            ),
            db.query(
                "SELECT id::text,source||' · '||action AS action,resource_id AS target,summary AS detail,created_at FROM platform_events ORDER BY created_at DESC LIMIT 100",
                [],
            ),
            db.query(
                'SELECT e.id,e.kind AS action,e.path AS target,e.summary AS detail,e.created_at,u.name AS actor_name,e.actor_role FROM organization_security_events e LEFT JOIN "user" u ON u.id=e.actor_id ORDER BY e.created_at DESC LIMIT 100',
            ),
        ]);
    platformAlerts.rows = organizationAlerts.alerts;
    const accountLabels = (a: Record<string, unknown>) => ({
        account_user_id: a.account_user_id || "organization",
        account_id: a.account_id || "Not assigned",
        account_name: a.account_name || "Anonymous / unattributed",
        account_role: a.account_role || "anonymous",
    });
    const sharedExternal = organizationAlerts.external.map((r) => ({
        ...r,
        data: { ...r.data, labels: { ...r.data?.labels, ...accountLabels(r) } },
    }));
    const ownedAlerts = new Set(platformAlerts.rows.map((a) => a.id));
    const combinedRecords = [
        ...records.rows.filter((r) => r.kind !== "alerts"),
        ...sharedExternal.filter((r) => !ownedAlerts.has(r.data?.labels?.platform_alert_id)),
        ...platformAlerts.rows.map((a) => ({
            id: a.id,
            connection_id: "platform",
            kind: "alerts",
            external_id: a.id,
            observed_at: a.created_at,
            updated_at: a.updated_at,
            data: {
                platform: true,
                source: a.source,
                state: a.state,
                canResolve: !/^(vulnerability:|security)/.test(a.event_key),
                acknowledged: a.state === "acknowledged",
                labels: {
                    alertname: a.summary,
                    component: a.source,
                    severity: a.severity,
                    ...accountLabels(a),
                },
                annotations: {
                    summary: a.summary,
                    description: a.detail,
                    ...(a.status_actor ? { statusRecordedBy: a.status_actor } : {}),
                    ...(a.resolution_note ? { resolutionEvidence: a.resolution_note } : {}),
                },
                startsAt: a.created_at,
                href: a.href,
                receiver: "Website operations",
                silencedBy: [],
                inhibitedBy: [],
            },
        })),
    ];
    const combinedActivity = [
        ...securityEvents.rows.map((a) => ({
            ...a,
            action: a.action + " · " + (a.actor_name || a.actor_role),
            id: "organization:" + a.id,
        })),
        ...activity.rows.map((a) => ({
            ...a,
            action: a.actor_name ? a.action + " · " + a.actor_name : a.action,
            id: "eassist:" + a.id,
        })),
        ...platformEvents.rows
            .filter((a) => canSecurity || !/vulnerabilit|security|scanner/i.test(a.action))
            .map((a) => ({ ...a, id: "platform:" + a.id })),
    ]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 100);
    const deliveries = await db.query(
        "SELECT d.state,count(*)::int AS count FROM platform_alert_deliveries d JOIN eassist_connections c ON c.id=d.connection_id WHERE c.user_id=$1 GROUP BY d.state",
        [user],
    );
    const operations = await db.query(
        `SELECT id,connection_id,action,target,state,created_at,result FROM eassist_operations WHERE user_id=$1 AND state IN ('unknown','pending') ORDER BY created_at DESC LIMIT 100`,
        [user],
    );
    return {
        connections: connections.rows,
        records: combinedRecords,
        activity: combinedActivity,
        platformDelivery: deliveries.rows,
        operations: operations.rows,
        security: await securityPolicy(user),
        revision: globalRevision,
        alertAccounts: organizationAlerts.accounts,
        limits: { records: 6000, activity: 100 },
    };
}
export async function recordData(user: string, connectionId: string, kind: string, id: string) {
    const r = await db.query(
        "SELECT data FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind=$3 AND external_id=$4",
        [user, connectionId, kind, id],
    );
    return object(r.rows[0]?.data);
}
