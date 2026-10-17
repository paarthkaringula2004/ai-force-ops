CREATE TABLE IF NOT EXISTS agent_card_orders (
    user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
    agent_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(agent_ids) = 'array'),
    updated_at timestamptz NOT NULL DEFAULT now()
);