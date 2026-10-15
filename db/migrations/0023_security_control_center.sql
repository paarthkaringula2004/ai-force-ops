ALTER TABLE security_scan_schedules DROP CONSTRAINT security_scan_schedules_frequency_check;
ALTER TABLE security_scan_schedules ADD CHECK(frequency IN ('continuous','manual','daily','weekly'));
ALTER TABLE service_review_chat ADD COLUMN actions jsonb NOT NULL DEFAULT '[]';
CREATE TABLE security_tool_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name text NOT NULL,kind text NOT NULL CHECK(kind IN ('json','zap')),base_url text NOT NULL,path text NOT NULL,
 auth_type text NOT NULL CHECK(auth_type IN ('none','bearer','basic','api-key')),username text NOT NULL DEFAULT '',header_name text NOT NULL DEFAULT 'X-API-Key',
 secret_cipher text NOT NULL DEFAULT '',mapping jsonb NOT NULL DEFAULT '{}',results_path text NOT NULL DEFAULT '',
 enabled boolean NOT NULL DEFAULT true,checked_at timestamptz,last_error text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_tool_connections_owner ON security_tool_connections(user_id);
INSERT INTO security_scan_schedules(user_id,frequency,next_run_at)
 SELECT DISTINCT user_id,'continuous',now() FROM security_scan_jobs ON CONFLICT(user_id) DO UPDATE SET frequency='continuous',next_run_at=now();
UPDATE platform_alerts SET href='/service-review-center/eassist?view=automated-alerts' WHERE event_key LIKE 'vulnerability:%';
