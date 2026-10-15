-- Accrual begins when this policy is activated, never from invented employment history.
CREATE TABLE IF NOT EXISTS leave_policy_settings (
 id integer PRIMARY KEY CHECK (id=1),
 effective_month date NOT NULL CHECK (EXTRACT(DAY FROM effective_month)=1),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO leave_policy_settings(id,effective_month)
VALUES(1,date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date)
ON CONFLICT(id) DO NOTHING;
