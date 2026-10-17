CREATE TABLE builtin_project_tool_settings (
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    tool_id text NOT NULL,
    name text NOT NULL,
    purpose text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT true,
    default_request text NOT NULL DEFAULT '',
    deleted_at timestamptz,
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tool_id)
);