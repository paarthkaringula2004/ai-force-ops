ALTER TABLE agent_role_shares DROP CONSTRAINT agent_role_shares_sharing_mode_check;
ALTER TABLE agent_role_shares ADD CONSTRAINT agent_role_shares_sharing_mode_check
 CHECK(sharing_mode IN ('roles','recipients','scoped'));
