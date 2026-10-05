CREATE TABLE eassist_connections (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('alertmanager','servicenow','semaphore','prometheus')),
 base_url text NOT NULL, project_id text NOT NULL DEFAULT '', auth_type text NOT NULL DEFAULT 'bearer',
 username text NOT NULL DEFAULT '', secret_cipher text NOT NULL DEFAULT '', webhook_hash text,
 enabled boolean NOT NULL DEFAULT true, state text NOT NULL DEFAULT 'unverified',
 last_error text NOT NULL DEFAULT '', checked_at timestamptz, sync_after timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,id)
);
CREATE TABLE eassist_records (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL, kind text NOT NULL, external_id text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}', observed_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,connection_id) REFERENCES eassist_connections(user_id,id) ON DELETE CASCADE,
 UNIQUE(user_id,connection_id,kind,external_id)
);
CREATE INDEX eassist_records_user_kind ON eassist_records(user_id,kind,updated_at DESC);
CREATE TABLE eassist_operations (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL, request_key uuid NOT NULL,
 action text NOT NULL, target text NOT NULL DEFAULT '', request_hash text NOT NULL, state text NOT NULL DEFAULT 'pending',
 result jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key),
 FOREIGN KEY(user_id,connection_id) REFERENCES eassist_connections(user_id,id) ON DELETE CASCADE
);
CREATE TABLE eassist_activity (
 id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 connection_id uuid REFERENCES eassist_connections(id) ON DELETE SET NULL,
 action text NOT NULL, target text NOT NULL DEFAULT '', detail text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eassist_activity_user ON eassist_activity(user_id,id DESC);
CREATE TABLE eassist_revisions (user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, revision bigint NOT NULL DEFAULT 0);
CREATE TABLE eassist_security (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 allow_runs boolean NOT NULL DEFAULT true, allow_writes boolean NOT NULL DEFAULT true,
 allow_deletes boolean NOT NULL DEFAULT false, require_confirmation boolean NOT NULL DEFAULT true,
 require_https boolean NOT NULL DEFAULT true,
 max_concurrent integer NOT NULL DEFAULT 3 CHECK(max_concurrent BETWEEN 1 AND 20),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE eassist_run_approvals (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES eassist_connections(id) ON DELETE CASCADE,
 template_id text NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes', consumed_at timestamptz
);
CREATE FUNCTION eassist_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text;
BEGIN
 owner_id := COALESCE(NEW.user_id, OLD.user_id);
 INSERT INTO eassist_revisions(user_id,revision) VALUES(owner_id,1)
 ON CONFLICT(user_id) DO UPDATE SET revision=eassist_revisions.revision+1;
 RETURN NULL;
END $$;
CREATE TRIGGER eassist_record_changed AFTER INSERT OR UPDATE OR DELETE ON eassist_records FOR EACH ROW EXECUTE FUNCTION eassist_changed();
CREATE TRIGGER eassist_activity_changed AFTER INSERT ON eassist_activity FOR EACH ROW EXECUTE FUNCTION eassist_changed();
CREATE TRIGGER eassist_connection_changed AFTER INSERT OR UPDATE OF name,base_url,state,last_error,enabled,checked_at OR DELETE ON eassist_connections FOR EACH ROW EXECUTE FUNCTION eassist_changed();
CREATE TRIGGER eassist_operation_changed AFTER INSERT OR UPDATE ON eassist_operations FOR EACH ROW EXECUTE FUNCTION eassist_changed();
CREATE TRIGGER eassist_security_changed AFTER INSERT OR UPDATE ON eassist_security FOR EACH ROW EXECUTE FUNCTION eassist_changed();
CREATE UNIQUE INDEX eassist_incident_creation_once ON eassist_operations(user_id,connection_id,target) WHERE action='incident.fromAlert' AND state IN ('pending','unknown','completed');
