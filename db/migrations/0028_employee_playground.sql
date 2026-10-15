CREATE TABLE employee_playground_drafts (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE employee_service_requests (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  request_number text NOT NULL UNIQUE,
  kind text NOT NULL,
  details jsonb NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_requests_owner ON employee_service_requests(user_id,created_at DESC);
