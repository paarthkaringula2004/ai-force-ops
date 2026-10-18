# Aiven PostgreSQL connection and deployment

The main project uses PostgreSQL through `pg`. The provider is selected by environment configuration; application queries do not require a Railway-specific rewrite.

## Local connection

The local `.env` and `.env.local` files now point to Aiven. They remain ignored by Git. Existing non-database settings were preserved.

- `DATABASE_URL`: Aiven service URI.
- `DATABASE_SSL_CA`: the project CA certificate, either actual multiline text or text containing literal `\n` escapes.
- `DATABASE_POOL_MAX=4`: maximum connections in the main application pool per Node process.

`config/postgres.mjs` supplies certificate-verified connection settings to `lib/db.ts`, the live notification listener, migrations, and database maintenance scripts. It removes conflicting SSL URL parameters when supplying the trusted CA. Aiven connections require the CA; certificate verification is not disabled.

The listener uses one additional dedicated connection per application process. This pool limit is not a global service limit. Multiple app instances, development servers, scripts, and deployment overlap all count toward Aiven's 15-connection allowance. Shut down unnecessary local servers and database clients when deploying.

## Render deployment

1. Push the changed source files, including `config/postgres.mjs`, both database-consuming `lib/` modules, the updated database scripts, and `render.yaml`.
2. In Render, replace the database environment settings using the ignored local `.env.aiven.render` import file. It contains only the three database variables above. It contains a password: keep it private and do not commit it.
3. Keep the existing public application URLs, authentication secret, mail encryption key, and worker settings. The web application is still hosted on Render; only PostgreSQL moved to Aiven.
4. Redeploy. `npm run render:start` runs authentication migrations followed by application migrations when `RENDER_RUN_MIGRATIONS` is enabled. Locally these commands are `npm run auth:migrate` and `npm run db:migrate`.
5. Check `/api/health`, account creation/sign-in, the Agents screen, and live request notifications. Initial account setup and Admin provisioning are separate from database schema creation.

Changing local files does not automatically change the deployed Render service. The Render environment update and redeployment are still required.

## What a new database contains

Migrations recreate tables, indexes, and the seed/reference records defined in SQL. They cannot recover deleted accounts, agent graphs, uploaded knowledge, custom tools, API credentials, messages, or sharing records from a deleted Railway volume.

The source retains agent presets in `lib/agent-studio-presets.ts`, integration agent templates in `lib/integrations/templates.ts`, connector definitions in `lib/integrations/catalog.ts`, and built-in tools in `lib/agent-project-tools.ts`. These are a starting point for reconstruction; they are not a backup of every previously edited database record.

The schema also has workflow-backup functionality, but backups stored inside the same deleted database are not an independent recovery source. Check Railway backups or external exports before concluding that old records cannot be recovered.

## Local AI credentials and storage limits

Local development loads `OPENAI_API_KEY` from
`C:\Users\Paarth\.config\AIForce-Ops\secrets.env`, outside the project scan target.
Keep this private file when moving or cleaning the checkout. Other computers can
use `AIFORCE_ENV_FILE` to select their own private environment file. Render uses
its own `OPENAI_API_KEY` environment variable; it does not read this local file.

Continuous full security scans now start five minutes apart. Set
`SECURITY_SCAN_INTERVAL_SECONDS` to an integer from 60 through 86400 to change
that interval. This setting does not slow live alerts or integration collection.
Completed and failed scan history is limited to 100 reports per account, target,
and status, and 30 days. The latest report in each group is always retained,
including when monitoring is paused. Current findings and manually uploaded
reports are unaffected. Historical connector readings expire after 30 days,
with at most 1,440 recent samples per connection, reading type, and reading key
(about one day at the existing one-minute sampling rate). Current readings and
externally uploaded readings are retained. Cleanup runs
at most hourly per server process while the worker claims jobs. Unreferenced,
saved automatic-import envelopes expire after 30 days; envelopes referenced by
findings, scan reports, or audit revisions are preserved.

PostgreSQL reuses space from expired rows. This limits future growth; it does not
promise an immediate reduction in the provider's allocated disk or RAM graph.

## Verification commands

`node tests/postgres-config.mjs` checks SSL option precedence, CA handling, and pool limits without contacting any service. Live connection and migration checks must be run separately against the configured database.

Reference: [Aiven Node.js connection guide](https://aiven.io/docs/products/postgresql/howto/connect-node) and [node-postgres SSL configuration](https://node-postgres.com/features/ssl).
