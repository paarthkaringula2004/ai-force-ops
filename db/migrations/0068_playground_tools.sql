CREATE TABLE playground_tool_connections (
    id uuid PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    source_kind text NOT NULL CHECK (
        source_kind IN ('department', 'builtin', 'tool', 'project')
    ),
    reference_id text NOT NULL,
    name varchar(100) NOT NULL,
    purpose text NOT NULL CHECK (length(purpose) <= 2000),
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, source_kind, reference_id)
);

CREATE INDEX playground_tools_owner ON playground_tool_connections (user_id);