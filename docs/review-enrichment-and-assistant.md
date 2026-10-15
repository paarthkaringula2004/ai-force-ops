# Review Center enrichment and assistant

Run database migrations before deploying this version, including 0017 (enrichment cache) and 0018 (assistant conversations). Keep the existing eAssist background worker running. Configure OPENAI_API_KEY on the server. Optional REVIEW_DESCRIPTION_MODEL and REVIEW_CHAT_MODEL override OPENAI_MODEL, falling back to gpt-4o-mini.

Endpoint DNS is checked every five minutes when collection runs. Public IP location is refreshed when the IP changes or after 24 hours. OpenAI descriptions are cached in PostgreSQL and regenerated when their underlying facts or selected model change, rather than on every UI refresh. Failed enrichment retries after 15 minutes. Overlapping sources share an endpoint enrichment cache where source metadata agrees. Explicit source labels take priority over inferred metadata.

Location is an IP-based estimate from ipwho.is, potentially identifying a CDN or proxy rather than the service's physical hosting region. Vendor identifies IP network ownership unless the source supplies a vendor label. Private and loopback addresses are not sent to the location provider and cannot be publicly geolocated. Unavailable facts remain explicitly unavailable.

The live health list, summary cards and CSV export consolidate historical snapshots and overlapping sources by hostname and port. Prometheus scrape health takes priority over a successful integration API check. Different services sharing an IP remain distinct. Historical readings remain in PostgreSQL.

The right-side assistant uses actual OpenAI Responses and moderation APIs. It reads only the signed-in account's current enabled-source records, reports source timestamps and stale data, renders Markdown, and stores conversation history in PostgreSQL. Requests have the existing per-account provider rate limits, bounded question length, output token limits and idempotent request IDs. It cannot execute remediation. Chat history older than 30 days is removed after a successful chat request.

Public endpoint addresses are sent to ipwho.is. Selected service facts and conversation context are sent to OpenAI with store:false. Review these data flows and the providers' terms for your organization's deployment. These changes do not provision a ServiceNow instance or certify production readiness.

## Operational assistant and recovery

The free Review Center workflow now answers operational questions using current connection errors, import freshness, owner-scoped workflow tasks and redacted log tails, all six reading types, platform alerts, activity, API collectors and worker heartbeats. Current connection failures take precedence over older Healthy readings. Named workflow questions match task/template names and include the owning source. Missing telemetry is disclosed. Times in answers use IST.

The operational recovery interface rechecks sources through leased, read-only synchronization. Failed workflow retries preview the existing template and require explicit confirmation; the backend rechecks source task state, then uses existing eAssist launch approvals, concurrency limits, audit records and idempotent operations. Known missing-runtime failures are blocked until the runner configuration is corrected. A launch is not reported as a completed fix. Arbitrary code edits, cloud restarts and unconfigured remediation are not available through chat. `npm run dev` now supervises the integration worker as well as Next.js and the security worker.

Verification: `node tests/review-operations-assistant.mjs` checks source errors, stale health, named task errors, secret redaction and account/origin/confirmation boundaries. `node tests/review-workflow-recovery.mjs` checks real eAssist approval and launch behavior against a disposable local runner fixture.

Website execution events include React Flow / Agent Studio / published agent failures. New provider failures store a credential-free category (authentication, model/resource, invalid request, quota, connection, or provider service error) in platform events and alerts. Historical generic failures remain generic. Live Semaphore verification recovered its source connection and identified a PowerShell runner missing its executable; no remote runner installation or repository modification was performed.

Health summaries show an IST date/time for the summary, source checks, alert updates, scanner errors and worker heartbeats. Workflow replies use the source task end time when supplied; otherwise they label the database timestamp as “Status recorded” rather than claiming it is the failure time. Invalid or missing timestamps are shown as not recorded.

Organization-facing operational replies use friendly statuses, a historical workflow count, IST times, clear monitoring coverage, and on-request logs. Evidence appears as readable record cards, including copied output. Details no longer auto-open. Inactive source alerts are omitted from normal diagnosis unless history/test/all records are requested.

Recovery: chat recheck/reconnect/repair requests perform bounded read-only checks of up to three matching owned connections and verify source plus import freshness. A leased background check remains pending. Workflow retries retain explicit confirmation and source security policy; missing runtime/access faults block blind retries. New recovery task IDs are polled against their source API and marked verified only for success; failed and pending outcomes remain distinct. This does not install missing remote software, change credentials, or rewrite arbitrary repository code.
