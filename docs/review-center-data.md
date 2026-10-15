# Review Center live data

Review Center now stores measurements collected by the eAssist integrations in PostgreSQL. It does not manufacture incident counts, geographic locations, financial savings, compliance status or customer satisfaction.

## Operational connectors

| Source | Stored readings | Definition / limit |
| --- | --- | --- |
| Prometheus | Target health, healthy / down / total targets, observed healthy samples over 24 hours | Health is scrape health, not complete application health. Availability is `avg_over_time(up[24h]) * 100`; sample coverage is `count_over_time(up[24h])`. Missing samples are excluded. Each source is counted separately; overlapping sources may monitor the same target. |
| Alertmanager | Current, critical and suppressed alerts, active silences | Critical requires the severity label `critical`. Resolved/inactive/expired occurrences are excluded. Silencing an alert is not resolving an incident. |
| Semaphore | Recent task counts, success / failure / running / approval counts, success rate, template count | Latest 200 collected tasks per project. Success rate = success / (success + error + failed). Cancelled, stopped and pending tasks are excluded from that denominator. These are not all-time totals. |
| ServiceNow | Open and priority 1 incidents | Requires a connected instance and API permissions. Resolved (6), closed (7), cancelled (8) are excluded. This source remains unavailable while the user's instance is waitlisted. |

The existing server-side source credentials, URL allowlist, HTTPS policy, source lease and retry intervals are reused. No source credentials are returned to Review Center. No automation is launched by these collectors.

A successful source synchronization imports readings transactionally. Alertmanager webhook deliveries also update its review readings. Collection is about every 10 seconds; the review refreshes every 5 seconds and subscribes to source changes. This is near real time, not a zero-latency stream. Data sources also shows the authenticated background worker heartbeat, distinguishing an active worker from collection that only runs with a browser open. It displays source check time, successful import time and separate import errors. A source is stale after two minutes without a successful import or when disconnected/disabled/in error. Operational cards withhold stale source values instead of treating them as healthy or zero.

## Storage and history

Apply migrations `0010_review_connectors.sql` and `0011_collector_heartbeat.sql` with `npm run db:migrate` before running the updated app. It adds source identity, current-snapshot tracking, minute buckets, import status, collector tokens and ingestion idempotency records.

Each reading has an account owner, type, stable key, JSON payload, observation time, source kind/name and (for built-in connectors) source connection ID. Target readings preserve Prometheus's last scrape time; summary metrics record successful collection time. Retries update the same minute bucket instead of duplicating it. A new minute preserves another snapshot. Removed targets stop appearing in the current review. Disabling a source hides its readings; permanently deleting a source deletes its attached review records. Built-in history older than 90 days is pruned during successful imports, excluding the current snapshot. External readings are retained until the account is deleted; production operators should establish their required archival/retention policy.

The UI receives current records plus up to 12 observations per metric. There are no placeholder business measurements. Generic JSON payloads support source-specific extra fields, but required fields are validated; PostgreSQL does not automatically ingest an unconfigured system merely because a column exists.

## External collector API

For finance, endpoint inventory, experience, compliance or other business systems, create a collector token in **Review Center → Data sources**. It is displayed once, stored only as a SHA-256 hash, expires after 90 days, can be replaced/revoked, and belongs to the signed-in account. Its only API permission is submitting readings; it cannot run automation or read records/integration credentials. Keep it in the collector's secret store. HTTPS is required for production.

POST `/api/service-review-center/records` with:

```http
Authorization: Bearer <collector-token>
Content-Type: application/json
```

```json
{
  "batchId": "982da037-0192-4cf8-9643-3b3aa4e6cd7d",
  "sourceName": "Finance warehouse",
  "records": [
    {
      "recordType": "metric",
      "recordKey": "financial",
      "payload": { "label": "Verified savings", "value": 1250, "unit": "USD" },
      "observedAt": "2026-01-01T12:00:00Z"
    }
  ]
}
```

The sample is a format example, not a measurement to import. Use actual values and timestamps. Generate one UUID per new batch and retain it on retry. A repeated identical batch returns HTTP 200 with `duplicate: true`; a reused UUID with different contents returns 409. New batches return 201. Invalid batches are rejected atomically (400), invalid/expired/revoked tokens return 401, overly frequent token requests return 429, oversized requests return 413, and unavailable storage returns 503. Respect `Retry-After` when present and use backoff for 429/503. Maximum 250 readings per batch, 512 KB per request, 16 KB per payload, one token request per second. Observation timestamps cannot be more than five minutes into the future. Do not send passwords or personal incident descriptions in summary readings.

Signed-in users can also import JSON in Data sources; the same validation and retry protection apply. Cookie-authenticated writes reject foreign browser origins. Cross-account reads require the other account's authenticated session and cannot be performed with a collector token.

| recordType | Required payload fields | Rules |
| --- | --- | --- |
| metric | label, value | Finite numeric value; optional unit (24 chars). Value dashboard keys: experience, automation, financial, innovation, benchmarked, sustainability, techDebt, csat. |
| health | device, status | Source-defined status; optional site, country, category, ipAddress, vendor, description. Unknown location remains blank. |
| inventory | region, category, count | Nonnegative integer count. |
| lifecycle | stage, count | Nonnegative integer count. |
| forecast | environment, period, lowerBound, upperBound | Finite bounds, lower <= upper; optional finite actual. A supplied forecast does not imply a prediction model exists. |
| availability | service, availability | Percentage from 0 through 100; supply period, method and samples to explain coverage. |

All types are stored. The review's current operational panels focus on measured health, alerts, automation and incidents; importing inventory, lifecycle or forecast does not create a management/prediction engine. Additional domain-specific dashboards can read those validated records.

## Production deployment

1. Deploy this updated app and run all database migrations, including 0010 and 0011, against the production database. Use the same stable `BETTER_AUTH_SECRET` so saved integration credentials remain decryptable.
2. Keep `EASSIST_ALLOWED_ORIGINS` set to the approved source base origins. Keep the three real eAssist connections enabled for the intended production account.
3. Run a Render Background Worker using `npm run eassist:worker`. Set `EASSIST_APP_URL=https://ai-force-ops.onrender.com` and the same private `EASSIST_WORKER_TOKEN` (at least 32 characters) on worker and web service. The existing worker calls the leased collector; it now also populates Review Center. The web app alone only polls when a browser is open.
4. Open Review Center → Data sources → Sync now. Verify fresh sources, successful timestamps and nonzero reading counts where the source has data. Zero alerts can be correct when no alert is firing.
5. Close all app browser tabs, leave the worker running, then reopen after several minutes and verify recent imports. This is the check for unattended collection.
6. Verify database backups, restore procedure, monitoring of worker/import errors, required capacity and source/API permissions before onboarding a company. These depend on the operator's infrastructure and policies and are not established by a local build.

Built-in projection tests use temporary PostgreSQL accounts and local fixture data. They verify provenance, removed targets, minute history, retries, validation, tokens and isolation without triggering real tasks. Run `node tests/service-review-connectors.mjs`; the existing regression suite is `node tests/eassist-security.mjs`.
