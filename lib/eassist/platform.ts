import {workspaceAccess} from '@/lib/workspace-access';
import {changeOrganizationAlert} from './organization-alerts';
import { randomUUID, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { remote, type PrivateConnection, InputError } from "./transport";
import { securityPolicy } from "./security";
import { organizationEvent } from '@/lib/organization';
import { organizationExecutionAllowed } from '@/lib/organization-security';

export function componentForPath(path: string) {
  if (path.includes("/epace")) return "epace";
  if (path.includes("/eassist")) return "eassist";
  if (path.includes("/agent-builder")) return "reactflow";
  if (path.includes("/service-review-center")) return "review-center";
  return "agent-studio";
}

export async function recordPlatformError(
  user: string,
  source: string,
  kind: "browser" | "server",
) {
  const owner = await db.query('SELECT 1 FROM "user" WHERE id=$1', [user]);
  if (!owner.rowCount) return;
  const role=(await db.query('SELECT role FROM workspace_members WHERE user_id=$1',[user])).rows[0]?.role||'user';
  await organizationEvent(user,role,'runtime_error',source,kind,kind==='server'?'Website server error':'Website browser error reported','error');
  const key = `${kind}:${source}:${new Date().toISOString().slice(0, 13)}`;
  // One signal per component/hour prevents a failing render/retry loop from flooding operations.
  const alert = await db.query(
    `INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail,href)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
    [
      user,
      source,
      key,
      kind === "server" ? "critical" : "warning",
      kind === "server"
        ? "Website server error"
        : "Website browser error reported",
      kind === "server"
        ? "An authenticated website request encountered an unhandled server error. Inspect deployment logs."
        : "The signed-in browser reported a rendering or script error. This is a client-reported signal; inspect the affected workspace.",
      source === "epace"
        ? "/service-review-center/epace"
        : source === "eassist"
          ? "/service-review-center/eassist"
          : source === "reactflow"
            ? "/dashboard/agents"
            : "/service-review-center",
    ],
  );
  if (alert.rowCount)
    await db.query(
      "INSERT INTO platform_events(user_id,source,action,status,summary) VALUES($1,$2,$3,'error',$3)",
      [
        user,
        source,
        kind === "server" ? "Unhandled server error" : "Browser error reported",
      ],
    );
}

export async function startPlatformRun(
  user: string,
  source: "agent-studio" | "reactflow" | "published-agent",
  resource = "",
) {
  await organizationExecutionAllowed(user);
  const id = randomUUID();
  const href =
    source === "reactflow"
      ? `/agent-builder/${resource}/preview`
      : "/dashboard/agents";
  await db.query(
    "INSERT INTO platform_events(id,user_id,source,action,resource_id,status,summary,href) VALUES($1,$2,$3,'Agent execution',$4,'pending','Agent execution started',$5)",
    [id, user, source, resource, href],
  );
  return id;
}

export function executionFailure(error:unknown){
  const info=error&&typeof error==='object'?error as {status?:number;code?:string;name?:string}:{};
  if(info.code==='output_limit')return 'The response reached its configured output limit. Increase Max tokens for a longer answer.';
  if(info.status===401||info.status===403)return 'Agent execution failed: provider authentication or access denied. Check the configured credential and model access.';
  if(info.status===429)return 'Agent execution failed: provider rate limit or quota exceeded. Check account limits before retrying.';
  if(info.status===404)return 'Agent execution failed: requested model or provider resource was not found. Check the selected model and endpoint.';
  if(info.status===400)return 'Agent execution failed: provider rejected the request. Check model compatibility and workflow configuration.';
  if(info.status&&info.status>=500)return 'Agent execution failed: provider service error. Check provider availability before retrying.';
  if(/timeout|connection/i.test(String(info.name))||['ETIMEDOUT','ECONNREFUSED','ECONNRESET'].includes(String(info.code)))return 'Agent execution failed: provider connection or timeout error. Check network reachability.';
  return 'Agent execution failed. No detailed diagnostic was recorded; inspect deployment logs and provider configuration.';
}

export async function finishPlatformRun(
  user: string,
  id: string,
  success: boolean,
  error?: unknown,
) {
  await organizationEvent(user,(await workspaceAccess(user)).role,success?'execution_completed':'execution_failed','/api/playground','POST',success?'Agent execution completed':executionFailure(error),success?'info':'error');
  await db.query(
    "UPDATE platform_events SET status=$3,summary=$4 WHERE user_id=$1 AND id=$2",
    [
      user,
      id,
      success ? "success" : "error",
      success ? "Agent execution completed" : executionFailure(error),
    ],
  );
  if (!success)
    await db.query(
      `INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail,href)
    SELECT user_id,source,'execution:'||id,'critical','Agent execution failed',summary,href FROM platform_events WHERE user_id=$1 AND id=$2 ON CONFLICT DO NOTHING`,
      [user, id],
    );
}

export async function acknowledgePlatformAlert(user: string, id: string) {
 if(!(await securityPolicy(user)).allow_writes)throw new InputError('Alert acknowledgement is disabled by organization policy.',403);
 return changeOrganizationAlert(user,id,'acknowledged');
}

// Refresh active and acknowledged incidents before Alertmanager's expiry.
// Only resolution sends a final endsAt. Every delivery has a durable retry record.
export async function relayPlatformAlerts(user?: string) {
  const connections = await db.query<PrivateConnection>(
    "SELECT * FROM eassist_connections WHERE kind='alertmanager' AND enabled=true AND ($1::text IS NULL OR user_id=$1) ORDER BY id",
    [user || null],
  );
  for (const connection of connections.rows) {
    if (!(await securityPolicy(connection.user_id)).allow_writes) continue;
    await db.query(
      `INSERT INTO platform_alert_deliveries(connection_id,alert_id)
      SELECT $1,id FROM platform_alerts WHERE $2::text IS NOT NULL AND state IN ('active','acknowledged') ON CONFLICT DO NOTHING`,
      [connection.id, connection.user_id],
    );
    const jobs = await db.query(
      `UPDATE platform_alert_deliveries SET lease_until=now()+interval '90 seconds'
      WHERE (connection_id,alert_id) IN (SELECT d.connection_id,d.alert_id FROM platform_alert_deliveries d JOIN platform_alerts a ON a.id=d.alert_id
        WHERE d.connection_id=$1 AND $2::text IS NOT NULL AND (d.lease_until IS NULL OR d.lease_until<now()) AND
        (d.next_attempt<=now() AND d.state<>'resolved' OR a.updated_at>d.checked_at AND a.state<>'active') ORDER BY d.next_attempt LIMIT 50 FOR UPDATE OF d SKIP LOCKED)
      RETURNING alert_id`,
      [connection.id, connection.user_id],
    );
    if (!jobs.rowCount) continue;
    const ids = jobs.rows.map((row) => row.alert_id);
    const alerts = await db.query(
      "SELECT * FROM platform_alerts WHERE $1::text IS NOT NULL AND id=ANY($2::uuid[])",
      [connection.user_id, ids],
    );
    const owner = createHash("sha256")
      .update(connection.user_id)
      .digest("hex")
      .slice(0, 24);
    try {
      await remote(
        connection,
        "/api/v2/alerts",
        "POST",
        alerts.rows.map((alert) => ({
          labels: {
            alertname: "AIForcePlatformSignal",
            severity: alert.severity,
            component: alert.source,
            platform_alert_id: alert.id,
            account: owner,
          },
          annotations: { summary: alert.summary, description: alert.detail },
          startsAt: new Date(alert.created_at).toISOString(),
          endsAt: new Date(
            alert.state !== "resolved" ? Date.now() + 5 * 60 * 1000 : Date.now(),
          ).toISOString(),
        })),
      );
      for (const alert of alerts.rows)
        await db.query(
          "UPDATE platform_alert_deliveries SET state=$3,last_error='',checked_at=now(),next_attempt=now()+interval '60 seconds',attempts=attempts+1,lease_until=NULL WHERE connection_id=$1 AND alert_id=$2",
          [
            connection.id,
            alert.id,
            alert.state !== "resolved" ? "delivered" : "resolved",
          ],
        );
    } catch {
      await db.query(
        "UPDATE platform_alert_deliveries SET state='error',last_error='Alertmanager delivery failed; automatic retry is scheduled.',checked_at=now(),next_attempt=now()+interval '30 seconds',attempts=attempts+1,lease_until=NULL WHERE connection_id=$1 AND alert_id=ANY($2::uuid[])",
        [connection.id, ids],
      );
    }
  }
}

export async function maintainPlatformOperations() {
  // A process killed during execution cannot run its catch/finally handlers.
  const stale = await db.query(
    "UPDATE platform_events SET status='error',summary='Agent execution interrupted or exceeded 15 minutes' WHERE status='pending' AND created_at<now()-interval '15 minutes' RETURNING id,user_id",
  );
  for (const event of stale.rows)
    await finishPlatformRun(event.user_id, event.id, false);
  await db.query(
    "DELETE FROM platform_events WHERE created_at<now()-interval '30 days' AND status<>'pending'",
  );
  await db.query(
    "DELETE FROM platform_alerts WHERE state<>'active' AND updated_at<now()-interval '90 days'",
  );
}
