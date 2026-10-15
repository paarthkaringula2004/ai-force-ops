CREATE TABLE service_review_chat (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 question text NOT NULL,
 answer text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed','blocked')),
 model text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX review_chat_user_time_idx ON service_review_chat(user_id,created_at DESC);
