CREATE TABLE IF NOT EXISTS agent_studio_backups (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL,
 graph jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 restored_at timestamptz,
 FOREIGN KEY(user_id,agent_id) REFERENCES agents(user_id,id) ON DELETE CASCADE
);
