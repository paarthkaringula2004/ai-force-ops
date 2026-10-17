-- Preserve existing recipients, but stop Manager grants from including future accounts.
INSERT INTO
    agent_share_recipients (share_id, user_id)
SELECT
    s.share_id,
    v.user_id
FROM
    agent_role_shares s
    JOIN workspace_members m ON m.user_id = s.owner_id
    JOIN workspace_members v ON s.roles ? v.role
WHERE
    m.role = 'manager'
    AND s.sharing_mode = 'roles'
    AND v.active = true
    AND v.user_id <> s.owner_id
ON CONFLICT DO NOTHING;

UPDATE agent_role_shares s
SET
    sharing_mode = 'recipients',
    roles = '[]'::jsonb
FROM
    workspace_members m
WHERE
    m.user_id = s.owner_id
    AND m.role = 'manager'
    AND s.sharing_mode = 'roles';