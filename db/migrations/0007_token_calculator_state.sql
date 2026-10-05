CREATE TABLE IF NOT EXISTS token_calculator_state (
  user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  input_text text NOT NULL DEFAULT '',
  output_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
