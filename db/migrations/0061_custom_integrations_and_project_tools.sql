CREATE TABLE integration_definitions (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    id text NOT NULL,
    definition jsonb,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
);

CREATE TABLE project_tool_bindings (
    id uuid PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    name text NOT NULL,
    purpose text NOT NULL DEFAULT '',
    provider text NOT NULL,
    operation text NOT NULL,
    defaults jsonb NOT NULL DEFAULT '{}',
    revision integer NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_tool_owner ON project_tool_bindings (user_id, deleted_at);