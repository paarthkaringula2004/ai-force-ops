ALTER TABLE service_review_records
ADD COLUMN IF NOT EXISTS source_connection_id uuid REFERENCES eassist_connections (id) ON DELETE CASCADE;

ALTER TABLE service_review_records
ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual';

ALTER TABLE service_review_records
ADD COLUMN IF NOT EXISTS source_name text NOT NULL DEFAULT 'Imported readings';

ALTER TABLE service_review_records
ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

ALTER TABLE service_review_records
ADD COLUMN IF NOT EXISTS sample_bucket timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS review_connector_sample_idx ON service_review_records (
    source_connection_id,
    record_type,
    record_key,
    sample_bucket
)
WHERE
    source_connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS review_current_idx ON service_review_records (user_id, is_current, observed_at DESC);

CREATE TABLE IF NOT EXISTS service_review_sync (
    connection_id uuid PRIMARY KEY REFERENCES eassist_connections (id) ON DELETE CASCADE,
    imported_at timestamptz,
    last_error text NOT NULL DEFAULT '',
    reading_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_review_tokens (
    user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
    last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS service_review_ingestions (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    batch_id uuid NOT NULL,
    body_hash text NOT NULL,
    accepted integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, batch_id)
);