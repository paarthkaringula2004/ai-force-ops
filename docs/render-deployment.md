# Deploy AIForce.Ops to Render

Deploy the application as a **Node Web Service**, because authentication, integration requests, webhooks, and ePACE use server APIs and PostgreSQL. A static site cannot run these features.

Use the directory containing `package.json` as the Render root directory.

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Start command | `npm start -- --hostname 0.0.0.0` |
| Health check path | `/api/health` |
| Node version | Node 22 LTS |

Next.js reads Render's `PORT` environment variable. Do not set the port in a committed `.env` file or use `npm run dev` in production.

## Environment variables in the web service

| Variable | What to enter |
| --- | --- |
| `DATABASE_URL` | The reachable production PostgreSQL connection string, including the database provider's required TLS settings. A laptop database is not reachable as `localhost` from Render. |
| `BETTER_AUTH_URL` | The exact public HTTPS origin of this AIForce.Ops service, without a trailing slash or page path. Do not use the Alertmanager URL, Prometheus URL, or localhost. |
| `BETTER_AUTH_SECRET` | A stable private authentication/encryption secret. Preserve the existing value when reusing a database containing encrypted credentials. |
| `EASSIST_ALLOWED_ORIGINS` | `https://eassist-alertmanager.onrender.com,https://eassist-prometheus.onrender.com,https://semaphore-hgyh.onrender.com` (retain any other approved origins you need). |
| `OPENAI_API_KEY` | Your server-side API key, required for Agent Studio and ePACE model features. |
| `EASSIST_WORKER_TOKEN` | A private random secret of at least 32 characters, shared with the integration worker. |
| `CRON_SECRET` | A private secret if you configure the agent-bin purge job. |

Set secrets in Render's environment settings. Do not upload the local `.env` file. Changing the local allowlist does not update Render's environment settings.

## Database initialization

For a new database, initialize Better Auth's schema with the project's `npm run auth:migrate` command, then run `npm run db:migrate`. Review the authentication migration prompt and use the Better Auth version compatible with this project's installed package. The application migrations through `0009_epace.sql` are required. For an existing database, `npm run db:migrate` safely skips already applied application migrations.

Run migrations before directing users to the new service. A connection-only health check does not establish that all application tables exist.

Connections belong to their signed-in account and are stored in PostgreSQL. A different database or a different account will not automatically contain the locally configured integrations.

## Integration worker and webhook delivery

For synchronization while no browser is open, run a separate Render Background Worker from this project:

- Build command: `npm ci`
- Start command: `npm run eassist:worker`
- `EASSIST_APP_URL`: the public HTTPS origin of the deployed AIForce.Ops web service.
- `EASSIST_WORKER_TOKEN`: exactly the same value as on the web service.

After signing into the deployed web service, open eAssist → Integrations, confirm all three base URLs, and run **Test & sync** for each.

For Alertmanager push delivery, generate the webhook in the **deployed** app. Configure its displayed HTTPS webhook URL and private bearer token in Alertmanager. A webhook URL beginning with localhost points to the receiver's own machine, not the developer's laptop. A connected Alertmanager integration alone does not configure this receiver.

## Verify after deployment

1. `/api/health` returns HTTP 200 and `database: connected`.
2. Sign in successfully and open Agent Studio, Review Center, eAssist, and ePACE.
3. All three integrations show **Connected** after Test & sync.
4. A Prometheus query such as `up` returns the real source result. An empty result is possible when no scrape targets are configured.
5. With a webhook configured, send a test alert from Alertmanager and confirm delivery in eAssist.

Local production build and startup checks cannot verify Render's configured secrets, migrations, network access, or live webhook delivery. Those need the deployed application URL and the checks above.

References: [Next.js on Render](https://render.com/docs/deploy-nextjs-app), [port binding](https://render.com/docs/web-services#port-binding), [background workers](https://render.com/docs/background-workers).

## Monitoring added for this deployment

The app exposes `/api/metrics` as Prometheus text with application availability, PostgreSQL availability, and process uptime. It exposes no account data or credentials. The eAssist dashboard now imports real Prometheus targets, collected samples, scrape duration, and alert-rule state.

Set `BETTER_AUTH_URL=https://ai-force-ops.onrender.com` on the web service. Retain the same production database, account, and `BETTER_AUTH_SECRET` if you want the existing saved integrations to remain available. Otherwise configure the integrations after signing in to the new deployment.

The deployment repository's Prometheus configuration monitors Prometheus, Alertmanager, and `https://ai-force-ops.onrender.com/api/metrics`. Deploy this updated application before expecting its metrics target to be healthy. The ServiceUnavailable rule waits five minutes; the database rule waits two minutes. Alertmanager displays genuine active failures, so a healthy system can have zero alerts. No email or external notification recipient has been configured.

PowerShell task #3 fails in Semaphore itself because the deployed runner lacks the `powershell` executable. A successful OpenTofu task is not evidence that the PowerShell template can run. The task window now explains this and provides Confirm/Reject for tasks paused by the automation tool.
