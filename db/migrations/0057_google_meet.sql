CREATE TABLE google_meet_app_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),
 client_id text NOT NULL, client_secret text NOT NULL,
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE google_meet_user_connections (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 google_id text NOT NULL, account_name text NOT NULL, account_email text NOT NULL,
 access_token text NOT NULL, refresh_token text NOT NULL, expires_at timestamptz NOT NULL,
 scopes text NOT NULL, app_fingerprint text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE google_meet_oauth_states (
 state_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 verifier text NOT NULL, app_fingerprint text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
ALTER TABLE workspace_virtual_meetings ADD COLUMN provider text NOT NULL DEFAULT 'teams' CHECK(provider IN ('teams','google'));
ALTER TABLE workspace_virtual_meetings ADD COLUMN google_organizer_id text;
