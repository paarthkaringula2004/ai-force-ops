ALTER TABLE teams_user_connections
ADD COLUMN IF NOT EXISTS app_fingerprint text;

ALTER TABLE teams_oauth_states
ADD COLUMN IF NOT EXISTS app_fingerprint text;

ALTER TABLE workspace_virtual_meetings
ADD COLUMN IF NOT EXISTS microsoft_organizer_id text;