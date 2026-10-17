-- Admin attachments follow the mail provider rather than app-imposed count/size caps.
ALTER TABLE organization_mail_templates
DROP CONSTRAINT IF EXISTS organization_mail_template_attachment_count;

ALTER TABLE organization_mail_attachments
DROP CONSTRAINT IF EXISTS organization_mail_attachments_size_bytes_check;

ALTER TABLE organization_mail_attachments
ALTER COLUMN size_bytes TYPE bigint;

ALTER TABLE organization_mail_attachments
ADD CONSTRAINT organization_mail_attachments_nonempty CHECK (size_bytes > 0);