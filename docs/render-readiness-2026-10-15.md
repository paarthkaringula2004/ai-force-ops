# Render readiness review — 15 October 2026

## Implemented

- Private .env prepared for Render import, with public production URLs and existing credentials preserved.
- Original laptop environment retained in ignored .env.local, including local OAuth callbacks.
- .env.example removed at the owner's request; deployment guide now holds the public variable reference.
- Node 22 deployment definition and Render-specific launcher bind 0.0.0.0 on PORT.
- Authentication schema initialization uses the installed Better Auth version, not an unpinned CLI download.
- All application migrations run before serving; existing files are skipped efficiently.
- Integration/retention and mail workers run under supervision; requests use loopback while email links stay public.
- Startup validates required variables without printing secrets and stops on invalid configuration or failed migrations.
- Scanner startup is explicit; the standard Node host is not presented as containing ZAP/Trivy/Java.
- Health readiness checks database connectivity and foundational schema presence.

## Verification

- Production build, TypeScript and scoped ESLint passed.
- npm ci dry run confirmed package/lockfile consistency.
- Fresh disposable PostgreSQL schema initialized authentication and all 67 SQL migrations, then reran successfully.
- Supervisor tests passed: host/port, worker restart/shutdown, web-only mode, optional scanner and public email URLs.
- Actual Render launcher served on test port 3102: health ready, sign-in HTML, auth session endpoint and anonymous protected API rejection passed.
- Local app restarted on port 3000; schema-ready health passed.
- Local/public environment separation, duplicate-name checks and Git-ignore checks passed.
- Earlier payment suite passed: ownership, fixed pricing, signed capture settlement, Test isolation, replay, outage and refund controls.
- Google Meet regression suite passed with mocked provider responses and disposable database schema.
- Membership billing passed: plan mapping, consent, ownership, cancellation, signed capture/replay, exact daily caps, offline rewards, renewal cycles and refund suspension.
- Payment transport passed: fixed destinations/methods, authentication, bounded JSON, no redirects/cache and sanitized failures.
- Teams/native meeting suite passed: encrypted credentials, OAuth/PKCE, expired states, token renewal, idempotent recovery, organizer binding, role/department invitations, recipient privacy, cancellation and CSRF.
- Tool-knowledge tests passed: ownership and role filtering, no-store responses, no credentials and explicit NULL for unconfigured bindings.
- No real provider payments, meetings or invitations were created by these tests.

## Remaining hosting/provider checks

No Render deployment was performed. Build/runtime checks ran on Windows; Docker's Linux daemon was unavailable.
A real Render build is still needed to verify the hosted Linux environment and provider networking.
The configured Gmail SMTP transport requires a paid Render web service. Free services block its SMTP ports.
Scans need an equipped external worker and the correct source checkout and approved target.
OAuth redirect registration, production webhooks, integration reachability and payment Test acceptance still require the deployed domain/provider setup.
Localhost-only APIs are not reachable from Render and must be hosted or connected through an approved network path.
Using the existing PostgreSQL database preserves existing accounts and application data; using a new database does not copy them.
For a fresh database, create and verify the first account, then use the existing bootstrap-workspace-admin script with that account email only if no Admin exists.

## Dependency audit

npm audit reported 8 findings: 5 high in development lint dependencies through braces, and 3 moderate through mammoth's CLI formatting dependency chain.
The installed braces 3.0.3 and sprintf-js 1.1.3 are also the latest published versions checked at review time; audit offered breaking downgrades rather than patched replacements.
No force downgrade was applied. Runtime mammoth use is extractRawText on a buffer, not its CLI. This narrows the observed exposure but is not a vulnerability waiver.
Review upstream fixes and rerun npm audit before organization production approval.
