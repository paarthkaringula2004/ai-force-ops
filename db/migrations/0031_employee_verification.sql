ALTER TABLE workspace_members ADD COLUMN employment_verified_at timestamptz;
ALTER TABLE workspace_members ADD COLUMN employment_verified_by text REFERENCES "user"(id) ON DELETE SET NULL;
