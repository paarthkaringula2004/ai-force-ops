ALTER TABLE token_calculator_state
ADD COLUMN selected_model text NOT NULL DEFAULT 'gpt-4.1-mini';

ALTER TABLE token_calculator_state
ADD COLUMN output_budget integer NOT NULL DEFAULT 512 CHECK (output_budget BETWEEN 0 AND 128000);

CREATE TABLE token_calculator_limits (
    user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL DEFAULT now(),
    requests integer NOT NULL DEFAULT 1
);