# Admin account deletion

Administration now includes **Delete account and data** on other members' cards, for Users, Employees, Managers and Admins. The Admin must review the warning and type the exact saved email address before clicking **Permanently delete account**.

The DELETE endpoint requires the signed-in active Admin, same-origin requests and an unchanged member version. Deletion runs atomically under the same organization lock as role changes. Self-deletion and removal of the shared integration owner are blocked. Transfer that owner first; at least one active Admin must remain. Mail deliveries with an active lease must finish before deletion.

The login and database-owned data are permanently removed: sessions and connected authentication accounts, profile, agents/workflows, tools/knowledge, chat, employee requests/drafts, tickets, ePACE/eAssist and Review Center/security records. Historical audit/security rows associated with that member, mail jobs addressed to or initiated by the member and email OTP records are explicitly removed. Other employees survive; their manager/reviewer references are cleared. Pending role/decision previews involving the deleted account are removed.

A minimal `member.deleted` audit entry records the acting Admin and deleted role; it contains no deleted account email, name or identifier. Organization-wide settings and vacancies are retained.

This removes stored application data, not previously delivered emails, database backups, provider logs or data/actions in external integrations. In-flight external actions cannot be undone by deleting an account.

`node tests/member-deletion.mjs` exercises the shared deletion service against real database foreign keys, entirely within a transaction that is rolled back. It checks all four roles, sessions and cascading data, exact confirmation, stale versions, unauthorized actors, self-deletion, mail/code cleanup and preservation of other employees. The exact Identity Admin account shown by the user is removed only with the separately authorized `--remove-requested-fixture` option.
