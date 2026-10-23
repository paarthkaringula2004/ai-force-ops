# AIForce.Ops eAssist — Page-by-Page File Map

This guide maps the eAssist website header, Dashboard, and each eAssist navigation page to the files that implement them. It follows the page-by-page structure of SERVICE-REVIEW-CENTER.md and AGENT-STUDIO.md: each screen has its own file-location section and flowchart. All paths in the trees are relative to the ai-force-ops/ project root.

eAssist is the Admin operations workspace at /service-review-center/eassist. Its 18 navigation views are rendered by one shared workspace component and selected with the view query parameter, for example /service-review-center/eassist?view=dashboard. Most eAssist operations are carried through the signed-in /api/eassist endpoint and its action dispatcher.

## Access shared by all eAssist pages

    app/service-review-center/eassist/
    ├── page.tsx
    │   └── Requires a signed-in user and Admin permission before mounting eAssist
    ├── workspace.tsx
    │   └── Shared page shell, navigation, data snapshot, filters, operations, dialogs, and view rendering
    ├── client-store.ts
    │   └── Loads/caches the snapshot and listens for live change notifications
    └── workspace.css
        └── eAssist header, navigation, cards, tables, dialogs, and responsive layout

    app/api/eassist/
    ├── route.ts
    │   └── Authenticated snapshot GET and validated operation POST
    └── events/route.ts
        └── Short-lived Server-Sent Events stream for live snapshot revisions

    lib/eassist/
    ├── organization-context.ts
    │   └── Resolves the shared organization operations owner and acting Admin
    ├── store.ts
    │   └── Loads and persists connections, records, actions, activity, and policy
    ├── types.ts
    │   └── Shared connection, record, security, resource-form, and snapshot types
    ├── transport.ts
    │   └── Validates external URLs, credentials, requests, and responses
    ├── actions.ts
    │   └── Validates and dispatches eAssist operations
    └── security.ts
        └── Enforces eAssist operation and connection security boundaries

    lib/workspace-access.ts
    lib/workspace-permissions.ts
    └── Resolves the signed-in member and Admin authorization

eAssist is Admin-only at the page entry. The eAssist snapshot and live event stream resolve shared organization operations data through the organization owner; actions are attributed to the acting Admin. Managers, Employees, and Users do not get eAssist access merely because they have Agent Studio or Review Center access. Within the Admin workspace, the Security and Automated Alert Center items also use the eAssist security permission check.

~~~mermaid
flowchart TD
    A[Open /service-review-center/eassist] --> B[Require signed-in session]
    B --> C[Check Admin permission]
    C -->|Denied| D[Return to Service Review Center]
    C -->|Allowed| E[Mount shared eAssist workspace]
    E --> F[Load organization snapshot]
    E --> G[Open live revision stream]
    F --> H[Render selected view]
    G --> I[Refresh snapshot when data changes]
    I --> H
~~~

---

## eAssist Page — file locations

**Page:** eAssist operations workspace · **Route:** /service-review-center/eassist

    app/service-review-center/eassist/
    ├── page.tsx
    │   └── Route entry; checks the signed-in session and requires Admin access
    ├── workspace.tsx
    │   └── Mounts the eAssist shell and selects the requested page from the view query
    ├── loading.tsx
    │   └── Shows the transition state while eAssist loads
    └── workspace.css
        └── Shared eAssist workspace styling

    lib/
    ├── request-session.ts
    ├── workspace-access.ts
    └── workspace-permissions.ts
        └── Resolves the session, member role, and Admin authorization

The page entry redirects signed-out visitors to the site root and non-Admins back to Service Review Center. An authorized Admin mounts the eAssist workspace shell; the selected navigation view is then read from the URL query. The separate Admin check here is stricter than simply having general Agent Studio, Manager, Employee, or User access.

~~~mermaid
flowchart TD
    A[Request /service-review-center/eassist] --> B[Load current session]
    B -->|No signed-in user| C[Redirect to site root]
    B -->|Signed in| D[Resolve workspace member]
    D --> E{Admin permission?}
    E -->|No| F[Redirect to Service Review Center]
    E -->|Yes| G[Mount EAssistWorkspace]
    G --> H[Read view query and render selected page]
~~~

---

## Header of the Website — file locations

This is the eAssist header at the top of the operations workspace: AIForce.Ops branding, Service Review Center label, eAssist identity, live/reconnecting status, and the signed-in account menu.

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Header markup, live-state badge, Review Center link, and account menu
    └── workspace.css
        └── Header sizing, status badge, typography, and responsive rules

    components/
    ├── auth/WorkspaceUserMenu.tsx
    │   └── Signed-in account menu
    └── workspace-link.tsx
        └── Permission-aware link back to Service Review Center

    app/api/eassist/
    ├── route.ts
    │   └── Supplies the snapshot and schedules a background refresh
    └── events/route.ts
        └── Drives the Live/Reconnecting status and change notifications

    lib/eassist/
    ├── organization-context.ts
    ├── organization-alerts.ts
    └── sync.ts
        └── Organization-level source owner, alert revisions, and live source refresh

The header's Live indicator reflects the browser event stream connection. It is not a guarantee that every external integration is healthy; per-connection health is shown on Status.

~~~mermaid
flowchart TD
    A[Open eAssist] --> B[Load signed-in account]
    B --> C[Load eAssist snapshot]
    C --> D[Start /api/eassist/events stream]
    D --> E{Stream state}
    E -->|Connected| F[Show Live]
    E -->|Disconnected or unavailable| G[Show Reconnecting]
    D --> H[Receive revision change]
    H --> I[Refresh snapshot]
    B --> J[Render account menu and Review Center link]
~~~

---

## Dashboard Page — file locations

**View:** Dashboard · **Route:** /service-review-center/eassist?view=dashboard

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Dashboard overview cards, source filtering, and Monitoring component placement
    ├── Monitoring.tsx
    │   └── Prometheus targets, health, collected metrics, scrape duration, and alert rules
    └── workspace.css
        └── Dashboard cards, statistics, monitoring table, and responsive layout

    app/api/eassist/
    ├── route.ts
    │   └── Returns the current records and connection snapshot
    └── events/route.ts
        └── Refresh notifications when organization data changes

    lib/eassist/
    ├── store.ts
    │   └── Snapshot and record loading
    ├── sync.ts
    │   └── Collects Prometheus and other configured source records
    └── types.ts
        └── Monitoring, connection, and record data shapes

The Dashboard view summarizes saved eAssist operations records and embeds Live Monitoring. Prometheus data is shown only when an enabled Prometheus connection has synchronized records. The integration filter can scope supported views to one source. No readings means no monitoring data has been collected; it is not interpreted as a healthy target.

~~~mermaid
flowchart TD
    A[Choose Dashboard] --> B[Read latest eAssist snapshot]
    B --> C[Apply selected integration filter]
    C --> D[Summarize operational records]
    C --> E[Select Prometheus monitoring records]
    E --> F[Count targets and health]
    E --> G[Show samples, duration, scrape time, and rules]
    D --> H[Render Dashboard]
    F --> H
    G --> H
~~~

---

## Alerts Page — file locations

**View:** Alerts · **Route:** /service-review-center/eassist?view=alerts

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Alert filtering, grouping, acknowledgement/status actions, details, and silence controls
    ├── client-store.ts
    │   └── Loads saved alert records and refreshes after revisions
    └── workspace.css
        └── Alert groups, labels, state badges, and filtering controls

    app/api/eassist/route.ts
    └── Loads alerts and accepts validated eAssist operations

    app/api/eassist/webhook/route.ts
    └── Accepts authenticated Alertmanager webhook alert batches

    app/api/service-review-center/security-alerts/route.ts
    └── Supplies the separate Review Center organization/security alert workflow

    lib/eassist/
    ├── actions.ts
    │   └── Alert lifecycle and source action validation
    ├── organization-alerts.ts
    │   └── Shared organization alert records and revision lookup
    ├── sync.ts
    │   └── Synchronizes connected Alertmanager alert state
    ├── store.ts
    │   └── Persists normalized eAssist records and activity
    └── types.ts
        └── Alert record shape and state helpers

Alerts can originate from a connected Alertmanager or platform operations. Grouping and filters change how records are displayed. Acknowledging an alert does not necessarily resolve the underlying condition. Source-system changes require the eAssist security policy and the connected source's own permissions.

~~~mermaid
flowchart TD
    A[Choose Alerts] --> B[Load alert records from snapshot]
    B --> C[Filter by integration and alert state]
    C --> D[Group repeated alerts]
    D --> E[Show alert details and occurrences]
    E --> F{Choose action}
    F -->|Acknowledge/status| G[Validate and record alert action]
    F -->|Silence| H[Create Alertmanager silence]
    F -->|Refresh| I[Reload snapshot]
    G --> I
    H --> I
~~~

---

## Automated Alert Center Page — file locations

**View:** Automated Alert Center · **Route:** /service-review-center/eassist?view=automated-alerts

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Mounts AutomatedAlerts in the eAssist navigation view
    ├── ../security-control.tsx
    │   └── Automated scanner findings, alert listing, acknowledgement, refresh, and linked controls
    ├── ../guided-scanner.tsx
    │   └── Scanner setup and guided connection workflow
    ├── ../security-scan-panel.tsx
    │   └── Scan status and report controls
    └── workspace.css
        └── Shared eAssist layout and panel styling

    app/api/service-review-center/
    ├── security-alerts/route.ts
    │   └── Reads/updates Review Center security alert state
    ├── scans/route.ts
    │   └── Creates and reads security scan jobs/reports
    ├── scans/worker/route.ts
    │   └── Processes scheduled/background scan work
    ├── security-tools/route.ts
    │   └── Manages scanner connectors
    └── vulnerabilities/route.ts
        └── Accepts, searches, analyzes, and exports vulnerability reports

    lib/vulnerabilities/
    ├── assistant.ts
    ├── connections.ts
    ├── files.ts
    ├── nmap.ts
    ├── scans.ts
    ├── schema.ts
    ├── storage.ts
    └── store.ts
        └── Scanner sources, finding validation, reports, and scan storage

    db/migrations/
    ├── 0019_vulnerability_reports.sql
    ├── 0020_security_scan_jobs.sql
    ├── 0021_security_scan_schedules.sql
    ├── 0023_security_control_center.sql
    └── 0024_security_connector_leases.sql
        └── Security findings, scan jobs, schedules, connectors, and leases

This tab hosts the Service Review Center Automated Alert Center within eAssist navigation. It is a separate security-finding pipeline from ordinary Prometheus/Alertmanager alert ingestion. Security access is checked before the tab is exposed; scanner results depend on configured sources and completed scan jobs.

~~~mermaid
flowchart TD
    A[Choose Automated Alert Center] --> B{eAssist security permission}
    B -->|Denied| C[Hide tab or route to Integrations]
    B -->|Allowed| D[Load security alerts and scan status]
    D --> E[Show findings from configured scanners]
    E --> F{User action}
    F -->|Refresh/acknowledge| G[Update alert state]
    F -->|Configure scanner| H[Open guided scanner setup]
    F -->|Run or inspect scan| I[Use scan API/worker]
    G --> D
    H --> J[Save connector configuration]
    I --> D
~~~

---

## Silences Page — file locations

**View:** Silences · **Route:** /service-review-center/eassist?view=silences

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Lists silences, filters labels, creates and removes silence actions
    ├── client-store.ts
    │   └── Refreshes records after a successful operation
    └── workspace.css
        └── Silence table, label matcher chips, and action dialogs

    app/api/eassist/route.ts
    └── Dispatches Alertmanager silence read/create/expire actions

    lib/eassist/
    ├── actions.ts
    │   └── Validates silence operations and security policy
    ├── transport.ts
    │   └── Sends authenticated Alertmanager API requests
    └── sync.ts
        └── Synchronizes current silence state

    db/migrations/0008_eassist.sql
    └── Stores connection and operational action state

A silence is a time-bounded suppression rule in the connected Alertmanager, based on label matchers, author, and reason. Creating or expiring one changes the source system and is subject to write permission and confirmation settings.

~~~mermaid
flowchart TD
    A[Choose Silences] --> B[Load current silence records]
    B --> C[Filter/group current and expired silences]
    C --> D{Choose action}
    D -->|Create| E[Enter matchers, author, reason, and time range]
    E --> F[Validate write policy and source connection]
    F --> G[Create silence in Alertmanager]
    D -->|Expire| H[Confirm expiration action]
    H --> I[Expire silence in Alertmanager]
    G --> J[Refresh eAssist snapshot]
    I --> J
~~~

---

## Incidents Page — file locations

**View:** Incidents · **Route:** /service-review-center/eassist?view=incidents

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Incident list, selected incident details, work notes, comments, state updates, and alert linking
    ├── client-store.ts
    │   └── Refreshes incident records after an operation
    └── workspace.css
        └── Incident list, detail fields, tabs, and operation dialogs

    app/api/eassist/route.ts
    └── Dispatches incident read/create/update operations

    lib/eassist/
    ├── actions.ts
    │   └── Validates incident actions, confirmation, and duplicate submissions
    ├── transport.ts
    │   └── Authenticated external ServiceNow requests
    ├── sync.ts
    │   └── Imports incident records and alert links
    └── organization-alerts.ts
        └── Shared alert lifecycle and incident association helpers

    db/migrations/
    ├── 0008_eassist.sql
    ├── 0014_platform_alert_identity.sql
    ├── 0039_organization_alerts.sql
    └── 0078_alert_occurrences.sql
        └── Source records, shared alert identity, and occurrence history

Incident details are read from the configured service-management connection. Creating or updating an incident is a write to that external source, so the enabled eAssist write policy and the source-system account permissions apply. The UI preserves work notes and customer-visible comments as separate fields.

~~~mermaid
flowchart TD
    A[Choose Incidents] --> B[Load synced incident records]
    B --> C{Open an incident or create one}
    C -->|Open| D[Load selected incident details and related tasks]
    C -->|Create from alert| E[Build incident draft from alert evidence]
    D --> F{Update fields or add notes}
    E --> F
    F --> G[Validate write policy and connection]
    G --> H[Submit operation to service-management API]
    H --> I[Refresh incident and alert snapshot]
~~~

---

## Task Templates Page — file locations

**View:** Task Templates · **Route:** /service-review-center/eassist?view=templates

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Template list/details, form validation, task launch, and task history
    ├── Terminal.tsx
    │   └── Live task output, approval controls, stop action, and log export
    ├── client-store.ts
    │   └── Snapshot refresh and operation submission
    └── workspace.css
        └── Template cards, task tables, dialogs, and terminal panel

    app/api/eassist/route.ts
    └── Dispatches template, task launch, task status, output, approval, and stop operations

    lib/eassist/
    ├── actions.ts
    │   └── Validates template writes and launch approval state
    ├── transport.ts
    │   └── Authenticated automation-runner API transport
    ├── sync.ts
    │   └── Synchronizes templates and task state
    └── security.ts
        └── Enforces run limits, source write policy, and confirmation requirements

    db/migrations/0008_eassist.sql
    └── Stores operation request keys, task results, security policy, and launch approvals

The Templates page manages supported automation playbooks and shows task history. Launching a template is an external operation. Depending on Security settings, it may require a short-lived confirmation token. eAssist records the request/result so a retry does not blindly create a duplicate run.

~~~mermaid
flowchart TD
    A[Choose Task Templates] --> B[Load templates and task history]
    B --> C{Choose action}
    C -->|Create/edit template| D[Validate fields and save through runner]
    C -->|Launch template| E[Check run policy and concurrency limit]
    E --> F{Confirmation required?}
    F -->|Yes| G[Issue short-lived single-use approval]
    G --> H[Confirm launch]
    F -->|No| H
    H --> I[Submit idempotent task launch]
    I --> J[Open Terminal and poll task output]
    J --> K[Show completion state and exportable log]
~~~

---

## Schedule Page — file locations

**View:** Schedule · **Route:** /service-review-center/eassist?view=schedules

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Lists, creates, edits, enables/disables, and removes automation schedules
    ├── client-store.ts
    │   └── Loads current schedule records and posts changes
    └── workspace.css
        └── Schedule table, forms, and confirmation dialogs

    app/api/eassist/route.ts
    └── Dispatches schedule CRUD operations to the connected automation system

    lib/eassist/
    ├── actions.ts
    │   └── Validates schedule changes and delete policy
    ├── transport.ts
    │   └── Authenticated automation-runner requests
    └── sync.ts
        └── Synchronizes saved schedule state

    db/migrations/0008_eassist.sql
    └── Stores eAssist connections and operational action records

Schedules represent recurring task execution in the connected automation runner. The cron expression, template, enabled state, and permissions are validated before changes are sent to that system. Removing or changing a schedule affects the external runner.

~~~mermaid
flowchart TD
    A[Choose Schedule] --> B[Load schedules from snapshot]
    B --> C{Create, edit, toggle, or delete}
    C -->|Create/edit| D[Validate template, cron, and variables]
    C -->|Toggle/delete| E[Check source write/delete policy]
    D --> F[Submit schedule change]
    E --> F
    F --> G[Automation runner saves schedule]
    G --> H[Refresh eAssist snapshot]
~~~

---

## Inventory Page — file locations

**View:** Inventory · **Route:** /service-review-center/eassist?view=inventory

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Inventory list, detail forms, search, and resource actions
    ├── client-store.ts
    │   └── Snapshot loading and operation submission
    └── workspace.css
        └── Inventory resource table and editor

    app/api/eassist/route.ts
    └── Dispatches inventory list/create/update/delete operations

    lib/eassist/
    ├── types.ts
    │   └── Inventory resource form fields and data types
    ├── actions.ts
    │   └── Validates and authorizes resource actions
    ├── transport.ts
    │   └── Automation-runner request handling
    └── sync.ts
        └── Imports current inventory records

    db/migrations/0008_eassist.sql
    └── Stores connection and action state

Inventory resources describe target hosts or files used by automation templates. Create, edit, and delete operations are sent to the connected runner and remain subject to security policy and the runner's own access rules.

~~~mermaid
flowchart TD
    A[Choose Inventory] --> B[Load current inventory]
    B --> C{Choose action}
    C -->|Search/open| D[Filter and inspect inventory]
    C -->|Create/edit| E[Validate name, type, contents, and key references]
    C -->|Delete| F[Check delete policy and confirmation]
    E --> G[Send validated resource change]
    F --> G
    G --> H[Refresh snapshot and show result]
~~~

---

## Variable Groups Page — file locations

**View:** Variable Groups · **Route:** /service-review-center/eassist?view=environment

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Variable group list and editor form
    ├── client-store.ts
    │   └── Loads snapshot and submits resource operations
    └── workspace.css
        └── Variable group cards, form, and JSON input styling

    app/api/eassist/route.ts
    └── Dispatches variable-group CRUD operations

    lib/eassist/
    ├── types.ts
    │   └── Variable group form fields for JSON values and environment variables
    ├── actions.ts
    │   └── Validates operation and security rules
    ├── transport.ts
    │   └── Automation-runner API transport
    └── sync.ts
        └── Synchronizes current variable group records

    db/migrations/0008_eassist.sql
    └── Stores connection metadata and action state

Variable groups provide task variables/environment values to automation templates. The page edits the connected runner's resource. Treat secrets in variables as sensitive; they are handled according to the connected runner and configured source permissions.

~~~mermaid
flowchart TD
    A[Choose Variable Groups] --> B[Load variable group records]
    B --> C{Create, edit, or delete}
    C -->|Create/edit| D[Validate JSON and required fields]
    C -->|Delete| E[Check delete permission and confirm]
    D --> F[Submit resource operation]
    E --> F
    F --> G[Runner updates variable group]
    G --> H[Refresh current records]
~~~

---

## Key Store Page — file locations

**View:** Key Store · **Route:** /service-review-center/eassist?view=keys

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Key listing and credential create/update/delete dialogs
    ├── client-store.ts
    │   └── Loads only safe snapshot fields and submits operations
    └── workspace.css
        └── Key table and protected credential form styling

    app/api/eassist/route.ts
    └── Dispatches key-store operations

    lib/eassist/
    ├── types.ts
    │   └── Key resource fields and safe data types
    ├── actions.ts
    │   └── Validates key actions and security policy
    ├── transport.ts
    │   └── Authenticated calls to the automation runner
    └── security.ts
        └── Credential, write, and delete safeguards

    db/migrations/0008_eassist.sql
    └── Stores encrypted connection credentials and operational audit state

The Key Store manages credential references in the connected automation system. Secret values are not returned in the eAssist snapshot. Creating or rotating keys requires sending a new value through the protected form; deletion is separately guarded.

~~~mermaid
flowchart TD
    A[Choose Key Store] --> B[Load key metadata without secret values]
    B --> C{Create, rotate, or delete}
    C -->|Create/rotate| D[Enter secret in protected form]
    C -->|Delete| E[Check delete policy and confirm]
    D --> F[Validate write permission]
    E --> F
    F --> G[Send credential operation to runner]
    G --> H[Store only safe metadata/result in eAssist]
~~~

---

## Repositories Page — file locations

**View:** Repositories · **Route:** /service-review-center/eassist?view=repositories

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Repository listing, create/edit forms, and access-key references
    ├── client-store.ts
    │   └── Loads and refreshes repository records
    └── workspace.css
        └── Repository table and configuration dialog

    app/api/eassist/route.ts
    └── Dispatches repository CRUD operations

    lib/eassist/
    ├── types.ts
    │   └── Repository URL, branch, and access-key form contract
    ├── actions.ts
    │   └── Validates repository operations and policy
    ├── transport.ts
    │   └── Automation-runner transport
    └── security.ts
        └── Enforces write/delete safeguards

    db/migrations/0008_eassist.sql
    └── Stores connection, operation, and activity metadata

Repositories connect automation templates to source-control content using a configured URL, branch, and runner key reference. eAssist stores the connection credential separately and does not infer that a repository is reachable simply because its settings are saved.

~~~mermaid
flowchart TD
    A[Choose Repositories] --> B[Load configured repository records]
    B --> C{Create, edit, or delete}
    C -->|Create/edit| D[Validate URL, branch, and key reference]
    C -->|Delete| E[Check delete policy and confirm]
    D --> F[Send repository change to runner]
    E --> F
    F --> G[Refresh repository snapshot]
~~~

---

## Integrations Page — file locations

**View:** Integrations · **Route:** /service-review-center/eassist?view=integrations

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Connector list, add/edit/test/enable/delete dialogs, and webhook-token display
    ├── client-store.ts
    │   └── Loads connection status and posts connector actions
    └── workspace.css
        └── Integration cards, forms, and connection-state badges

    app/api/eassist/
    ├── route.ts
    │   └── Creates, updates, tests, enables, disables, and removes eAssist connections
    ├── webhook/route.ts
    │   └── Alertmanager incoming webhook ingestion
    ├── worker/route.ts
    │   └── Scheduled connector synchronization
    └── events/route.ts
        └── Reports snapshot revisions to the browser

    lib/eassist/
    ├── actions.ts
    │   └── Validates connector configuration and connection operations
    ├── transport.ts
    │   └── Encrypts/uses credentials and restricts outbound requests
    ├── sync.ts
    │   └── Reads records from Prometheus, Alertmanager, Semaphore, and ServiceNow
    ├── store.ts
    │   └── Persists connection metadata and snapshots
    └── types.ts
        └── Connection kind and safe connection fields

    db/migrations/0008_eassist.sql
    └── Base connections, encrypted secrets, webhook hashes, records, operations, and activity

Supported connection kinds in the current implementation are Alertmanager, ServiceNow, Semaphore, and Prometheus. Credentials are encrypted at rest and omitted from browser snapshots. A configured connection may still be unverified or report an error until its endpoint, credentials, network policy, and source permissions are correct. The UI generates an Alertmanager webhook token for inbound alert delivery when configured.

~~~mermaid
flowchart TD
    A[Choose Integrations] --> B[Load safe connection snapshot]
    B --> C{Add, edit, test, enable, or remove}
    C -->|Add/edit| D[Validate URL, system, auth, and project settings]
    C -->|Test| E[Call source with server-held credentials]
    C -->|Enable/remove| F[Check operation policy]
    D --> G[Encrypt and save credential/config]
    E --> H[Show verified/error state]
    F --> I[Update connection state]
    G --> J[Schedule source sync]
    H --> J
    I --> J
    J --> K[Refresh snapshot]
~~~

---

## Team Page — file locations

**View:** Team · **Route:** /service-review-center/eassist?view=users

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Lists remote automation users and manages supported role assignments
    ├── client-store.ts
    │   └── Loads current snapshot and submits user operations
    └── workspace.css
        └── Team table and role-editing dialogs

    app/api/eassist/route.ts
    └── Dispatches remote team-user operations

    lib/eassist/
    ├── types.ts
    │   └── Team user and supported automation role form fields
    ├── actions.ts
    │   └── Checks and dispatches user/role changes
    ├── transport.ts
    │   └── Authenticated automation-runner API requests
    └── organization-context.ts
        └── Identifies acting Admin for shared operations

    db/migrations/0008_eassist.sql
    └── Stores connection and action audit data

Team lists users from the connected automation system; it does not create AIForce.Ops workspace accounts or change their Agent Studio roles. Remote role changes affect the automation system and must also satisfy eAssist's write policy.

~~~mermaid
flowchart TD
    A[Choose Team] --> B[Load connected runner users]
    B --> C[Show remote user and role details]
    C --> D{Change remote role?}
    D -->|No| E[Continue viewing team]
    D -->|Yes| F[Validate source and write policy]
    F --> G[Send role update to runner]
    G --> H[Record operation/activity]
    H --> I[Refresh team list]
~~~

---

## Activity Page — file locations

**View:** Activity · **Route:** /service-review-center/eassist?view=activity

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Activity list, search/filter, source labels, and operation details
    ├── client-store.ts
    │   └── Reloads activity from the latest snapshot
    └── workspace.css
        └── Activity timeline, state badges, and detail rows

    app/api/eassist/
    ├── route.ts
    │   └── Returns activity and operation state in the eAssist snapshot
    └── events/route.ts
        └── Announces new revisions

    lib/eassist/
    ├── store.ts
    │   └── Reads/writes eAssist activity and operation records
    ├── actions.ts
    │   └── Records external operation outcomes
    ├── platform.ts
    │   └── Platform event, delivery, and error helpers
    └── organization-context.ts
        └── Maps changes to the shared operations owner

    db/migrations/
    ├── 0008_eassist.sql
    │   └── eAssist activity and operation history
    ├── 0013_platform_operations.sql
    ├── 0016_operations_delivery_events.sql
    └── 0042_organization_activity_live.sql
        └── Platform events, deliveries, and shared activity state

Activity shows operational actions recorded by eAssist and related platform activity in the available snapshot. It is an audit/history view, not a complete external source-system audit log.

~~~mermaid
flowchart TD
    A[Choose Activity] --> B[Load recorded activity and operations]
    B --> C[Apply search/source filters]
    C --> D[Show actor, action, target, and time]
    D --> E{New operation or revision?}
    E -->|Yes| F[Refresh snapshot]
    F --> B
~~~

---

## Status Page — file locations

**View:** Status · **Route:** /service-review-center/eassist?view=status

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Connection/source state, last check, and error details
    ├── client-store.ts
    │   └── Snapshot refresh and live event state
    └── workspace.css
        └── Status badges, source rows, and error display

    app/api/eassist/
    ├── route.ts
    │   └── Returns current connection states and last errors
    ├── events/route.ts
    │   └── Exposes live organization revision state
    └── worker/route.ts
        └── Runs scheduled connector synchronization when invoked with worker token

    lib/eassist/
    ├── sync.ts
    │   └── Connector synchronization, leases, and source health updates
    ├── store.ts
    │   └── Connection status and last-checked values
    └── transport.ts
        └── Outbound connection and response validation

Status is a snapshot of the app's most recent synchronization/check result for each connection. “Live” in the website header refers to the browser event stream and does not replace per-source state. A source error does not erase previously stored records.

~~~mermaid
flowchart TD
    A[Choose Status] --> B[Read current connection snapshot]
    B --> C[Show enabled state, source state, and last check]
    C --> D{Source reports error or stale check?}
    D -->|No| E[Show current connection status]
    D -->|Yes| F[Show error and recovery context]
    F --> G[Retry/test or inspect Integrations]
    G --> H[Sync source and refresh snapshot]
~~~

---

## Security Page — file locations

**View:** Security · **Route:** /service-review-center/eassist?view=security

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Loads the saved security policy and provides save handling
    ├── Security.tsx
    │   └── Run/write/delete/HTTPS/confirmation/concurrency controls and credential notes
    └── workspace.css
        └── Security configuration layout and controls

    app/api/eassist/route.ts
    └── Persists security policy through the validated operation dispatcher

    lib/eassist/
    ├── actions.ts
    │   └── Enforces policy for each operation
    ├── security.ts
    │   └── Security policy validation and operation safeguards
    ├── transport.ts
    │   └── Outbound origin allowlist, HTTPS policy, and credential use
    └── store.ts
        └── Persists and retrieves the security policy

    db/migrations/0008_eassist.sql
    └── eassist_security policy, launch approvals, and connection data

Security controls apply server-side to task runs and source-system changes: allow runs, allow writes, allow deletes, require HTTPS, require confirmation, and limit concurrent runs. The connected external system enforces its own permissions as well. The UI never receives saved connection secrets.

~~~mermaid
flowchart TD
    A[Choose Security] --> B[Load saved eAssist security policy]
    B --> C[Edit operation and transport controls]
    C --> D[Save policy]
    D --> E[Validate policy on server]
    E --> F[Persist policy]
    G[Future eAssist action] --> H[Read current policy]
    H --> I{Action allowed and confirmed?}
    I -->|Yes| J[Execute source request]
    I -->|No| K[Reject before source change]
~~~

---

## Settings Page — file locations

**View:** Settings · **Route:** /service-review-center/eassist?view=settings

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Alert delivery accounts, routing/configuration controls, and settings panels
    ├── client-store.ts
    │   └── Loads state and submits settings updates
    └── workspace.css
        └── Settings forms and delivery-state presentation

    app/api/eassist/route.ts
    └── Dispatches eAssist settings and alert-delivery operations

    app/api/workspace/
    ├── admin/mail/route.ts
    └── request-notifications/route.ts
        └── Related configured mail delivery and workspace notification endpoints

    lib/eassist/
    ├── actions.ts
    ├── organization-alerts.ts
    ├── platform.ts
    └── store.ts
        └── Settings operations, organization alert delivery state, and persistence

    db/migrations/
    ├── 0008_eassist.sql
    ├── 0013_platform_operations.sql
    ├── 0016_operations_delivery_events.sql
    └── 0039_organization_alerts.sql
        └── eAssist settings, platform delivery, and shared alert state

The Settings view is for eAssist operational settings and alert delivery configuration. It is distinct from the Security page's policy toggles and from Agent Studio account Settings. Delivery state reflects the configured application workflow; it is not proof that a recipient's mail system accepted or displayed a message.

~~~mermaid
flowchart TD
    A[Choose Settings] --> B[Load eAssist operational and delivery settings]
    B --> C[Review alert recipients/routing]
    C --> D{Save a permitted change?}
    D -->|No| E[Continue viewing settings]
    D -->|Yes| F[Validate Admin access and configuration]
    F --> G[Persist settings]
    G --> H[Refresh delivery and alert state]
~~~

---

## Help Page — file locations

**View:** Help · **Route:** /service-review-center/eassist?view=help

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Static help content and navigation to relevant eAssist sections
    └── workspace.css
        └── Help cards and text layout

    app/service-review-center/
    ├── data-sources.tsx
    └── review-assistant.tsx
        └── Related Review Center source guidance and assistant access

Help content is rendered in the eAssist workspace; it does not call a separate help API. Its guidance describes the current application flows and links back to source/integration configuration.

~~~mermaid
flowchart TD
    A[Choose Help] --> B[Render eAssist guidance]
    B --> C{Need more information?}
    C -->|Connection/source| D[Open Integrations or Status]
    C -->|Alert behavior| E[Open Alerts or Silences]
    C -->|Task behavior| F[Open Task Templates]
~~~

---

## Terminal and task output panel — file locations

**Feature:** Task Terminal · Opens from a launched task or task-history entry

    app/service-review-center/eassist/
    ├── workspace.tsx
    │   └── Opens selected task terminal and supplies connection/task identifiers
    ├── Terminal.tsx
    │   └── Polls task output, follows logs, confirms/rejects pending launch, stops task, and exports output
    ├── client-store.ts
    │   └── Sends terminal actions through the shared eAssist endpoint
    └── workspace.css
        └── Terminal overlay, tabs, and responsive behavior

    app/api/eassist/route.ts
    └── Dispatches task.output, task.stop, and task approval operations

    lib/eassist/
    ├── actions.ts
    │   └── Validates task operation, approval token, and idempotency
    ├── transport.ts
    │   └── Reads task output and sends stop/confirmation requests
    └── types.ts
        └── Terminal status and output shapes

The terminal polls while a task is active and stops polling at a terminal state. A confirmation token is short-lived and single-use. Exported logs are generated from the output currently loaded in the browser.

~~~mermaid
flowchart TD
    A[Launch task or open task history] --> B[Open Terminal panel]
    B --> C[Poll task status and output]
    C --> D{Task state}
    D -->|Waiting confirmation| E[Confirm or reject]
    D -->|Running| F[Continue polling; optionally stop]
    D -->|Finished| G[Stop polling and show final output]
    E --> C
    F --> C
    G --> H[Copy/view/export loaded log]
~~~

---

## eAssist operation API and data flow

    Browser eAssist view
      → app/service-review-center/eassist/workspace.tsx
      → app/service-review-center/eassist/client-store.ts
      → GET or POST /api/eassist
      → lib/eassist/actions.ts and lib/eassist/transport.ts
      → configured Prometheus, Alertmanager, Semaphore, or ServiceNow endpoint
      → normalized snapshot in lib/eassist/store.ts
      → browser refreshes by revision event

    Scheduled collection
      → POST /api/eassist/worker with EASSIST_WORKER_TOKEN
      → lib/eassist/sync.ts claims due connections and synchronizes sources
      → eassist_records and related Review Center readings
      → app/api/eassist/events/route.ts notifies connected browsers

    Incoming Alertmanager webhook
      → POST /api/eassist/webhook?connection={connectionId}
      → Validate connection and hashed webhook token
      → Validate bounded alert payload
      → Store alerts and import current source state

    Service Review Center consumers
      → lib/service-review/bridge.ts maps eAssist records to review readings
      → app/api/service-review-center/records/route.ts serves shared readings
      → Observability, AI Ops, Executive Summary, Data Sources, and Geo Health views

    db/migrations/
    ├── 0008_eassist.sql
    │   └── Connections, normalized records, operations, activity, revisions, and security policy
    ├── 0010_review_connectors.sql
    │   └── Connector source metadata and imported Review Center records
    ├── 0013_platform_operations.sql
    ├── 0014_platform_alert_identity.sql
    ├── 0016_operations_delivery_events.sql
    ├── 0039_organization_alerts.sql
    ├── 0040_shared_operations.sql
    ├── 0041_shared_security_resources.sql
    ├── 0042_organization_activity_live.sql
    └── 0078_alert_occurrences.sql
        └── Shared platform events, alerts, security state, and occurrence history

Connection secrets are encrypted at rest, never returned to the browser, and used only by server-side transport. Outbound URLs are constrained by the configured origin policy; redirects are blocked. Repeated action requests use request keys and saved outcomes where supported. External system permissions and availability still apply.

