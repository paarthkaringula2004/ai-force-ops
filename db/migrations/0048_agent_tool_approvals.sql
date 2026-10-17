CREATE TABLE IF NOT EXISTS agent_tool_approvals (
    id uuid PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    agent_id uuid NOT NULL,
    node_id text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    graph_hash text NOT NULL,
    tool_hash text NOT NULL,
    payload jsonb NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id, agent_id) REFERENCES agents (user_id, id) ON DELETE CASCADE
);

CREATE INDEX agent_tool_approvals_owner ON agent_tool_approvals (user_id, agent_id);