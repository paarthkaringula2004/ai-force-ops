CREATE TABLE service_review_conversations (
    id uuid PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'New chat',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_review_chat
ADD COLUMN conversation_id uuid REFERENCES service_review_conversations (id) ON DELETE CASCADE;

CREATE INDEX review_conversations_owner_idx ON service_review_conversations (user_id, updated_at DESC);

CREATE INDEX review_chat_conversation_idx ON service_review_chat (user_id, conversation_id, created_at DESC);