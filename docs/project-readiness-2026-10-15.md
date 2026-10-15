# AIForce.Ops readiness review — 15 October 2026 (IST)

## Verdict and scope

**Not ready for unrestricted production use with real organizational data.** The application has substantial working functionality and can support a supervised demonstration. A limited pilot needs the release blockers below resolved or explicitly contained first. Passing a build is not production sign-off.

Payments and Agents are excluded from this verdict. Internal ticket admission remains in scope because it controls provider spending by Playground and ePACE, independently of Payments. Shared components used outside Agents remain in scope.

Reviewed the current local working tree: authentication, authorization, Administration, employee/manager requests, conversational routing, meeting rooms, Google/Teams meetings, Tool Library, Knowledge Management, ePACE, eAssist/Review Center, email, uploads, persistence, accounting, dependency health, tests and deployment instructions. This was a source/configuration review with selected live localhost and automated checks, not every screen under every role, a full penetration test, a load test, or a production-environment audit. External vendor accounts, hosting controls and backup services were not assumed to work merely because their configuration exists.

## Area assessment

| Area | Current evidence | Readiness limit |
| --- | --- | --- |
| Signup and login | Required email verification, hashed OTP, attempt limits, session protection, Google sign-in configuration | Privileged MFA and a complete user-facing recovery workflow were not found in reviewed auth/UI code |
| Roles and Administration | Server permission checks, active-account checks, reporting hierarchy, Admin ID lock, transaction/audit helpers | Full all-role API/browser regression remains outstanding; historical audit removal needs policy review |
| Employee and Manager services | Saved requests, leave policy, reviewer decisions, status transitions, guided forms | Several old test harnesses fail before exercising current code; external HR/equipment/access fulfilment is separate |
| Playground and natural conversation | OpenAI-backed replies, authenticated context, confirmed action workflows, repaired greeting path | Department creation loop reported in this review; Manager follow-up context regression reproduced |
| Physical meeting rooms | Availability, preview/confirmation, concurrency protection, cancellation, ownership checks, editable configuration | No production concurrency/load evidence; Google/Teams calendar invitations are separate from native reservations |
| Google/Teams meetings | OAuth, per-organizer connections, invitation controls, expiry/redaction, idempotent retries | Provider link lifecycle differs from app expiry; production OAuth approval and account/provider limits need deployment verification |
| Tool Library and integrations | Custom definitions, encrypted credentials, ownership, disabled/deleted states, request validation, approval controls | Mock adapter success is not live certification of every vendor; each intended provider needs real read/write/error checks |
| Knowledge Management | Separate metadata for integrations, project tools and custom tools; explicit NULL state | Configured metadata is not imported live business knowledge; source content must actually be fetched/indexed |
| ePACE and documents | Owner-scoped retrieval, grounded source excerpts, safe Markdown, size/archive limits, some cleanup | In-process parsing, no quarantine/malware gate found, 2,000-passage retrieval cap and in-memory scoring; broader sharing/governance must match actual requirements |
| eAssist/Review Center | Source adapters, stored health evidence, endpoint deduplication, worker/scanner infrastructure | Production collector freshness, authenticated scan scope, notification delivery and source outages need end-to-end staging proof |
| Email | Encrypted outbox, deduplication, retry/lease controls, SMTP TLS, worker heartbeat | SMTP acceptance is not inbox delivery; production sender reputation and bounce/complaint handling remain unverified |
| Settings, profile, usage | Persisted configuration, sessions, usage records, account export | Export omits newer datasets; provider budget admission is not reserved atomically |
| Release and operation | Fresh production build and local DB health check pass | No repository CI workflow found, source lint fails, broken tests, no observed restore drill/load or rollback evidence |

## Release blockers and acceptance criteria

### 1. Provider spending is not reserved before execution — high

`lib/tickets.ts:10` admits a non-Admin when balance is merely positive. `lib/model-usage.ts:20` debits the actual charge afterward without an atomic sufficient-balance condition. A large request or concurrent admitted requests can overspend. When a price/FX-derived ticket amount is null, that debit is skipped. Admin unlimited tickets do not themselves establish a provider spending cap.

Require transactional reservation/admission, actual-cost settlement, failed-call release, explicit unknown-pricing behavior, account/organization spending limits, and concurrent-call tests. This is relevant even with Payments excluded.

### 2. Browser security headers are absent from the reviewed app — high

A live HTTP 200 response from `/sign-in` on localhost had no Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy or Permissions-Policy. `next.config.ts` supplies no header policy. HSTS was also absent; HSTS must be validated on the real HTTPS deployment, not inferred from localhost HTTP.

Provide and test an appropriate CSP, framing restriction, MIME-sniffing protection and other applicable headers at the app or trusted ingress. Verify the deployed HTTPS response and test intended framing/OAuth/editor flows for compatibility. A hosting service may add controls, but that has not been demonstrated here.

### 3. Conversation workflows still have correctness failures — high

The supplied 12:06–12:07 transcript shows department creation asking for the name repeatedly after receiving `SDE` and an explicit explanation. Expected behavior is a preview containing the supplied name, with confirm/cancel choices; no department should be created before confirmation. The pasted transcript was not executed.

Code inspection shows `dispatchAdminIntent` in `lib/admin-playground-router.ts` replaces the existing draft for a department preparation intent; an interpretation without an extracted department can reopen the empty-name question. This is a plausible restart path, not a captured trace proving the exact intent returned for that conversation. Add regression coverage for short names, quoted names, inline names, cancellation followed by a new action, and continuation classified as preparation. Repeatedly asking the same answered question must be rejected as a valid result.

Separately, `tests/manager-review-display.mjs` reproduced a real deterministic response error: after customer satisfaction, “which time?” returns service-health timestamps. `lib/manager-review-display.ts:15` does not treat that wording as a follow-up, so the prior topic is lost. Check follow-up/topic retention across Admin, User, Employee and Manager, with representative model/settings/history combinations. The repaired greeting alone is not proof of overall conversational readiness.

### 4. Production operation and recovery are unverified — high

The local supervisor launches web, integration, security and mail workers; the local mail heartbeat was current. `/api/health` returned 200 with database connected. Neither establishes a production service, correct migrations, worker freshness, durable backups, monitored alerts, capacity or disaster recovery.

Before launch, demonstrate a staging deployment with production-like secrets/TLS/network rules, migration compatibility, always-on workers, alert delivery, a restore into a separate database, recovery targets, a rollback exercise, and load/concurrency thresholds. Document owners and incident procedures. Do not use an unsupervised local `npm start` session as production hosting.

### 5. Release validation is not a reliable gate — high

No `.github` CI directory was found. `package.json` has no unified test script. Several tests have drifted from current imports/behavior. The standard `npm run lint` includes generated `.security-runs` / `.security-tools` code and produces extensive irrelevant findings. Excluding those generated tools and the requested out-of-scope modules still leaves one source lint error at `components/model-id-select.tsx:21` (`react-hooks/set-state-in-effect`). This error is a release-quality issue, not by itself proof of a security exploit.

Create a reproducible supported test runner, correct test dependencies/expectations without weakening assertions, exclude generated vendor files from lint, fix the source error, and run build/types/lint/security/role/concurrency checks on every release. Establish all-role browser, accessibility/responsive and failure-recovery coverage.

### 6. Dependency advisory remains unresolved — medium

Fresh `npm audit --omit=dev --json` returned three moderate package entries (`mammoth`, `argparse`, `sprintf-js`) in one transitive denial-of-service advisory chain; zero high/critical entries. This is not three independent confirmed app exploits. The audit's suggested Mammoth version is a major downgrade; applying `--force` is not a safe conclusion.

Assess reachability, select a supported fix/replacement or documented mitigation, and verify DOCX imports and the dependency audit afterward.

### 7. Data export and audit retention are incomplete for enterprise use — medium

`app/api/account/export/route.ts` exports older workspace datasets but does not include newer employee requests, meeting/invitation data, ePACE documents/runs or current integration configuration metadata. Secrets should remain excluded, but an account export should accurately document its coverage.

`lib/workspace-member-deletion.ts:21–23` deletes the target's security events and audit entries before deleting the account. That may meet a particular deletion policy, but removes historical accountability and must not be assumed appropriate for an organization. Define retention/erasure rules, distinguish personal data from retained security evidence, use approved pseudonymization where appropriate, and test export/deletion coverage and access. No regulatory compliance conclusion is made here.

### 8. Authentication recovery and upload processing need hardening — medium/high depending on deployment

Signup verification works. The reviewed auth plugin configuration does not show privileged MFA; a complete forgot-password UI was not found. A password-reset template is not proof of a recoverable account flow. Establish and test privileged identity/recovery controls before storing sensitive organization data.

`app/api/epace/documents/route.ts:50–85` parses PDF/DOCX in the web request process. File size and DOCX expansion limits are useful, but no quarantine/malware check or isolated resource-limited parsing job was found. Establish the threat model and isolate parsing/resource limits before permitting untrusted organizational uploads.

## Checks performed in this review

- Fresh `npm run build`: passed, including TypeScript and route generation.
- Local `/api/health`: HTTP 200, database connected.
- Signup-verification live test: passed, including no unverified session, wrong-code rejection, successful verification and replay rejection; reserved `.invalid` fixture, no real recipient mail.
- Current focused suites passed: `integration-extensibility`, `integration-transport`, `integration-catalog`, `integration-workflows`, `admin-playground-routing`, `admin-role-lock`, `workspace-navigation-access`, `epace-markdown`, `epace-knowledge-overview`, `review-health-identity`, `leave-ai-intent`, `tool-knowledge`, `meeting-expiry`.
- `manager-review-display`: failed with the topic/timestamp regression described above.
- `review-natural-replies`, `workspace-catalog-chat`, `leave-policy`: failed because transpile-based harnesses lack dependency mappings (`./action-intent` or `./organization-security`). The pure date/policy checks in `leave-policy` passed before its harness failed. These failures are not evidence that those application imports are missing from the actual build.
- Scoped source lint: one error, zero warnings. Raw results: `docs/verification/readiness-source-lint-2026-10-15.json`.
- Current production dependency audit: three moderate entries, no high/critical entries.
- `starter-markdown-server.mjs` was identified as a persistent manual fixture server rather than an assertion suite and stopped; it is not counted as a passed or failed product test.

No blanket pass is claimed for remaining tests, all live integrations, every UI flow, pen-testing, accessibility or capacity. Earlier meeting/provider tests and the prior actual Playground greeting verification are useful supporting evidence, but were not rerun as an exhaustive matrix during this review.

## Recommended release order

1. Repair department/Manager conversation failures and the broken test gates.
2. Add provider budget reservation/caps, deploy browser security policies, and finish privileged recovery controls.
3. Resolve the document dependency/upload risks and data retention/export decisions.
4. Deploy staging, configure intended providers, then prove real read/write/error behavior without treating placeholder configurations as working services.
5. Complete all-role regression, controlled load tests, alerts, backups/restore and rollback. Approve a limited pilot only against recorded acceptance results.

This report does not change application behavior, create a department, alter roles or configure external services.

## Department workflow fix after this review

The department-name loop has been repaired. Department preparation now preserves an existing department draft instead of deleting it when the interpreter repeats the preparation intent. Inline names, including `As of now Create Department - ...`, are preserved; short names and quoted explanatory replies are accepted. The department tool schema limits its extracted field to `department`. Names fabricated by the model are not substituted for the current supplied answer. Empty repeated preparation preserves a ready preview; an explicit name change regenerates a preview rather than creating the catalog entry.

`tests/admin-natural-language.mjs`, `tests/workspace-catalog-chat.mjs` and `tests/admin-playground-routing.mjs` passed, including cancellation, preview-only behavior, actual creation inside a rollback fixture, duplicate/replay/expiry checks, source grounding and confirmation controls. TypeScript, scoped lint and the production build passed. The previously missing policy/department-helper mappings in the catalog test harness were repaired.

Browser verification used the existing affected draft: sending SDE produced Review new department with the correct name. A subsequent confirmation appeared in the browser (not sent by the verification tool), after which the chat showed SDE created as Department ID 62. Automated fixtures rolled back; no tool-issued confirmation created a real department. Screenshot: `docs/verification/department-loop-fixed-2026-10-15.png`.

This resolves the department portion of finding 3, not the remaining Manager follow-up or other production blockers.
