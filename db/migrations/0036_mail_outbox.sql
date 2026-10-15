CREATE TABLE mail_outbox (
 id uuid PRIMARY KEY,
 dedupe_key text UNIQUE NOT NULL,
 kind text NOT NULL CHECK(kind IN ('welcome','verification','leave','offer','test')),
 recipient text NOT NULL,
 subject text NOT NULL,
 encrypted_content text,
 actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('draft','queued','sending','sent','failed','expired')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 expires_at timestamptz,
 sent_at timestamptz,
 message_id text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_outbox_ready ON mail_outbox(status,available_at);
CREATE INDEX mail_outbox_actor ON mail_outbox(actor_id,created_at DESC);
CREATE TABLE mail_worker_health (id boolean PRIMARY KEY DEFAULT true CHECK(id), checked_at timestamptz NOT NULL, processed integer NOT NULL);
