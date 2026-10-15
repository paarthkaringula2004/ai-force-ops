# ServiceNow integration readiness

The organization's ServiceNow instance is on a waiting list. No tenant URL or credentials have been supplied. Live integration is **not verified**. No demonstration incidents were added to the organization database.

## What works before the instance exists

- An agent receives the current server-side configuration and connected specialist/tool inventory each run. A specialist's name does not establish an external connection.
- With no ServiceNow connection, the incident tool returns `not_connected`, not a speculative active/inactive diagnosis.
- A disabled connection returns `paused` with explicitly saved records. Multiple enabled instances require selection by connection name.
- With an enabled connection, an incident read calls the configured incident API immediately. It supports an incident number such as `INC123456`, or the latest 20 incidents ordered by source update time.
- Successful API reads include `live` and a check timestamp. An empty successful response means incident-read access worked and returned no records, not that ServiceNow is inactive.
- Failed API reads return `cached` with an explicit failure message; cached records never establish present reachability. Charts label live and saved incident evidence separately.
- The connection test returns an error when collection fails or another synchronization holds its lease. Success includes a verification timestamp.

## Setup once the instance becomes available

1. Obtain the instance HTTPS URL and an authorized integration account/token with incident-table read access to the intended scope. Start with read access; the built-in incident tool does not modify ServiceNow.
2. Add the exact instance origin to the server's `EASSIST_ALLOWED_ORIGINS`, then restart the workspace service. Do not disable origin or HTTPS checks. Server secrets and credentials must remain outside source control.
3. In Review Center → Integrations, save a ServiceNow connection using the existing basic or bearer authentication fields. Credentials are encrypted on the server. Enable the connection and use its connection test.
4. Confirm success against a known incident and verify number, priority, state, source update time and check time. A 401/403, timeout, blocked origin or malformed response must remain a failure.
5. Attach **ServiceNow incidents** through the agent's + Tools branch. In Play, ask “Is ServiceNow connected?” and “What is the status of INC…?” Verify the response preserves its live/cached distinction.
6. Deploy with the existing workspace supervisor and eAssist worker, worker credentials, database and allowed origins configured. The worker polls eligible connections independently of browser tabs; source collection is periodic, not instantaneous push delivery. Confirm worker logs and source updates while all browsers are closed, then confirm authorized Admins see shared organization data.

## Verification and remaining checks

`node tests/servicenow-readiness.mjs` exercises the actual collector and connection-test control flow using isolated API fixtures: valid empty/nonempty responses, malformed incident identities, source failure, occupied leases and failure propagation.

`node tests/agent-studio.mjs` uses rollback-isolated database fixtures and controlled API responses to check disconnected/paused/live/cached states, specific incident reads, instance selection, role boundaries, charts and agent execution. These are implementation tests, not live ServiceNow tenant tests.

Production readiness still requires the real tenant, source ACL checks, representative data, worker deployment verification and staging acceptance. SysTrack telemetry, external software inventory and direct meeting-room booking require their own real integrations; attaching specialist agents does not supply those APIs.
