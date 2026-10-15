import { db } from "@/lib/db";
// The authenticated integration worker runs this even with all application browsers closed.
export async function maintainEpace() {
  const lease =
    await db.query(`INSERT INTO epace_maintenance_health(id,lease_until) VALUES(true,now()+interval '10 minutes')
  ON CONFLICT(id) DO UPDATE SET lease_until=EXCLUDED.lease_until WHERE (epace_maintenance_health.lease_until IS NULL OR epace_maintenance_health.lease_until<now()) AND (epace_maintenance_health.checked_at IS NULL OR epace_maintenance_health.checked_at<now()-interval '1 hour') RETURNING id`);
  if (!lease.rowCount) return;
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const interrupted = await c.query(
      `UPDATE epace_records SET data=data||jsonb_build_object('status','error','output','','error','This run was interrupted before completion.','end',now()),updated_at=now() WHERE kind='run' AND data->>'status'='pending' AND created_at<now()-interval '15 minutes'`,
    );
    const expired = await c.query(
      `DELETE FROM epace_records r USING epace_projects p WHERE r.project_id=p.id AND r.user_id=p.user_id AND r.kind IN ('run','alert') AND r.created_at<now()-(LEAST(365,GREATEST(1,COALESCE((p.settings->>'retention')::int,30)))*interval '1 day')`,
    );
    const threads = await c.query(
      `DELETE FROM epace_records t USING epace_projects p WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.kind='thread' AND t.created_at<now()-(LEAST(365,GREATEST(1,COALESCE((p.settings->>'retention')::int,30)))*interval '1 day') AND NOT EXISTS(SELECT 1 FROM epace_records r WHERE r.user_id=t.user_id AND r.project_id=t.project_id AND r.kind='run' AND r.data->>'threadId'=t.id::text)`,
    );
    await c.query(
      `DELETE FROM epace_request_limits WHERE window_start<now()-interval '2 days'`,
    );
    await c.query(
      `UPDATE epace_maintenance_health SET checked_at=now(),lease_until=NULL,last_error='',summary=$1::jsonb WHERE id=true`,
      [
        JSON.stringify({
          interrupted: interrupted.rowCount,
          expired: expired.rowCount,
          threads: threads.rowCount,
        }),
      ],
    );
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    await db.query(
      `UPDATE epace_maintenance_health SET lease_until=NULL,last_error='Maintenance failed; check database availability and migrations.' WHERE id=true`,
    );
    throw error;
  } finally {
    c.release();
  }
}
