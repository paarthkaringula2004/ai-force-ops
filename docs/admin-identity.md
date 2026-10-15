# Admin identity and additional Admins

Admin accounts have a separate, server-generated unique `admin_id`. Migration `0035_admin_identity.sql` assigns IDs to existing Admins and a database trigger assigns one on promotion. Once an account is Admin and has an Admin ID, its role is read-only in Administration. The shared server update path rejects demotion through both the API and chat confirmation with HTTP 409. IDs remain stable; historic IDs are never reassigned. Account activation remains subject to the organization-owner and last-active-Admin protections. Employee IDs are separate and existing employment records are retained.

Playground's Admin profile response shows the account name, email and Admin ID. Employee ID, department, reporting manager and employment-confirmation prompts are excluded. Administration hides those employment fields when Admin is selected and displays the read-only Admin ID instead.

An active Admin can say `Make person@gmail.com an Admin` or `Add person@gmail.com as Admin`. The target must already have a login. The assistant previews the exact account and full-access change, then requires its generated confirmation choice. No department step is required for Admin. Multiple Admins are supported. Existing disabled accounts stay disabled; role promotion does not silently reactivate them. No email invitation is sent.

Promotions reuse the transactional authorization and audit path. Expired/replayed previews, concurrent member changes and revoked actor permissions are rejected. The final active Admin and organization integration owner protections remain in place.

Verification: `node tests/admin-identity.mjs`, TypeScript and targeted ESLint checks passed on 8 October 2026. The test promotes two disposable accounts through confirmed chat, verifies distinct IDs, stable identity, no premature promotion, blocked fresh-User promotion and audit entries. A live browser check also confirmed the existing Admin's new profile response.
