# Shared Admin agents and Tool Library

Every active Admin can see and manage agents and custom tools created by other
Admins in this organization. New Admin accounts and newly promoted Admins gain
this access automatically. Creator IDs remain on the records for provenance;
access does not require copying, transferring, or sharing each agent separately.

Admin operations include agent details, workflow editing, credential replacement
(stored key values remain hidden), execution, publication, role sharing, workflow
backups, trash/restore, custom tool editing/deletion/analysis, project-tool
bindings, built-in tool settings and integration catalogue configuration.

Built-in tool settings and integration configuration use the organization
integration owner's shared library. Custom agents/tools retain their original
storage owner. Reopening an existing starter reuses its shared graph rather than
installing another Admin's personal copy. Existing records with the same name
are preserved; names alone do not establish that graphs are duplicates.

Profiles, workplace requests, chat history, model usage and approval tokens remain
scoped to the acting person. Running another Admin's agent must not fetch the
creator's personal employee profile or submit requests in that creator's name.
Managers, Employees and Users retain their existing ownership and explicit share
rules. Disabled accounts cannot use shared Admin access.

The existing dashboard update poll now checks changes across the shared library
and invalidates the visible Agents/custom tools list when another Admin edits it.
Project tools retain their existing refresh cycle.

## Deployment

Deploy all changed and new files, including migration
`db/migrations/0079_shared_admin_library.sql`. That migration is already applied
to the current Aiven database. Other databases must run `npm run db:migrate`.
Render startup applies it automatically when `RENDER_RUN_MIGRATIONS=true`.
The deployed application still needs the new source code before its lists change.

The migration adds a database access predicate and allows confirmation records
to reference a shared agent while remaining owned by the acting person. It does
not move agents, copy credentials, or erase records.

## Verification

`node tests/admin-library.mjs` checks shared lists, creation in both directions,
new Admin promotion, editing, workflow saving, execution, profile/usage/request
identity, person-bound confirmations, trash/restore, custom tools, shared built-in
settings, integration definitions/configuration and project bindings. It uses
temporary database accounts and a fixture model; no paid model calls or external
provider actions are performed. Existing agent, DWP, and integration regressions
cover the previous permission and approval behavior.
