# eAssist operation and security configuration

The eAssist workspace opens from the Review Center persona menu or `/service-review-center/eassist`. Security configurations are available in its Security navigation item. Data, policies, approvals, execution identities, and audit entries are stored in PostgreSQL through migration `0008_eassist.sql`.

## Security controls

Each signed-in account has its own policy. Defaults require HTTPS and launch confirmation, permit task launches and source changes, prohibit deletion, and limit concurrent runs to three. The Security page saves only changed settings. Server handlers enforce these controls even when a request bypasses the UI.

Task confirmations expire after five minutes, are scoped to the account, integration, and template, and can be consumed once. Launch requests have durable idempotency keys; a repeated completed request returns its existing task identity. Pending or uncertain launches remain visible in Activity and block another launch of the same template. Active mirrored tasks and pending/uncertain launches count toward the concurrency limit. Stopping an existing task remains possible when new launches are disabled.

Integration credentials use AES-256-GCM authenticated encryption with a key derived from `BETTER_AUTH_SECRET`. Keep that secret stable; changing it requires migrating or re-entering integration credentials. Credential values are excluded from browser snapshots. Key-store secrets are excluded from mirrored records. Variable-group values are fetched only when editing their source record. Source logs can contain sensitive information; the source runner must control what it emits.

All API requests require a signed-in session and account-scoped records. Mutations require JSON and reject untrusted request origins and cross-site browser requests. Webhook and worker routes use separate bearer credentials. Webhook credentials are hashed in the database and displayed only at generation. Operational and policy changes produce audit entries.

These are account-level controls. They do not implement organization-wide administrator roles, delegated approvals, or tamper-proof audit retention. Source-system roles and permissions still apply. Separate service identities with the required source permissions should be used for each integration.

## Connect actual systems

1. Apply migrations with `npm run db:migrate`.
2. Add the exact permitted source origins to the server's `EASSIST_ALLOWED_ORIGINS` environment variable, separated by commas. For example, `https://alerts.example.org,https://instance.service-now.com,https://automation.example.org`. Requests cannot follow redirects to another host. An origin absent from this operator-controlled list is blocked before network access.
3. In Integrations, add the source's actual base URL, authentication method, credential, and (for Semaphore) project ID. Use **Test & sync** to import source records and check access. Unreachable or unconfigured sources remain visibly unverified or in error.
4. For Alertmanager, generate a webhook token and configure its receiver with the displayed webhook URL and bearer token. Retain polling to recover missed events.
5. To synchronize while no browser is open, set `EASSIST_WORKER_TOKEN` to a separately generated secret of at least 32 characters, set `EASSIST_APP_URL` to the application origin, and run `npm run eassist:worker` under the deployment's process supervisor. The worker uses the application's protected endpoint and the same outbound policy.

HTTPS should remain enabled for operational systems. An explicit account policy can permit HTTP for a controlled local development endpoint; the server origin allowlist is still required.

Each integration has a **Delete** action with a permanent-deletion confirmation. It removes the saved connection, encrypted credential, webhook access, cached records, execution tracking, and launch approvals from PostgreSQL. There is no recycle bin or restore path. Audit entries are retained. This local removal works for disabled and unreachable integrations and does not call or delete records from the source system or stop its tasks. The source-system deletion policy governs deleting source records, separately from removing an integration.

The implemented adapters use [Alertmanager API v2](https://github.com/prometheus/alertmanager/blob/main/api/v2/openapi.yaml), [ServiceNow Table API](https://www.servicenow.com/docs/r/api-reference/rest-apis/c_TableAPI.html), [Semaphore API](https://semaphoreui.com/api-docs), and [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/). They do not infer real hosts or credentials from presentation screenshots.

## Data delivery and execution

Alertmanager webhook events are persisted on receipt. Connected browsers check the revision stream approximately every second and fetch a new snapshot when data changes. Source synchronization runs when due, normally every ten seconds after a successful sync, with a longer retry interval after failure. The terminal fetches actual runner output approximately every second while a task is active. These intervals are subject to network, source API, and database latency.

Page switches retain the last account snapshot and do not replace populated views with empty-state content. A browser reconnect retains existing data. Snapshots use a cursor read before data queries so a concurrent write cannot be skipped by the next change event.

The terminal is a task-output viewer backed by the configured Semaphore runner. Playbooks execute in that runner and its configured inventory; the web server does not expose an arbitrary command shell. A source-reported successful task does not automatically resolve an incident. Operators record source-system resolution codes and evidence explicitly.

## Validation

Run `node tests/eassist-security.mjs` to validate persistence, cross-account isolation, HTTPS and origin enforcement, credential encryption, blocked source writes/deletes, expiring single-use confirmations, duplicate-launch protection, concurrent-run limits, and source-backed terminal output. This test creates temporary PostgreSQL accounts and a local source fixture, then removes only its own records. It does not contact configured operational systems.

The application still requires actual source URLs, credentials, permission grants, and worker deployment to receive operational events. Live compatibility with an organization's deployed API versions must be validated after configuring those sources.
