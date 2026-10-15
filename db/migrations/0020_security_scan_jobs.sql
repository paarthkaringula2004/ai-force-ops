CREATE TABLE security_scan_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 target text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
 phase text NOT NULL DEFAULT 'Waiting for scanner worker',
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 lease uuid,
 heartbeat_at timestamptz,
 started_at timestamptz,
 completed_at timestamptz,
 error text,
 coverage jsonb NOT NULL DEFAULT '[]',
 findings jsonb NOT NULL DEFAULT '[]',
 import_id uuid REFERENCES vulnerability_imports(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_id)
);
CREATE INDEX security_scan_owner ON security_scan_jobs(user_id,created_at DESC);
CREATE UNIQUE INDEX security_scan_one_active ON security_scan_jobs(user_id) WHERE status IN ('queued','running');
CREATE TABLE security_scan_worker (
 id integer PRIMARY KEY CHECK(id=1),
 checked_at timestamptz NOT NULL,
 capabilities jsonb NOT NULL DEFAULT '{}'
);
