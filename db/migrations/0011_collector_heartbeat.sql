CREATE TABLE IF NOT EXISTS integration_worker_health (id boolean PRIMARY KEY DEFAULT true CHECK(id), checked_at timestamptz NOT NULL, processed integer NOT NULL DEFAULT 0);
