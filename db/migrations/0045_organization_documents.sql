ALTER TABLE organization_mail_templates DROP CONSTRAINT organization_mail_templates_kind_check;
ALTER TABLE organization_mail_templates ADD CONSTRAINT organization_mail_templates_kind_check CHECK (kind IN (
 'job_description','offer','employment_contract','confidentiality','appointment','onboarding','handbook','policy_acknowledgment',
 'probation_confirmation','employment_verification','employment_change','salary_revision','performance_plan','disciplinary',
 'resignation_acceptance','relieving','experience','final_settlement'
));
ALTER TABLE mail_outbox DROP CONSTRAINT mail_outbox_kind_check;
ALTER TABLE mail_outbox ADD CONSTRAINT mail_outbox_kind_check CHECK (kind IN ('welcome','verification','leave','offer','test','document'));
ALTER TABLE mail_outbox ADD COLUMN document_type text;
ALTER TABLE mail_outbox ADD CONSTRAINT mail_outbox_document_type_check CHECK (document_type IS NULL OR document_type IN (
 'job_description','offer','employment_contract','confidentiality','appointment','onboarding','handbook','policy_acknowledgment',
 'probation_confirmation','employment_verification','employment_change','salary_revision','performance_plan','disciplinary',
 'resignation_acceptance','relieving','experience','final_settlement'
));
