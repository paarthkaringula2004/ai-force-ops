# Chatbot code review — 14 October 2026

Read-only implementation review covering the role-specific Playground, Review Center/Super assistant, ePACE knowledge chat, and private/published Agent Studio execution. No browser conversations, API calls, automated tests, or security scans were performed. Findings follow reachable code paths; example messages below are inspection-derived, not executed reproductions. No application code was changed for this review.

P1 means a control or material reliability issue to address first. P2 means a functional/conversation issue. This is not certification of every chatbot or an assurance that no other issues exist.

## Findings

### 1. P1 — Explanatory or negated questions can change monitoring

`lib/vulnerabilities/assistant.ts:40–45` writes monitoring schedules when the input matches unanchored pause/stop/disable or enable/start/resume patterns. These branches run before the natural-language rewrite; they do not distinguish a question or negation from a command.

For example, “What happens if I pause monitoring?” reaches the pause branch, and “Do not stop monitoring” also matches it. An Admin asking a question can therefore change the shared monitoring schedule. Similarly, `lib/service-review/assistant-operations.ts:51–52` invokes source checks based on words such as repair/refresh even in explanatory questions.

Recommended change: interpret intent before dispatch, require explicit affirmative action intent, and separate read-only explanations from mutations. Revalidate authorization and relevant policy at the actual write.

### 2. P1 — Workspace-write policy does not cover chatbot writes

`lib/organization-security.ts:29` exempts `/api/playground*` and `/chat` from the workspace-write check, assuming chat is read-only. However, `lib/employee-playground.ts:123–133` submits requests; `lib/leave-conversation.ts` records approved leave; and `lib/workspace-request-chat.ts:24–27` applies decisions. These handlers and their decision transaction do not independently enforce `allow_writes`. Role checks and confirmation tokens remain present, but the organization-wide “changes disabled” setting is not an effective stop for these paths.

Recommended change: enforce the policy at each mutation transaction, leaving read-only chat available.

### 3. P2 — Regular User Playground never reaches OpenAI

`app/api/playground/route.ts:101` immediately returns `userReply(lastMessage.content)` for the User role. `lib/user-playground.ts:4` has only careers, tools, and a generic feature-list branch. It receives no conversation history. Ordinary questions and follow-ups therefore get fixed content, irrespective of the selected model. This finding concerns the main Playground; User-owned agent previews have a separate AI runtime.

Recommended change: give Users a role-limited conversational AI path, with careers and product guidance as grounded sources rather than terminal templates.

### 4. P2 — Most Employee/Manager personal services remain form-driven

`lib/leave-ai-router.ts:21` skips the AI interpreter when a non-leave request is active. `lib/employee-playground.ts:161–171` then puts the next free-text answer directly into the next missing field, or repeats an exact-choice question. Starting an equipment request also does not extract all details supplied in the opening message.

An explanation question during a requirements/reason step can be stored as the field value; paraphrases of a fixed option can be rejected. This affects equipment, access, support, onboarding and other non-leave services. Improving leave alone does not make all employee services conversational.

Recommended change: interpret intents and supplied fields for every supported service, distinguish clarification from field answers, and retain the server's validation and submission controls.

### 5. P2 — Staff lookup runs before personal intent and can intercept it

`app/api/playground/route.ts:102–104` calls staff evidence before the personal leave interpreter. `lib/staff-evidence-chat.ts:39` immediately sends any matching leave lookup to team lookup. The pattern in `lib/team-leave-chat.ts:8–9` parses “What is my leave balance?” as a lookup for a person named “my”. That handler returns either a permission message or no matching employee instead of reaching the own-balance handler.

Other broad staff keywords can also route general “how do I…” product questions into saved staff data rather than guidance.

Recommended change: prioritize self-reference, distinguish product help from record lookup, and resolve an authorized person only after establishing lookup intent.

### 6. P2 — Manager Review Center is still a fixed keyword responder

`lib/manager-review.ts:7–9` rejects questions containing broad words such as “team”, “activity” or “security” before intent is understood. `lib/manager-review-display.ts` uses regular expressions and templates rather than an AI interpretation. Previous topic context is fetched only for time/when/timestamp questions (`lib/manager-review.ts:30–34`).

This makes otherwise permitted overview follow-ups such as “explain that more” lose their subject. A question about the Manager's own view may hit a forbidden keyword even when it requests no privileged configuration.

Recommended change: retain the Manager's read-only permissions, but use conversation-aware interpretation over the allowed overview evidence. Do not broaden Admin-only access as a workaround.

### 7. P2 — Manager overall-health counts use only eight services

`lib/manager-review-display.ts:37` truncates selected readings to eight before calculating healthy/down counts at lines 46–49. The ordinary overview can say all eight monitored services are healthy while a failing ninth service was omitted. There is no subset disclosure in that wording.

Recommended change: compute totals and priority from the complete authorized dataset, then limit only the displayed examples and disclose any source-query limit.

### 8. P2 — ePACE retrieves without resolving conversation references

`app/api/epace/chat/route.ts:210` retrieves passages from the latest question alone. The no-evidence branch at line 224 can finish before history is loaded at line 238. `lib/epace/engine.ts:112–138` scores passages against that isolated query.

After a document answer, “What does that mean?” or “And its risks?” can retrieve unrelated passages, or no passages in Keyword mode. In the latter case, the model never receives the prior conversation to resolve the reference.

Recommended change: resolve a standalone retrieval question from the thread first, preserve the original question for answering, and carry relevant source identifiers forward without treating old answers as current evidence.

### 9. P1 — Natural eAssist AI bypasses the execution-policy gate

`lib/service-review/natural-reply.ts:11–14` calls OpenAI directly and records usage, without `organizationExecutionAllowed`/`admitProviderRequest`. Its caller `workflowAnswer` does not invoke those gates either. In contrast, ordinary Playground and agent runs pass through `startPlatformRun`, and ePACE uses `admitProviderRequest`.

Consequently an Admin can still trigger paid natural-review generation when organization agent execution has been disabled. The general HTTP request-rate guard still applies; this finding is specifically about the execution-policy/provider-admission checks.

Recommended change: run the same policy admission before paid generation, with a clear read-only local response when paid execution is unavailable.

### 10. P2 — Two Review Center AI settings give conflicting behavior

`app/api/service-review-center/chat/route.ts:61` sends requests to `workflowAnswer` when `REVIEW_CHAT_ENABLE_PAID_AI` is false. That workflow nevertheless invokes the paid natural rewrite by default when an API key exists, unless the separate `REVIEW_CHAT_NATURAL_AI` setting is false (`lib/service-review/natural-reply.ts:11`).

An operator who disables the original paid-chat setting can still incur paid calls. The new setting is documented in the example environment file, but the old setting's behavior no longer clearly communicates this distinction.

Recommended change: use one authoritative paid-chat switch, or rename and document the two independently controlled capabilities unambiguously.

## Role summary

| Surface | Current implementation | Main gap |
|---|---|---|
| Admin Playground | AI intent routing plus server workflows and staff lookup | Lookup precedence; write-policy enforcement |
| User Playground | Fixed replies | No general AI interpretation or follow-up memory |
| Employee Playground | AI leave interpretation; other services mostly sequential fields | Personal lookup interception; non-leave conversation handling |
| Manager Playground | Personal employee flow plus scoped team lookup | Same personal-service gaps; routing between self and team |
| Admin Review/Super assistant | Keyword backend routing plus AI wording | Mutations before intent; execution-policy/settings inconsistency |
| Manager Review assistant | Fixed read-only overview | Follow-up context and incomplete health totals |
| ePACE chat | AI over retrieved project passages | Retrieval does not resolve conversational references first |
| Agent Studio / published agents | Separate model/tool runtime | Inspected, not behaviorally verified; findings above do not certify these paths |

## Existing protections observed

Main workspace routes have session/role gates through the proxy. Staff request queries include an assigned-team scope. Role changes, company email and request decisions use saved confirmation tokens. Leave submission has a transaction lock and preview-version checks; the decision backend prevents self-approval and routes Manager leave review to Admins. ePACE filters records by user/project. Agent API writes require private-preview approval, and shared/published workflow writes are restricted. These are useful controls, but do not remove the gaps above.

## Recommended order

1. Correct action-intent detection and enforce write/execution controls at the action boundary.
2. Fix personal-versus-team lookup precedence and health totals.
3. Extend conversational interpretation to User, Manager overview and every employee service.
4. Resolve ePACE follow-ups before retrieving passages and make paid-AI settings consistent.

Behavioral verification remains for the user, as requested. This review does not establish current external connectivity, delivery, model availability, or successful execution of every flow.


## Implementation update — 14 October 2026

The ten findings above were addressed in source after approval to fix them:

- Added explicit action routing for monitoring/source-check commands; explanatory and negated messages do not authorize those operations.
- Added organization write-policy checks at request/leave submission, request-decision, role-change, catalog-creation and outgoing-chat-email boundaries. Read-only chat and unsent conversation details remain available.
- Added conversational User guidance grounded in public product facts and published vacancies, with recent chat and actual usage accounting.
- Added structured AI interpretation for every non-leave employee-service definition. Extracts multiple supplied fields, accepts canonicalized paraphrases and corrections, answers clarification questions without saving them as field values, and uses preview/version validation before submission.
- Prioritized own-record reads and personal leave over staff lookups; product-help questions no longer default to staff inventories.
- Added Manager overview reference resolution and natural wording over the permitted overview projection, preserving read-only scope.
- Removed the pre-count service truncation and the Manager source-query cap. Counts use all selected readings; displayed examples remain limited and disclosed.
- Moved ePACE thread-context loading before retrieval, with a standalone read-only query resolver for references. Final answering still uses the original question and freshly retrieved project passages. Cancellation propagates to the resolver.
- Added provider admission/execution policy checks to natural Review Center replies.
- Unified paid Review Center behavior: explicitly setting either `REVIEW_CHAT_ENABLE_PAID_AI=false` or `REVIEW_CHAT_NATURAL_AI=false` disables paid Review Center generation. Existing environment overrides are respected; the example configuration documents the master switch.

Existing Admin agent definitions, employee/manager roles, approval rules and submitted records were not edited. No tests or browser checks were run at the user's request. The original findings describe the reviewed pre-change implementation; the production build completed successfully, including TypeScript compilation, and the local application was restarted with npm start. Runtime conversation behavior remains unverified until the user's testing.

API implementation follows the official structured-output guidance: https://developers.openai.com/api/docs/guides/structured-outputs
