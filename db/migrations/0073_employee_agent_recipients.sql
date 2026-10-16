ALTER TABLE agent_role_shares ADD COLUMN sharing_mode text NOT NULL DEFAULT 'roles'
 CHECK (sharing_mode IN ('roles','recipients'));
CREATE TABLE agent_share_recipients (
 share_id uuid NOT NULL REFERENCES agent_role_shares(share_id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 PRIMARY KEY(share_id,user_id)
);
CREATE INDEX agent_share_recipients_user ON agent_share_recipients(user_id,share_id);
