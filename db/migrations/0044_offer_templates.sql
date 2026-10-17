CREATE TABLE organization_mail_templates (
    kind text PRIMARY KEY CHECK (kind = 'offer'),
    encrypted_content text NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    updated_by text REFERENCES "user" (id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);