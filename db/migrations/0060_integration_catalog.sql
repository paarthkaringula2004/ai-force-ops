CREATE TABLE IF NOT EXISTS integration_connections (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    provider text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}',
    secret_cipher text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 1,
    checked_at timestamptz,
    check_state text NOT NULL DEFAULT 'not_checked',
    check_message text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, provider)
);

ALTER TABLE mail_outbox
DROP CONSTRAINT IF EXISTS mail_outbox_kind_check;

ALTER TABLE mail_outbox
ADD CONSTRAINT mail_outbox_kind_check CHECK (
    kind IN (
        'welcome',
        'verification',
        'leave',
        'offer',
        'test',
        'document',
        'notification'
    )
);

CREATE TABLE IF NOT EXISTS integration_executions (
    id uuid PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    provider text NOT NULL,
    operation text NOT NULL,
    status text NOT NULL,
    summary text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_execution_history ON integration_executions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_approvals (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    provider text NOT NULL,
    revision integer NOT NULL,
    connection_hash text NOT NULL,
    operation text NOT NULL,
    inputs_cipher text NOT NULL,
    context jsonb NOT NULL DEFAULT '{}',
    expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
    consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS integration_monitors (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    provider text NOT NULL,
    operation text NOT NULL,
    inputs_cipher text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    interval_seconds integer NOT NULL DEFAULT 300 CHECK (interval_seconds BETWEEN 60 AND 86400),
    next_run_at timestamptz NOT NULL DEFAULT now(),
    lease_until timestamptz,
    last_checked_at timestamptz,
    last_status text NOT NULL DEFAULT 'not_checked',
    result_cipher text,
    PRIMARY KEY (user_id, provider),
    FOREIGN KEY (user_id, provider) REFERENCES integration_connections (user_id, provider) ON DELETE CASCADE
);