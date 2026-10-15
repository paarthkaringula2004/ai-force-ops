ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check CHECK(role IN ('user','employee','manager','admin'));
ALTER TABLE workspace_members ALTER COLUMN role SET DEFAULT 'user';
UPDATE workspace_members SET role='user' WHERE role='employee' AND employee_id='' AND department='' AND manager_id IS NULL AND employment_verified_at IS NULL;

-- This installation represents one organization. Its integration owner is explicit,
-- never inferred from the currently signed-in viewer.
CREATE TABLE organization_workspace (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 owner_id text REFERENCES "user"(id) ON DELETE RESTRICT,
 requests_per_minute integer NOT NULL DEFAULT 180 CHECK(requests_per_minute BETWEEN 30 AND 600),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO organization_workspace(id,owner_id)
SELECT true,m.user_id FROM workspace_members m JOIN "user" u ON u.id=m.user_id
WHERE m.role='admin' AND m.active ORDER BY (lower(u.email)='paarthkaringula@gmail.com') DESC,m.updated_at,m.user_id LIMIT 1;
INSERT INTO organization_workspace(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE organization_security_events (
 id uuid PRIMARY KEY, actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
 actor_role text NOT NULL, kind text NOT NULL, severity text NOT NULL,
 path text NOT NULL, method text NOT NULL, summary text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_security_events_time ON organization_security_events(created_at DESC);
CREATE INDEX organization_security_events_actor ON organization_security_events(actor_id,created_at DESC);
CREATE TABLE organization_request_windows (
 subject text NOT NULL, minute timestamptz NOT NULL, requests integer NOT NULL,
 PRIMARY KEY(subject,minute)
);
CREATE TABLE organization_vacancies (
 id uuid PRIMARY KEY, title text NOT NULL, department text NOT NULL DEFAULT '',
 location text NOT NULL DEFAULT '', application_url text NOT NULL,
 description text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
