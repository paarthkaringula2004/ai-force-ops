# Render deployment

This is a Node web service, not a static site. Deploy the current source and lockfile.
The included render.yaml describes a paid Starter instance because this project uses Gmail SMTP.
Nothing in this repository automatically creates or purchases a Render service.

## Exact settings for the existing Render service

| Setting | Value |
| --- | --- |
| Root directory | Directory containing package.json (repository root in this checkout) |
| Runtime | Node 22 |
| Build command | `npm ci && npm run build` |
| Start command | `npm run render:start` |
| Health check | `/api/health` |
| Compute | Paid instance for Gmail SMTP and unattended processing |

The start command binds to 0.0.0.0 on Render's PORT. Do not hardcode port 3000 on Render.
It initializes the installed Better Auth schema, applies every application SQL migration,
then starts Next.js, the integration/retention worker and the mail worker. Failed migrations
prevent startup. Migrations are serialized using PostgreSQL advisory locks and existing
application migrations are skipped. Keep a database backup before any production upgrade.
This startup migration path does not need Render's paid pre-deploy-command feature.
A separate migration job may be used with RENDER_RUN_MIGRATIONS=false only after it succeeds.

## Private environment import

The ignored `.env` in this workspace is the Render import file. In the existing service,
choose Environment > Add from .env, select this file, inspect the proposed values and save,
rebuild and deploy. Do not commit, publish, email or attach this file to a public ticket.
The file already carries existing local secrets; they are not recreated during startup.
`.env.local` preserves the original laptop settings and is also ignored by Git.
`.env.example` was removed at the owner's request; this document is the public reference.
Next.js and operational scripts load .env.local on the laptop; the Render launcher ignores it.
Real hosting environment variables override files.

The prepared public origin is https://ai-force-ops.onrender.com. If you deploy under another
hostname, update BETTER_AUTH_URL, NEXT_PUBLIC_AIFORCE_URL, EASSIST_APP_URL,
SECURITY_SCAN_APP_URL, SECURITY_SCAN_TARGET_URL and the OAuth callback URLs before deployment.
Never import laptop localhost URLs into Render. Imported environment files do not expand
references such as ${OTHER_VARIABLE}; each value must be complete.

Run `npm run render:check` to validate the import without printing values or contacting providers.

### Variable reference

| Variables | Purpose |
| --- | --- |
| DATABASE_URL | Hosted PostgreSQL connection string with provider-required TLS settings. Use the same database to retain accounts and records. |
| BETTER_AUTH_SECRET | Stable session/encryption secret. Preserve when reusing encrypted integrations. |
| BETTER_AUTH_URL, NEXT_PUBLIC_AIFORCE_URL | Public HTTPS application origin. |
| OPENAI_API_KEY | Server-side model access. Never prefix a secret with NEXT_PUBLIC_. |
| AUTH_DISABLE_SIGNUP | false allows registration; true closes registration after approved accounts exist. |
| RENDER_RUN_MIGRATIONS | true initializes auth and applies all SQL migrations before serving. |
| RENDER_RUN_WORKERS | true runs integration sync/retention and mail workers in the web process supervisor. |
| EASSIST_WORKER_TOKEN, MAIL_WORKER_TOKEN | Independent internal bearer secrets, at least 32 characters. |
| EASSIST_APP_URL | Public origin for separately hosted integration workers. Bundled workers call the loopback server. |
| EASSIST_ALLOWED_ORIGINS | Comma-separated approved integration API origins. |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS | SMTP account; Gmail uses an app password. Free Render blocks SMTP 25/465/587. |
| MAIL_ENCRYPTION_KEY | 32-byte key encoded as 64 hex characters. Preserve for encrypted mail. |
| OPENAI_ADMIN_ROUTER_MODEL | Interpreter model, or selected to follow the Playground model. |
| OPENAI_EMPLOYEE_ROUTER_MODEL | Optional interpreter override; unset uses selected model. |
| REVIEW_CHAT_ENABLE_PAID_AI, REVIEW_CHAT_NATURAL_AI, REVIEW_CHAT_MODEL | Explicit paid Review Center reply settings. These calls incur usage. |
| VULNERABILITY_ENABLE_PAID_AI | Optional paid vulnerability analysis. |
| EPACE_REQUESTS_PER_MINUTE, EPACE_REQUESTS_PER_DAY, EPACE_DAILY_TOKEN_LIMIT | Per-account usage ceilings. |
| EPACE_REQUIRE_SAFETY, EPACE_BLOCK_FLAGGED | Safety controls. |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Optional Google sign-in. |
| GOOGLE_MEET_CLIENT_ID, GOOGLE_MEET_CLIENT_SECRET, GOOGLE_MEET_REDIRECT_URI | Meet OAuth; can instead be configured encrypted in Meeting Rooms. |
| TEAMS_TENANT_ID, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_REDIRECT_URI | Optional Teams fallback; app setup is supported. |
| ARCJET_KEY | Optional extra request protection. |
| CRON_SECRET | Optional authenticated agent-bin purge scheduler. |

No Razorpay secrets are required in this file: configure payment integration and Plan IDs
through the deployed Admin UI. Configure its public HTTPS webhook/callback and policies there.
Existing encrypted integrations carry over only with the same database and encryption secret.

## Background processing and scanners

The bundled workers use the local HTTP server rather than hairpinning through the public proxy.
Mail content still uses the public BETTER_AUTH_URL for links.
For independently scaled web instances, set RENDER_RUN_WORKERS=false and run dedicated
workers with `npm run eassist:worker` and `npm run mail:worker`. Share their bearer secrets
with the web service; their application URL must be the public application origin.
Do not rely on a Free web service remaining awake for background jobs.

RENDER_RUN_SECURITY_WORKER=false is intentional: standard Render Node services do not include
Java/ZAP/Trivy. Use an equipped worker machine/container for actual security scans, with:

- Start command `npm run security:worker`.
- SECURITY_SCAN_APP_URL = public app origin.
- SECURITY_SCAN_TARGET_URL = the explicitly approved target origin.
- SECURITY_SCAN_WORKER_TOKEN = the same value on app and worker.
- SECURITY_SCAN_SOURCE_DIR = the checkout on that machine when source scanning is needed.
- SECURITY_JAVA_PATH, SECURITY_ZAP_JAR, SECURITY_TRIVY_PATH = installed executable/JAR paths,
  or install under the documented .security-tools layout.

Setting a token alone does not install scanners or produce scan results.
See automated-security-scans.md for scanner installation and scope restrictions.

## External callbacks and first deployment verification

Register exact provider callbacks before reconnecting OAuth:

- Google login: https://ai-force-ops.onrender.com/api/auth/callback/google
- Google Meet: https://ai-force-ops.onrender.com/api/google-meet/callback
- Teams: https://ai-force-ops.onrender.com/api/teams/callback

For each deploy verify:

1. Build succeeds; startup logs show successful auth and SQL migration completion.
2. /api/health returns 200, database connected and schema ready.
3. Sign-in, verification email delivery, session persistence and all four role navigation work.
4. Saved records/images survive redeployment (they live in PostgreSQL, not ephemeral files).
5. Integration Test & sync succeeds; deployed Alertmanager webhooks use the public URL.
6. Workers update health/activity with no browser open.
7. OAuth flows return to the public domain and provider connections are valid.
8. Payment provider Test-mode checkout, signed webhook and replay controls pass before Live mode.

Local tests do not verify Render network policy, DNS, provider credentials, SMTP acceptance,
OAuth registrations, actual external scanners or live payment configuration.

References:
- https://render.com/docs/deploy-nextjs-app
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
