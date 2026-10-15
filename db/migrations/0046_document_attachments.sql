CREATE TABLE organization_mail_attachments (
 id uuid PRIMARY KEY,
 document_type text NOT NULL,
 filename text NOT NULL,
 content_type text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
 encrypted_content text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE organization_mail_templates ADD COLUMN attachment_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE organization_mail_templates ADD CONSTRAINT organization_mail_template_attachment_count CHECK(cardinality(attachment_ids)<=5);
CREATE INDEX organization_mail_attachments_type_idx ON organization_mail_attachments(document_type,created_at);
