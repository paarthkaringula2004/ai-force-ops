# Continuous security workflow

Open the Review Center **Super assistant**. The standalone Vulnerability reports URL redirects to it. eAssist has a separate **Automated Alert Center**, and the same live security feed is available inside the assistant.

## Commands and interfaces

- `Enable continuous monitoring`: persist an owner-scoped continuous schedule. The worker queues the next cycle after completion, without a five-minute or daily wait. `Pause continuous monitoring` stops future cycles, not a scan already running. Reloading/opening the app preserves an explicit pause.
- `Show monitoring status`: live worker heartbeat, job phase and progress.
- `Show findings` / `Import report`: in-chat evidence interface with filters, source preview, CSV/XLSX/Nmap XML imports and validated column mapping.
- `Add scanner tools` / `Integrate manually`: in-chat API configuration, test, mapping and encrypted credential storage. ZAP API reads existing passive findings; the JSON API adapter maps compatible scanner results. All schema fields can be mapped. Connections can be paused/resumed inside the chat.
- `Show alerts`: live eAssist security alerts, acknowledgment and monitor status.
- `Give me Excel` / `Download CSV`: initiate a browser attachment download from the latest completed scan. Download actions run only for a newly submitted request; reload/history do not repeat them. Browser download settings remain authoritative.

New chat, history, reload and the ePACE Markdown composer remain available. Conversation/actions are persisted; credentials from the integration form are not included in chat. This is a deterministic workflow assistant, not a general agent that can install arbitrary programs or execute arbitrary commands.

## Real scanner coverage

ZAP 2.17.0 checks nine fixed public GET routes through its loopback-only, randomly keyed API. No redirects, login credentials, form submissions or active attack payloads are used. Trivy 0.75.0 checks supported dependencies, infrastructure configuration and possible secrets in the configured source checkout; secret values are redacted. Generated files, installed dependencies, Git history and scanner binaries are excluded.

Authenticated application workflows, active XSS/injection testing, business logic, cloud infrastructure and breach investigation are **not assessed** by this baseline. Nmap has programmatic XML output but no built-in REST API; native Nmap execution is not enabled here. Juice Shop is a deliberately vulnerable test application, not a scanner API.

## Backend behavior

Apply all current migrations, including **0043** for the shared organization schedule. The authenticated scanner worker registers continuous monitoring for the active organization owner when no schedule exists, independently of page visits and login. All Admins read and control that same schedule. Explicit pauses are never reset by worker startup or login. The persisted schedule continues with no browser open.

The worker runs scan cycles sequentially with a global job lease and one active job per account. Continuous cycles bypass the old eight-per-day manual launch limit. Scanner failures have a short retry backoff. Heartbeats and job progress are durable; stopped jobs expire after three minutes without a heartbeat. API collectors run independently of scan completion, synchronize compatible results on a ten-second cadence, and use two-minute collection leases to prevent overlapping syncs. These are background polling/cycles, not instantaneous event detection.

Findings are deduplicated by account/source/asset/finding identity. Unchanged observations refresh their observed timestamps without creating revisions or repeated finding alerts. Changed urgent findings update/reopen the same alert; acknowledged unchanged alerts stay acknowledged. Missing observations are not silently treated as fixed. Critical/high findings and worker failures create eAssist alerts; low/informational observations remain in reports. The interface checks the database every five seconds. No email, Slack or external notification destination is configured.

CSV is flattened, formula escaped, UTF-8, and omits entirely empty optional columns. Excel includes Summary, Findings, Analysis, Coverage and Remediation with filters, frozen headers, suitable widths and wrapped full text. Completed scans retain immutable evidence snapshots. There is no automatic deletion of earlier scan history; production operators must size and manage retention for continuous operation.

## Local setup

`npm run dev` launches website and security worker together and restarts a stopped worker. Keep the terminal and computer running. This checkout already has the free local tools configured. A new operator machine needs `scripts/setup-security-tools.ps1`, `npm run db:migrate`, and environment configuration:

- `SECURITY_SCAN_APP_URL=http://localhost:3000`
- `SECURITY_SCAN_TARGET_URL=http://localhost:3000`
- `SECURITY_SCAN_WORKER_TOKEN`: shared random secret, at least 32 characters
- `SECURITY_SCAN_SOURCE_DIR`: optional approved source checkout

Additional API origins must be approved in `EASSIST_ALLOWED_ORIGINS` on the server before credentials can be sent to them. Redirects are refused. Credentials use authenticated encryption with the existing application secret. API responses are bounded to 4 MB / 5,000 findings. Authentication supports none, bearer, basic, and API-key headers. Unsupported APIs need a dedicated adapter; saving a URL alone does not implement their scan-launch protocols.

`REVIEW_CHAT_ENABLE_PAID_AI=false` and `VULNERABILITY_ENABLE_PAID_AI=false` keep this workflow free of model API charges. Other project AI features retain their own configuration.

## Render

This change has not deployed Render. Apply current migrations, set approved HTTPS target/application origins and matching worker secret, and keep the scanner on an always-running computer/server with ZAP, Java and Trivy installed. Production `npm start` now supervises the website, scanner, integration and mail workers together, restarting workers after an unexpected exit. On deployments with separately managed workers, use `npm run start:web` for the website and the existing worker commands on their respective hosts. The process supervisor is not an operating-system service: stopping the host, closing the terminal, or platform sleep stops local work. Configure the hosting service to start/restart the command and keep it running. A sleeping/free web instance cannot guarantee 24/7 scanning.

## Verification

- `tests/shared-monitoring.mjs`: worker-only bootstrap without login/browser registration, preserved explicit pause, two Admin sessions sharing schedule/jobs/heartbeat/security alerts, shared acknowledgement and actual actor audit. PostgreSQL fixtures roll back.
- `tests/workspace-supervisor.mjs`: development and production commands, worker restart, clean shutdown and the separate web-only hosting option, without starting real services.
- `tests/organization-shared-operations.mjs`: shared integration records and organization alerts across Admins, access restrictions and acknowledgement/resolution audit.

Local verification on 9 October 2026 observed consecutive real ZAP/Trivy scan cycles and fresh scanner/integration heartbeats. The initial UI status now says **Checking worker status**, followed by the server heartbeat time; this loading transition does not start the worker. Production hosting uptime has not been verified or deployed by this change.

- `tests/review-chat-conversations.mjs`: owner isolation, history, idempotency and worker heartbeat.
- `tests/security-control-center.mjs`: disposable local API fixture, encryption, tested mapping, background sync, changed eAssist alerts, pause persistence and export actions. Temporarily approve `http://127.0.0.1:39091` in the local web server's EASSIST_ALLOWED_ORIGINS before running; remove it afterward. It never creates a company scanner integration.
- `tests/epace-markdown.mjs`: shared rich input behavior.
- Existing `tests/vulnerability-reports.mjs`: import/export/identity/history regression.

The browser verification downloaded an actual Excel attachment and inspected all five worksheets. Consecutive real ZAP/Trivy cycles were observed completing and updating PostgreSQL, with the next cycle starting automatically.

### Guided integration in chat

Ask **Add scanner tools** to enter a guided setup. The assistant asks for the connector type, name, API origin, endpoint and JSON field mapping, then authentication. Replies populate a session-only configuration draft; they are not submitted to the chat history endpoint. Credentials use a masked chat input and are sent only to the authenticated security-tools endpoint. Test the connection before choosing **Connect & synchronize**. The backend validates the API origin and mapping, encrypts credentials and enables its existing collector. New chat or Reload clears the draft. **Open integration interface** remains available for advanced manual mapping and only opens after a click. This flow connects supported findings APIs; it does not install arbitrary software.
