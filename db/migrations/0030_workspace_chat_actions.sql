CREATE TABLE workspace_chat_actions (
    user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
    draft jsonb NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);