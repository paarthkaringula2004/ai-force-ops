ALTER TABLE playground_tool_connections
ADD COLUMN shared_roles text[] NOT NULL DEFAULT '{}',
ADD CONSTRAINT playground_tool_shared_roles CHECK (
    shared_roles <@ ARRAY['manager', 'employee', 'user']::text[]
);

CREATE INDEX playground_tools_shared ON playground_tool_connections USING gin (shared_roles);