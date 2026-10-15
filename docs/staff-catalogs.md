Admin-managed company catalogs

Administration > Company catalogs supports creating departments, company job titles and qualifications. Entries are stored in PostgreSQL and loaded into member selectors, without code edits or a restart. Only active Admins can create entries; server checks, same-origin protection, input validation and audit records apply.

The initial department codes 1–60 remain fixed. The next department gets 61, then 62. Job titles have their own incremental IDs and belong to a department. They do not create website access roles: User, Employee, Manager and Admin remain the authorization roles. Qualifications have incremental internal IDs plus an Admin-selected unique uppercase letter suffix (1–16 letters); the suffix appears in staff IDs. Qualification numeric IDs do not replace existing degree suffixes.

Case-insensitive duplicate names are rejected within each catalog (job titles within a department). Qualification suffixes cannot be reused. Transactional counter allocation serializes concurrent additions; a failed creation rolls back its increment. Existing entries cannot be deleted or recoded by this interface. Existing staff IDs do not change merely because an entry is added. Department codes above 99 expand without truncation.

Select a department, optional company job title and highest completed qualification in a member card, then save. Changing the job title alone does not change the staff ID. The original TypeScript catalog documents the initial seed only; runtime catalogs and validation use database records.

Checks: node tests/staff-catalogs.mjs and node tests/structured-staff-ids.mjs. Both use rolled-back database fixtures.
