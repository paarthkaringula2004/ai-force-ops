# ePACE production setup

This release adds production controls to the existing account-scoped ePACE workspace. It is a working foundation for a controlled pilot, not a certification of enterprise security, compliance, scale or answer accuracy.

## What is implemented

- Real provider requests, document retrieval, saved conversations, moderation, sampled evaluation, traces and in-app quality alerts. No fabricated measurements or seeded company records.
- PostgreSQL-backed per-account request counters, independent of optional Arcjet availability. Defaults: 12 admitted provider requests per minute, 200 per UTC day and 500,000 recorded provider tokens per UTC day. Admission is serialized per account and counter changes commit together.
- Token allowance checks before embedding batches, query embeddings, ranking, captions, answer generation and evaluation. Generation has a configurable per-project output limit of 128–8,000 tokens (default 2,000).
- Input/output moderation is required by default on the server. Provider-flagged content is blocked even if a project filter requests annotation. Operators can explicitly relax these controls for a controlled test; readiness then shows attention.
- Document text is passed as untrusted user data rather than injected into system instructions. Ranking, captions and evaluation request strict structured outputs; ranking indexes and evaluation scores are validated. Captions must occur verbatim in their source.
- A knowledge requirement is enabled by default. With no retrieved evidence, the server saves a clear notice and does not invoke answer generation or invent quality scores. Relevant evidence and accurate answers still need human review; this is not a guarantee against hallucination or prompt injection.
- Client request IDs reject duplicate submissions before another provider run is created. Duplicates return HTTP 409 with instructions to inspect the existing conversation/trace. IDs are retained with their run, not forever.
- Stop answer cancels the client request and forwards cancellation to provider calls. Runs have a four-minute total deadline; provider stages have their own timeouts. Interrupted traces save an error and no completed answer text.
- Actual streamed JSON and multipart byte limits are enforced, including requests with no Content-Length. Uploads are limited to 10 MB and 500,000 extracted characters. DOCX archives are checked for 1,000-entry/20-MB expanded limits before text extraction. Duplicate files in a project do not add duplicate passages. Passage inserts and embedding writes use batch SQL.
- Active conversations cannot be deleted; completed conversation deletion removes related runs and alert content. Documents and their chunks can be deleted, while earlier traces retain their recorded source evidence until run retention expires.
- Authenticated live snapshots recheck the session and reconnect after short-lived streams. Responses are private and uncached. This does not replace reverse-proxy/network protection against abusive connection volumes.
- The authenticated background worker performs retention cleanup hourly, even without open browsers. It marks abandoned pending runs failed and removes expired runs, alerts, empty conversations and obsolete limiter windows. Knowledge, catalog records and audit metadata are retained; backups have their own retention policy.
- **Deployment readiness** displays actual database, model, safety, evidence, worker and cleanup checks. **Test provider** makes small real model/structured-output/moderation/embedding requests and records a successful check for the selected models for 24 hours. It never sends project documents. Recheck after changing secrets, deployments or provider access.
- `AUTH_DISABLE_SIGNUP=true` closes public email/password registration after approved accounts exist. It does not implement invitations or company roles.

## Deploy the web service and worker

Apply application migrations through `0012_epace_production_controls.sql` using `npm run db:migrate` before exposing the new web service. Use the production PostgreSQL database, the correct HTTPS `BETTER_AUTH_URL`, the existing stable `BETTER_AUTH_SECRET` and a server-side `OPENAI_API_KEY`. Do not upload the laptop's .env file.

Run `npm run build` and start with `npm start -- --hostname 0.0.0.0`. Run a separate always-on background worker using `npm run eassist:worker`, with `EASSIST_APP_URL` pointing to the deployed application and the same private `EASSIST_WORKER_TOKEN` as the web service. This existing worker now covers ePACE retention as well as integration collection. A sleeping web service can delay collection and maintenance; use hosting that meets your availability requirements.

### Operator controls

| Environment variable      | Default | Purpose                                                                      |
| ------------------------- | ------- | ---------------------------------------------------------------------------- |
| EPACE_REQUESTS_PER_MINUTE | 12      | Per-account admitted provider requests in a fixed UTC minute.                |
| EPACE_REQUESTS_PER_DAY    | 200     | Per-account admitted provider requests in a fixed UTC day.                   |
| EPACE_DAILY_TOKEN_LIMIT   | 500000  | Per-account recorded provider usage threshold per UTC day.                   |
| EPACE_REQUIRE_SAFETY      | true    | Reject chat/settings that disable content safety.                            |
| EPACE_BLOCK_FLAGGED       | true    | Block provider-flagged moderation results regardless of annotation settings. |
| AUTH_DISABLE_SIGNUP       | false   | Close public account creation after approved accounts exist.                 |

Invalid numeric or boolean policy values fail closed with a configuration error. Chat, moderation tests and provider diagnostics share the request allowance. Failed admitted requests count; validation and duplicate-ID rejection happen before provider admission. Concurrent-chat rejection can consume admission without a provider call.

Token counters rely on reported completed/failed response usage. In-flight requests can overshoot, and interrupted requests may not report all usage. These are application allowances, not hard financial caps. Set provider-level spending limits and alerts. Closing public registration matters because per-account controls do not cap usage across arbitrary new accounts.

## Your remaining setup and approval

1. Deploy the new code, apply migrations and run the always-on worker. Verify the deployed application rather than assuming laptop checks establish Render readiness.
2. Confirm provider credits, supported models, billing alerts and company permission to send data to that provider. Select and save your runtime/evaluation models, then run Test provider.
3. Upload approved documents. Empty projects cannot give grounded company answers; review the live knowledge coverage check for your current project. For PDF scans, supply extracted text/OCR first.
4. Review representative questions, evidence, citations and prompt injection attempts with the business owner. Set quality thresholds, evaluation sampling, retention and any custom blocklist.
5. Create approved accounts and close public sign-up if this is a private company deployment. Approve document access and data processing/retention policies. Protect database and provider secrets.
6. Enable backups and test an actual restore; monitor availability and errors, decide on external notification destinations, and define incident ownership. A visible green database connection is not a restore test.
7. Approve expected user volumes, document volumes, performance goals and recovery requirements before load/security testing.

## Implementation still needed for broader enterprise requirements

These are not solved by entering a URL or credential:

- Shared organizations, project roles, invitations, company SSO/MFA and approval workflows need an identity/access design and implementation. Current accounts cannot share projects.
- Audit metadata is stored in PostgreSQL and shown in-app; immutable external audit storage and tamper-resistant exports are not implemented.
- Quality alerts currently stay in-app. External email/chat/on-call routing needs a real notification service, credentials and delivery/retry implementation.
- Malware scanning and fully isolated resource-bounded document parsing are not implemented. The DOCX limits reduce expansion risk but do not make all file formats harmless. For untrusted public uploads, add a scanning/quarantine/isolated ingestion service before opening access.
- Current retrieval loads up to 2,000 passages per project into application memory, and snapshots show at most the newest 5,000 records. Large knowledge bases require scalable vector indexing/search, pagination and deployment-specific load testing.
- Generated RAG ZIPs are standalone local starters, not provisioned production services. They use a bearer token/local files and do not inherit workspace sessions, PostgreSQL limits, maintenance or company access controls.
- Azure, LangSmith, AWS/IBM consoles, cloud provisioning, automated deployment, drift analysis and infrastructure optimization require their actual integrations and implementation. Semaphore, Prometheus and Alertmanager do not automatically provide these AI-platform capabilities.

## Verification

`node scripts/test-epace.mjs --live` uses disposable accounts and fixtures, checks isolation, actual streamed size limits, settings, uploads/DOCX expansion, deduplication, source ownership, provider diagnostics, retrieval/ranking/captions, answer generation, moderation/evaluation, feedback, duplicate requests, absent knowledge, cancellation, conversation/alert deletion and persistent request/token guards. Provider verification incurs normal usage. Test accounts and their records are removed afterward. `node tests/epace-production.mjs` additionally checks invalid operator policies, multi-chunk byte limits, atomic concurrent admission, account isolation, recorded-token blocking, unattended per-project retention and closed public registration. Also run `npm run lint` and `npm run build`.

A successful local suite demonstrates the tested flows; it is not a penetration test, recovery drill, load certification or verification of Render configuration. Company release approval remains a separate decision.

Provider implementation references: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Handling untrusted data in agent workflows](https://developers.openai.com/api/docs/guides/agent-builder-safety).

## Live editor and diagnostic checks

The question composer is a single rich Markdown editor. Markdown shortcuts format as you type; selecting text opens the website-themed link, bold, italic and text-style toolbar. Headings, lists, tables and fenced code are serialized as Markdown for the chat API. Word HTML paste is converted into supported Markdown structure; unsupported Word layout, images and embedded objects are not retained. The composer stays in a fixed dock while conversation content scrolls separately. Ctrl/Cmd + Enter sends; Enter adds a line.

Readiness reports identify the source of each result: PostgreSQL, server configuration or the OpenAI API. Test provider makes actual requests for selected models, input/output moderation and embeddings when the retrieval mode requires them, then returns fresh database/configuration checks. Failed provider tests supersede earlier successes. This does not test backups, organization approvals or deployment capacity.
