CREATE TABLE IF NOT EXISTS epace_request_limits (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL,
    window_kind text NOT NULL CHECK (window_kind IN ('minute', 'day')),
    requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
    PRIMARY KEY (user_id, window_start, window_kind)
);

CREATE TABLE IF NOT EXISTS epace_maintenance_health (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    checked_at timestamptz,
    lease_until timestamptz,
    last_error text NOT NULL DEFAULT '',
    summary jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS epace_pending_runs ON epace_records (user_id, created_at)
WHERE
    kind = 'run'
    AND data ->> 'status' = 'pending';

CREATE INDEX IF NOT EXISTS epace_thread_runs ON epace_records (user_id, project_id, (data ->> 'threadId'))
WHERE
    kind = 'run';

CREATE INDEX IF NOT EXISTS epace_alert_run ON epace_records (user_id, project_id, (data ->> 'runId'))
WHERE
    kind = 'alert';