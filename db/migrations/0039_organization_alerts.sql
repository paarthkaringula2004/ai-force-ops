ALTER TABLE platform_alerts ADD COLUMN affected_user_id text REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE platform_alerts SET affected_user_id=user_id WHERE source<>'organization';
UPDATE platform_alerts a SET affected_user_id=e.actor_id FROM organization_security_events e
WHERE a.source='organization' AND e.actor_id IS NOT NULL
AND a.event_key LIKE e.kind||':'||e.actor_id||':%';
CREATE INDEX platform_alerts_affected_state ON platform_alerts(affected_user_id,state);
CREATE TABLE platform_alert_status_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),alert_id uuid NOT NULL REFERENCES platform_alerts(id) ON DELETE CASCADE,actor_id text REFERENCES "user"(id) ON DELETE SET NULL,previous_state text NOT NULL,new_state text NOT NULL,note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
-- Recover warning/error signals recorded before an integration owner was available.
INSERT INTO platform_alerts(user_id,affected_user_id,source,event_key,severity,summary,detail,href,created_at)
SELECT o.owner_id,e.actor_id,'organization',e.kind||':'||COALESCE(e.actor_id,'anonymous')||':'||e.path||':'||to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH'),
 CASE WHEN e.severity='error' THEN 'critical' ELSE 'warning' END,e.summary,
 'Role: '||e.actor_role||' · '||e.method||' '||e.path,'/service-review-center/eassist?view=alerts',e.created_at
FROM organization_security_events e CROSS JOIN organization_workspace o
WHERE e.severity<>'info' AND o.owner_id IS NOT NULL
ON CONFLICT(user_id,source,event_key) DO NOTHING;

