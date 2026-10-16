ALTER TABLE agent_role_shares DROP CONSTRAINT agent_role_shares_roles_check;
ALTER TABLE agent_role_shares ADD CONSTRAINT agent_role_shares_roles_check
 CHECK (jsonb_typeof(roles)='array' AND roles <@ '["user","manager","employee","admin"]'::jsonb);
