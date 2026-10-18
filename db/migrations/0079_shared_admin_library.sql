-- Admin-created library resources belong to the organization in access terms.
-- Keep creator IDs and encrypted credentials in place; do not clone resources.
CREATE OR REPLACE FUNCTION admin_library_access(actor text, resource_owner text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspace_members caller
        WHERE caller.user_id=actor AND caller.active
          AND (actor=resource_owner OR (caller.role='admin' AND EXISTS (
              SELECT 1 FROM workspace_members creator
              WHERE creator.user_id=resource_owner AND creator.role='admin'
          )))
    );
$$;

-- Approval ownership is the acting person, while the agent can be another
-- Admin's resource. Tokens remain person-scoped and are never shared.
CREATE UNIQUE INDEX IF NOT EXISTS agents_global_id ON agents(id);
DO $$ DECLARE constraint_name text;
BEGIN
    FOR constraint_name IN SELECT conname FROM pg_constraint
        WHERE conrelid='agent_tool_approvals'::regclass
          AND confrelid='agents'::regclass AND contype='f'
    LOOP
        EXECUTE format('ALTER TABLE agent_tool_approvals DROP CONSTRAINT %I',constraint_name);
    END LOOP;
END $$;
ALTER TABLE agent_tool_approvals ADD CONSTRAINT agent_tool_approvals_agent
    FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE;
