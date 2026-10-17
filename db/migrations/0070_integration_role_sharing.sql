CREATE TABLE integration_role_shares (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    provider text NOT NULL,
    shared_roles text[] NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, provider),
    CHECK (
        shared_roles <@ ARRAY['manager', 'employee', 'user']::text[]
    )
);

CREATE INDEX integration_role_shares_roles ON integration_role_shares USING gin (shared_roles);