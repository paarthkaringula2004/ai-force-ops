CREATE TABLE service_review_enrichment (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 record_key text NOT NULL,
 input_hash text NOT NULL DEFAULT '',
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 next_check_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,record_key)
);
CREATE INDEX review_enrichment_due_idx ON service_review_enrichment(next_check_at);
