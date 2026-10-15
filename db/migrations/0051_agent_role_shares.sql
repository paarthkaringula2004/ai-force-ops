CREATE TABLE agent_role_shares (
  share_id uuid PRIMARY KEY,
  agent_id uuid NOT NULL,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(roles)='array' AND roles <@ '["user","manager","employee"]'::jsonb),
  snapshot jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,agent_id),
  FOREIGN KEY(owner_id,agent_id) REFERENCES agents(user_id,id) ON DELETE CASCADE
);
CREATE INDEX agent_role_shares_owner ON agent_role_shares(owner_id);
