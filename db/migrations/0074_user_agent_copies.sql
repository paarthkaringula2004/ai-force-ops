CREATE TABLE user_agent_copy_receipts (
    sender_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    source_agent_id uuid NOT NULL,
    recipient_ids jsonb NOT NULL,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sender_id, request_id)
);