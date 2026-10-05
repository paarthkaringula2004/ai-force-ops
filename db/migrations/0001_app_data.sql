CREATE TABLE IF NOT EXISTS agents (
  id uuid NOT NULL,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  name varchar(64) NOT NULL,
  purpose text NOT NULL DEFAULT '',
  model_id varchar(200) NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS agents_user_updated_idx
  ON agents (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_workflows (
  user_id text NOT NULL,
  agent_id uuid NOT NULL,
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_id),
  FOREIGN KEY (user_id, agent_id)
    REFERENCES agents (user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playground_settings (
  user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playground_messages (
  id uuid NOT NULL,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 12000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS playground_messages_user_created_idx
  ON playground_messages (user_id, created_at ASC);
