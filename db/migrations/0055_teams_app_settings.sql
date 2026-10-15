CREATE TABLE teams_app_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),
 tenant_id text NOT NULL, client_id text NOT NULL, client_secret text NOT NULL,
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);
