CREATE TABLE IF NOT EXISTS agent_api_credentials (
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  node_id text NOT NULL,
  encrypted_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_id, node_id),
  FOREIGN KEY (user_id, agent_id) REFERENCES agents (user_id, id) ON DELETE CASCADE
);
