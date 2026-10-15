Shared organization operations

All active Admins use the configured organization integration owner's eAssist data: integrations, alerts, silences, incidents, dashboard records, task templates, schedules, inventory, variable groups, key metadata, repositories, automation team, activity, status and security policy. Settings and Help use the same workspace. Existing operational connectors and their imported records are consolidated into that workspace. Stored credential ciphertext is never included in snapshots.

Alerts are shared organization-wide, retaining their affected account separately from the integration owner. The default view groups by account name, current role and Employee/Manager/Admin ID; Users use internal account IDs. Accounts without alerts remain visible. Anonymous or unattributed events have a separate group. Active, acknowledged and resolved states remain distinct; resolved history is included by default. Acknowledgement does not resolve the underlying issue. Admin manual resolution requires recorded evidence; scanner findings require source verification. Status history records the actual acting Admin.

All Admins and Managers read the same organization Review Center readings. Managers retain the safe overview projection and their separate restricted assistant. No eAssist access is granted to Managers, Employees or Users. Admin operational assistant data uses the shared source; personal chat history remains per account.

Shared revision events refresh every Admin when any account emits an operational alert. Source integrations and scanner workers still need functioning external systems. The platform displays recorded signals; absence of alerts is not proof that an unmonitored system is healthy. Existing queued/running scans retain their owning account so active workers can finish; all Admins can see their scan status.

Test: node tests/organization-shared-operations.mjs uses rolled-back database fixtures and makes no external requests or emails.

One shared scanner schedule now applies to every Admin. Existing active scans continue under their original owner; schedules for former separate Admin workspaces are consolidated. Organization activity events also update the shared live revision.
