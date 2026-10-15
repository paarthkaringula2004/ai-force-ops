CREATE TABLE workspace_salaries (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 monthly_salary numeric(14,2) NOT NULL CHECK(monthly_salary>0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 deduction_basis text NOT NULL CHECK(deduction_basis IN ('calendar_days','fixed_30')),
 updated_by text REFERENCES "user"(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
