ALTER TABLE integration_role_shares
ADD COLUMN source_owner_id text REFERENCES "user" (id) ON DELETE CASCADE;

ALTER TABLE integration_role_shares
DROP CONSTRAINT integration_role_shares_shared_roles_check;

ALTER TABLE integration_role_shares
ADD CONSTRAINT integration_role_shares_shared_roles_check CHECK (
    shared_roles <@ ARRAY['manager', 'employee', 'user', 'admin']::text[]
);