# Employee Playground Super Bot

The signed-in Playground provides conversational leave and guided onboarding, equipment and accessories, meeting room, access and workplace support requests. It also provides the website overview and signed-in profile information. Employee capability responses exclude infrastructure operations and security scanners. Agent previews retain their configured project context.

Guided requests work without a model API key. Freeform explanations use the selected compatible OpenAI model (or the first available model when no selection is saved). Local replies record zero model tokens.

Apply migration 0028 with `npm run db:migrate`. Drafts and service requests are stored in PostgreSQL and scoped to the authenticated account. Submission requires a complete draft and an explicit Submit request action. Per-account transaction locks serialize submissions. The draft UUID makes submission idempotent. New chat clears chat history and the unfinished draft while preserving submitted requests.

Company leave balances are calculated from recorded entitlement and reservations. See [Leave and payroll policy](leave-policy.md) for monthly accrual, carry-forward and payroll review. External HR balances, holiday calendars, equipment catalogues and identity provisioning require their own connections. Mail uses the configured outbox and room booking uses the built-in calendar. The assistant does not invent those details or claim fulfilment. Submitted requests require coordination; they do not grant access or complete onboarding. To match screenshot completion outputs with live results, connect these company systems and verify their outcomes before changing request status.

Validation: `node tests/employee-playground.mjs` against the running local server. The test creates disposable accounts and removes them in its cleanup. It checks guided equipment and room flows, freeform requirements, durable drafts, account isolation, cross-origin rejection, duplicate submission prevention, pause/resume and new-chat request preservation. No paid model calls are made.
