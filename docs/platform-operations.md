# Website operations in eAssist

## Implemented connections

PostgreSQL stores operational events and alerts for the signed-in account. Saved agent configuration, ReactFlow graphs, publications, tool configuration/analysis, ePACE project settings and records, integration state transitions and Semaphore task transitions are captured server-side. Agent preview, Playground and published-agent generation record pending/completed/failed execution states. Authentication and resource ownership are enforced on the server.

The existing eAssist event stream refreshes when these events or alerts change, normally within one second of persistence. ePACE still receives its saved project records through its existing three-second event stream. External integration polling is normally every ten seconds, and Prometheus scrape/evaluation timing remains controlled by its configuration (currently thirty seconds). These are live updates with those intervals, not zero-latency notifications.

Failures, blocked ePACE runs and quality signals appear under eAssist Alerts, deduplicated by originating run/task/connection. Normal changes and execution results appear under Activity. Website operations can be selected in the integration filter, and alerts link back to the source workspace. Choose playbook opens the connected Semaphore templates; launching automation retains the existing explicit approval and permission checks. Alerts do not automatically execute playbooks.

Acknowledgement is recorded separately from source resolution and does not claim that a failed operation has been repaired. Source recovery resolves connection signals automatically; ePACE quality-alert resolution is reflected in eAssist. Active alerts remain stored until acknowledged or resolved. Resolved/acknowledged alerts are retained ninety days; normal events thirty days. An account deletion removes that account's events and alerts.

## Alertmanager delivery

The authenticated worker and active eAssist synchronization deliver account-owned website alerts to the account's enabled Alertmanager integrations. Security must permit writes and the base origin must be allowed. A persisted delivery queue records attempts, retry deadlines and leases. Active signals refresh every minute with an Alertmanager expiry five minutes ahead; acknowledgement/resolution sends a final end time. An expiry at the destination is not proof of recovery: if the collector is down, the local active alert remains. Delivery failures remain visible and retry automatically.

The forwarded payload contains a component, severity, stable alert ID, pseudonymous account label and generic operational summary. It excludes prompts, responses, document contents, graph data, credentials and raw exception messages. eAssist suppresses duplicate copies returned by Alertmanager and ignores other accounts' forwarded website signals on a shared receiver. Direct upstream alert scoping still depends on the permissions and scope of the external integration account.

## Prometheus and deployment

`/api/metrics` now exposes aggregate component event counts, active alerts, pending executions, stored agent/workflow/project counts, integration states, worker contact time and delivery failures. Metrics use a fixed label set, without account IDs or resource names. Retained-event counts are gauges, not lifetime counters. The public metrics route intentionally exposes aggregate health/counts; protect it at the deployment proxy if company policy requires a private scraper.

1. Deploy this app and apply `npm run db:migrate` through migration 0016.
2. Run `npm run eassist:worker` as an always-on worker with the same `EASSIST_WORKER_TOKEN` and the deployed application URL.
3. Retain the allowed Alertmanager, Prometheus and Semaphore base origins, then Test & sync each saved integration.
4. Prometheus already scrapes the deployed app's `/api/metrics` in the existing deployment repository. The new metrics become available after app deployment. `docs/monitoring/alerts.yml` supplies additional database, worker, integration and delivery-health rules; merge them with existing rules before deploying the Prometheus service. The companion configuration preserves the current app/Alertmanager targets.
5. Check the live app, collector heartbeat, Prometheus targets/rules, Alertmanager delivery and eAssist Activity/Alerts after deployment. Local tests do not establish deployed readiness.

## Honest boundaries

This is operational visibility, not an implementation of every platform feature. The current ReactFlow preview/publication runtime calls its configured AI model; the saved graph does not imply arbitrary nodes/tools/cloud actions are executed. ePACE catalog, lifecycle assessments, radar entries and access audit show actual saved records. Architecture assessment, cloud provisioning, multicloud orchestration, drift analysis, company roles/SSO and external document sources still need their own real integrations and implementation. ServiceNow remains unavailable until the instance is assigned and configured.

Browser errors are authenticated client-reported warning signals, deduplicated per component/hour. Unhandled server errors for authenticated requests are captured using Next.js instrumentation. Anonymous errors, deliberately handled API failures outside the instrumented agent/ePACE flows, and external applications without an integration are not claimed as fully traced. No chat or secrets are sent in browser reports. A process terminated during an agent generation is detected by the worker when its pending execution exceeds fifteen minutes.

## Verification

`node tests/platform-operations.mjs` checks real database triggers, private API reads/actions, an actual rejected provider request, error-report deduplication, live event delivery, aggregate metrics and account cleanup. `node tests/platform-alert-delivery.mjs` uses real PostgreSQL with a controlled remote transport to check Alertmanager payloads, durable retries, refresh deduplication, concurrent delivery leases, final resolution delivery and security policy. Run these against a disposable test database with its own app instance; pause its background collector during the controlled delivery test so a separate collector cannot consume the test jobs. Also run lint and the production build.
