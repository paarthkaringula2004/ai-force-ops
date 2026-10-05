CREATE TABLE IF NOT EXISTS service_review_records (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  record_type varchar(24) NOT NULL CHECK (record_type IN ('metric', 'health', 'inventory', 'lifecycle', 'forecast', 'availability')),
  record_key varchar(180) NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_review_records_user_type_time_idx
  ON service_review_records (user_id, record_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS service_review_records_user_key_time_idx
  ON service_review_records (user_id, record_key, observed_at DESC);
