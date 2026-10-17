CREATE TABLE workspace_members (
    user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'manager', 'admin')),
    manager_id text REFERENCES "user" (id) ON DELETE SET NULL,
    department text NOT NULL DEFAULT '',
    employee_id text NOT NULL DEFAULT '',
    permissions text[] NOT NULL DEFAULT '{}',
    active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        manager_id IS NULL
        OR manager_id <> user_id
    ),
    CHECK (
        role = 'manager'
        OR cardinality(permissions) = 0
    )
);

CREATE UNIQUE INDEX workspace_employee_id ON workspace_members (employee_id)
WHERE
    employee_id <> '';

INSERT INTO
    workspace_members (user_id)
SELECT
    id
FROM
    "user"
ON CONFLICT DO NOTHING;

CREATE FUNCTION add_workspace_member () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO workspace_members(user_id) VALUES(NEW.id); RETURN NEW; END $$;

CREATE TRIGGER workspace_member_created
AFTER INSERT ON "user" FOR EACH ROW
EXECUTE FUNCTION add_workspace_member ();

CREATE INDEX workspace_reporting_manager ON workspace_members (manager_id);

ALTER TABLE employee_service_requests
DROP CONSTRAINT employee_service_requests_status_check;

ALTER TABLE employee_service_requests
ALTER COLUMN status
SET DEFAULT 'pending_approval';

UPDATE employee_service_requests
SET
    status = 'pending_approval'
WHERE
    status = 'submitted';

ALTER TABLE employee_service_requests
ADD CONSTRAINT employee_service_requests_status_check CHECK (
    status IN (
        'pending_approval',
        'approved',
        'rejected',
        'cancelled',
        'fulfilled'
    )
);

ALTER TABLE employee_service_requests
ADD COLUMN decided_by text REFERENCES "user" (id) ON DELETE SET NULL;

ALTER TABLE employee_service_requests
ADD COLUMN decision_note text NOT NULL DEFAULT '';

ALTER TABLE employee_service_requests
ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE workspace_audit (
    id uuid PRIMARY KEY,
    actor_id text REFERENCES "user" (id) ON DELETE SET NULL,
    target_id text REFERENCES "user" (id) ON DELETE SET NULL,
    request_id uuid REFERENCES employee_service_requests (id) ON DELETE SET NULL,
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workspace_audit_time ON workspace_audit (created_at DESC);