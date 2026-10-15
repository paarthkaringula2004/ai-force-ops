# Agent Studio verification — 10 October 2026

Scope: Agents, Tool Library, visual connections, saved configuration, Play and publication. This is not a certification of every organization feature or a guarantee of 100% reliability.

## Implemented and verified

- CyberOpsAgent, DWP-MAIN-AGENT and ActionableAgent starter diagrams and their specialist agents were installed and inspected in the signed-in workspace.
- Info connects to the main agent; Model, Memory, Tools and Agents are separate selectable branches. Only connected dependencies are available at runtime.
- Agent selection, Tool Library/project-tool selection and knowledge-project selection use actual saved records. Duplicate attachments are suppressed.
- Model dropdown loads models available to the configured account. Output budget/history settings apply at runtime. Supported GPT-4 models also expose temperature, Top P and repetition penalties.
- Canvas locking blocks edits; zoom, fit and minimap work. Components collapse to keep the canvas visible.
- PostgreSQL persistence, serialized saves, reload persistence and a recoverable backup of the previous CyberOps sample draft.
- JSON export downloaded successfully. Import validation and secret removal passed automated tests.
- Tool Library supports editing its name, purpose, method and endpoint. Declared URL inputs resolve without changing the configured host. The existing GitHub sample's literal OWNER/REPO endpoint was changed to declared owner/repo inputs.
- Keys are encrypted at rest and excluded from exports/releases. Tool node authentication is separate from the authoritative Tool Library endpoint.
- External write actions display the exact endpoint/method/body and require a short-lived, owner-bound, single-use confirmation. Changes to the graph or tool invalidate confirmation. Timeouts do not permit replay.
- Published Studio releases freeze connected agent definitions, use the connected model, and require the owner's active session for private connected data. External changes are prepared in authenticated Play rather than executed silently from publication.

## Checks and evidence

- `npx tsc --noEmit`: passed.
- ESLint on affected Agent Studio, Agents/Tools APIs, published chat, runtime and Tool Library files: passed.
- `npm run build`: optimized production compilation, type checking and page generation passed.
- `node tests/agent-studio.mjs`: real PostgreSQL fixtures with rollback; graph/dependency isolation, profile/request/report/health/incident queries, delegation, aggregated usage, ownership and Admin boundaries, API input substitution, confirmation and cycle protection passed. Provider/external write calls are simulated in this suite.
- `node tests/agent-studio-publication.mjs`: connected release snapshots, selected model, secret stripping, anonymous access denial, JSON imports and malformed-node rejection passed.
- Actual OpenAI Play smoke check: ActionableAgent answered its purpose, then delegated to Incident Analysis Agent. The UI recorded four completed steps for delegation. These prompts did not request private records or external changes.
- Browser: all three starters, model dropdown, Tools/Memory pickers, Lock, saved reload, JSON download, Tool Library editing and narrow-screen message controls inspected.
- Database migrations 0048 (confirmations) and 0049 (draft backups) applied locally. Deployments must run `npm run db:migrate`.

## External capabilities still requiring setup

The screenshots show private enterprise products. Their APIs and tenant credentials cannot be inferred from an image.

| Capability | Current behavior | Required before claiming live operation |
| --- | --- | --- |
| Qualys | Reads existing project scan reports; clearly identifies actual scanner sources | Qualys API endpoint, tenant credentials, approved origin and a real read-only scan test |
| Database activity monitoring | Reviews available saved service readings | Actual database-monitoring source/API and evidence test |
| SysTrack / software inventory | Guidance and selected knowledge | Device/inventory APIs and authorized tenant scope |
| Meeting rooms | Reviews saved workplace requests | Booking API, availability data and confirmed booking test |
| Leave / onboarding | Saved requests, profile and guidance | Organization policies and explicit tools for the required source-system changes |
| IEM / SNOW AF / custom integrations | Tool Library can configure HTTPS JSON APIs | Actual endpoints, input contracts, credentials and source-system permissions |

Server-approved external origins use `EASSIST_ALLOWED_ORIGINS`. Encrypted node keys require the deployment's `BETTER_AUTH_SECRET`. OpenAI calls require the configured project API key. The production process, database migrations and existing background workers must be configured on the target host.

## Readiness conclusion

The implemented Studio core passes the checks above and real model delegation works locally. Full enterprise deployment acceptance remains pending real connector tests, target-host configuration and staging checks. No deployment, enterprise account signup, real booking, email or external write was performed during this verification.


## Follow-up: CyberOps tools and agent rearrangement

- Added Agent Assist and Chart Visualizer to the existing saved CyberOps Tools branch; preserved existing instructions, selected model, specialist connections and layout. Both are available through +Tools.
- Agent Assist reads authorized recorded evidence and supplies it for grounded guidance. It performs no remediation or external writes.
- Chart Visualizer aggregates recorded counts server-side: latest completed scan by severity, latest 20 synchronized incidents by priority, or latest 20 own requests by status. Play renders accessible purple bar charts with values and provenance. Empty sources return no-data, not fabricated charts. Other chart types and arbitrary timeframes are not implemented.
- Tests verified real-DB chart execution, Agent Assist execution, exact aggregation, rendered bar proportions, role boundaries, additive upgrade and idempotency. Existing runtime/publication suites continue passing.
- Removed the meeting-starter section from Agents. All active cards support desktop drag, touch handles and keyboard arrows. Full-account order is persisted in PostgreSQL with owner-scoped validation and transaction rollback on failure.
- Browser verified rearrangement, the successful-save tick and persistence after reload. Restored the original first-two-card order after the smoke check. CyberOps Play displayed both connected tools and selected Chart Visualizer for a natural-language request; the current account had no workplace requests, so it correctly returned no-data.
- Migration 0050 applied locally. Deployment must run npm run db:migrate.
