CREATE TABLE security_scan_schedules (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 frequency text NOT NULL CHECK(frequency IN ('daily','weekly')),
 next_run_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
