# Workspace roles and employee services

This application has one organization workspace. A signed-in account has a persisted User, Employee, Manager or Admin role in `workspace_members`. New signups become Users; submitting a role in a signup payload cannot grant privileges. Admin assigns staff roles after hiring.

| Capability | Employee | Manager | Admin |
| --- | --- | --- | --- |
| Employee Super Bot and website overview | Yes | Yes | Yes |
| Own service requests and approval status | Yes | Yes | Yes |
| Review assigned direct reports | No | Yes | All workspace members |
| Approve/reject another employee request | No | Assigned direct reports only | Yes |
| Administration and role assignments | No | No | Yes |
| Agent Studio tools, models, knowledge library and usage | Yes | Yes | Yes |
| ePACE | Confirmed Employees | Yes, through Review Center | Yes |
| Review Center overview | No | Read-only organization overview | Full access |
| eAssist and security administration | No | No | Full access |
| Payments | No | No | Yes; also available to Users |
| Record verified manual fulfilment | No | No | Yes |

Administration is at `/dashboard/administration`. Select a role, reporting manager and department, then save the member. Access follows fixed roles; legacy optional grants do not enable restricted modules. Employee confirmation generates an ID; Manager and Admin do not require Employee confirmation. Circular reporting relationships and self-management are rejected. Demoting or disabling a Manager clears their direct reports' assignment. The last active Admin and the configured integration owner cannot be removed or disabled.

Organization controls select the integration owner whose readings supply Manager overview dashboards. The Manager assistant is separate from the unchanged Admin assistant and exposes only Review Center overview topics. Shared security policy, rate limits, origin validation and role checks apply across accounts. Account activity and runtime warnings are attributed and feed organization monitoring; Manager overview is limited to permitted scope, while Admin can inspect organization activity.

## Ticket allowances

Users start with five tickets once. Employees start with 50; Managers with 100. Staff balances reset to their allowance on the first access/use of each new IST calendar day, without accumulating unused tickets. Promotion immediately changes the allowance to 100. Admin has unlimited internal tickets. Header displays the current balance.

Admin can top up active staff without checkout. Grants are audited and retry-safe; the next daily reset restores the role allowance, including after a top-up. External AI providers still charge normal usage. Internal tickets do not represent a funded payment balance.

The Employee services menu includes resignation and handover, employee referrals, expense reimbursement, business travel, attendance corrections, payroll queries, benefits, internal transfers, training, employment documents, workplace concerns, flexible work and other services, alongside onboarding, leave, equipment, rooms, access and support. Referrals cannot be submitted without candidate consent. Workplace concerns disclose that managers and Admins can read them and direct confidential cases to the company HR channel.

My Requests lists the signed-in user's requests. Team Requests shows a Manager's current direct reports; Admins see workspace requests. No account can approve its own request. Decisions are transactional, audited and restricted to pending requests. Employees can cancel their own pending request. Only an Admin can record manual fulfilment after approval, with a verification note. This records a verified outcome; it does not call external company systems.

Employee profiles display the real account name, role, department, Employee ID and assigned manager. Missing profile information stays unassigned. Screenshot demo identities, entitlements, rooms and HR balances are not copied into accounts.

Apply migration `0029_workspace_roles.sql` with `npm run db:migrate`. When there are no active Admins, initialize an existing login with `node scripts/bootstrap-workspace-admin.mjs <email>`. The script refuses to bootstrap another account after an active Admin exists. The initial Admin for this workspace was explicitly assigned to `paarthkaringula@gmail.com` at the owner's request.

Permissions are checked on protected pages and APIs using the current database membership. Direct URLs and manually constructed API calls are blocked. High-impact role updates and request decisions recheck membership inside a serialized database transaction. Disabled accounts cannot use protected modules. Collector and worker credential validation remains in place, with owner permission checks for ingestion and queued work. Manager grants can be revoked without changing their login credentials. The UI refreshes membership periodically; server restrictions apply even before navigation refreshes.

Operational assets retain their existing owner scope: an Admin role permits modules but does not silently transfer ownership of another user's connections, agents or security evidence. Employee request review is intentionally workspace-wide for Admins. Published agent endpoints remain governed by their existing publication access settings.

HR eligibility and leave balances, live meeting-room inventory, equipment procurement, identity provisioning and outbound email/calendar delivery require real company integrations. Chat and approval screens do not claim those actions succeeded. Security scanning and operational controls remain available to Admins and explicitly permitted Managers.

Verification: `node tests/workspace-roles.mjs` checks default roles, API/page restrictions, direct-report isolation, self-approval denial, request transitions, optional grants and revocation, disabled accounts, escalation attempts, audit records and assistant recovery/scanner boundaries. `node tests/employee-playground.mjs` checks guided personal service requests, validation, context, isolation and duplicate submissions.

Organization workflows: `node tests/organization-services.mjs` verifies resignation review, referral consent, expenses, draft topic isolation, persisted approvals and submission auditing.

The Super Bot now executes Admin role assignments through the same transaction and validation as Administration. For example: `Assign person@example.com to manager role in SDE department`, or choose **Assign role** for a guided flow. It looks up an existing account, previews the exact identity and access changes, and requires its specific confirmation button. Missing accounts are not created. It preserves the Employee ID and active state; Manager modules require explicit grants in Administration. Previews expire after ten minutes, belong to the initiating account and cannot be replayed. Confirmation rechecks Admin access and the member version, and keeps at least one active Admin.

Managers and Admins can list their permitted **Team requests**, preview `Approve REQ-…` or `Reject REQ-… because [reason]`, then confirm in chat. Employees can preview `Cancel REQ-…` for their own pending request. Admins can record `Fulfil REQ-… with note [verified evidence]` for another user's approved request. The shared decision transaction rechecks current reporting relationships, role, status and version; self-approval remains blocked. Approval does not perform company fulfilment.

Employee drafts display saved progress and support **Edit request** before submission without losing other answers. Typing a request number shows the signed-in employee's details and decision notes. Profile information and recent pending counts use persisted data. **Employee services** exposes all nineteen workflows.

Verification: `node tests/employee-services-complete.mjs` submits every service, checks editing, profile data, request lookup, cancellation and isolation. `node tests/workspace-chat.mjs` checks guided/direct role changes, preview confirmation, expiry, replay, cancellation, changed-state/revoked-permission checks, scoped team decisions and audit records. Migration `0030_workspace_chat_actions.sql` stores expiring previews.
