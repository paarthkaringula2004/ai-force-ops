CREATE TABLE epace_projects (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name text NOT NULL, settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,id)
);
CREATE TABLE epace_records (
 id uuid PRIMARY KEY, user_id text NOT NULL, project_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('document','thread','run','filter','component','assessment','alert','prompt','template','radar')),
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,project_id) REFERENCES epace_projects(user_id,id) ON DELETE CASCADE
);
CREATE INDEX epace_records_scope ON epace_records(user_id,project_id,kind,created_at DESC);
CREATE TABLE epace_chunks (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES epace_records(id) ON DELETE CASCADE,
 user_id text NOT NULL, project_id uuid NOT NULL, ordinal integer NOT NULL, content text NOT NULL, embedding jsonb,
 FOREIGN KEY(user_id,project_id) REFERENCES epace_projects(user_id,id) ON DELETE CASCADE
);
CREATE INDEX epace_chunks_scope ON epace_chunks(user_id,project_id);
CREATE TABLE epace_audit (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, project_id uuid NOT NULL REFERENCES epace_projects(id) ON DELETE CASCADE,
 action text NOT NULL, record_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
