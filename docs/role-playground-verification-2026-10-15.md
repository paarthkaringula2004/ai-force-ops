# User, Employee and Manager Playground verification

Date: 15 October 2026. Scope: the three role Playgrounds, their employee request operations, team decisions, own/team evidence, Manager employment/salary controls and role access. Payments and Agent implementation remain outside this task.

## Result

The tested role workflows work through real database-backed server code. This audit repaired request-routing and availability defects and verified actual OpenAI generation for one representative conversation per role. It is not a claim that every possible utterance or every external company system has been certified. Guided requests create and track records; submitting them does not itself order equipment, reserve rooms, grant external access, book travel, issue HR documents or pay expenses.

## Fixes

1. Exact menu items, declared options and confirmation buttons now go directly to their validated server workflows, avoiding unnecessary AI interpretation and allowing progression during AI outages.
2. Removed a no-key branch that could keep a saved non-leave request stuck without accepting the next answer. Interpreter failures now fall back to the guided workflow rather than disabling the conversation.
3. Questions asked while collecting a field are not saved as the field's answer by the deterministic fallback. AI can explain options when available; failure preserves existing answers.
4. Canonical options also accept ordinary trailing punctuation without repeating the question. Fixed room options such as Small meeting room being recognized again as a new room request instead of filling the current field.
5. Saved leave requests expose Resume/Cancel after refresh. The computed preview now includes explicit Confirm leave, Edit request and Cancel request buttons, so it can be reviewed and completed without relying on another AI interpretation.
6. Explicit request decisions run before personal request-number lookups, preventing Manager approvals from being mistaken for an own-request status query.
7. Added natural-language Employee cancellation and Manager approval/rejection selection over the latest 30 authorized records. Ambiguous selection asks for an eligible request; server previews and one-use confirmation remain mandatory. The model cannot confirm a decision. Self-approval and foreign-team decisions remain blocked.
8. Staff profile/status/team reads can use OpenAI to answer the actual question even without custom instructions. They receive authoritative server readings. Confirmed action results and protocols remain server-owned.
9. User greetings/thanks and permission denials have focused fallback replies. An unavailable AI cannot be presented as a successful general answer. User AI receives recent chat and published company vacancies, not private team records.
10. Added authoritative own-ticket reads for Employees/Managers and an organization write-policy guard to salary updates.
11. Repaired test dependency loading for JSON imports and updated routing/status harnesses to distinguish natural presentation from server truth. Natural replies are not required to have zero provider tokens.

## Employee request operations (both staff roles)

Every row below passed collection/complete preview, explicit submission, persisted request and repeated-submission protection through real server code, within a rolled-back SQL fixture. Leave additionally used the existing allocation/approval policy tests. The same 19 services were exercised for Employee and Manager: 38 persisted request workflows in rollback fixtures.

| Service | Employee | Manager | Actual outcome |
|---|---|---|---|
| Leave | Passed | Passed | Saved leave with computed entitlement/status; additional unpaid leave requires review. |
| Equipment | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Meeting room | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Access | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| IT / HR support | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Onboarding | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Resignation | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Employee referral | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Expense reimbursement | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Business travel | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Attendance correction | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Payroll query | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Employee benefits | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Internal transfer | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Learning and training | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Employment document | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Workplace concern | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Flexible work | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |
| Other employee service | Passed | Passed | Saved pending-approval request; external fulfilment is separate. |

## Role-specific coverage

| Role | Verified behavior | Evidence |
|---|---|---|
| User | Context-aware ordinary/product follow-ups, published-vacancy guidance inputs, own workspace choices, clear provider failure and role escalation denial | role-playground-routing; role-conversation-live; role-playground-http |
| Employee | All 19 services, field editing, question preservation, cancellation/resume, own request statuses, decision notes, ambiguity, own tickets and record isolation | staff-playground-actions; role-playground-routing; employee-request-status; leave-policy |
| Manager | All personal staff services, scoped team lists/evidence, approval/rejection previews and confirmation, self/foreign-team denial, employment confirmation with stable IDs, salary versions and policy denial | staff-playground-actions; role-playground-routing; staff-review-controls; staff-evidence-chat |
| Manager Review Center | Authorized overview selection, contextual time follow-up, actual down-service explanation without invented cause, demonstration-value labels and no private diagnostics | manager-review-display; staff-evidence-chat; shared-organization coverage from Admin audit |
| All three | Verified fixture logins, real deployed menus/snapshots/wallets, Admin/eAssist/security denial; only Manager has team/overview access; Employee ePACE remains locked until confirmation | role-playground-http |

## Validation evidence

- Production build and TypeScript: passed. Focused source ESLint: passed, no diagnostics.
- staff-playground-actions: passed, both roles and all 19 services, room/laptop step progression, editing, invalid count, cancellation, ownership and Manager decision confirmation.
- role-playground-routing: passed, actual API handlers with provider responses/failures simulated; natural field extraction, negated submission, offline answers, request decisions, self/foreign-team denial, actual rejection/cancellation and server ticket values.
- staff-review-controls: passed, real employment/salary mutation and access/version/policy checks inside rollback fixtures.
- leave-policy: passed, allocation, automatic approval, carry-forward, cancellation, unpaid deduction, paid exceptions and Admin review of Manager leave.
- staff-evidence-chat and manager-review-display: passed, own/team scopes, role revocation, all service types, profile/meetings/tool/usage/ePACE metadata, follow-ups and safe overview wording.
- role-conversation-live --live: passed against OpenAI gpt-4.1-mini for User contextual follow-up, Employee one-message equipment preview and Manager grounded approval preview. These were synthetic fixtures with isolated test policy and ticket credit, then rolled back; no actual team decision was applied.
- role-playground-http: passed against the running app with three verified disposable accounts; exact accounts cleaned afterward. [Raw HTTP evidence](verification/role-playground-http-2026-10-15.json).
- Admin routing and natural-language suites: passed as regression coverage for the shared endpoint.

Tests refer to ../tests/<name>.mjs. Live provider checks are explicit opt-in (--live), while mutation fixtures roll back or remove their exact reserved .invalid accounts.

## Boundaries

AI generation still depends on provider availability, organization execution policy and available tickets. During an outage, the assistant labels fallback guidance and retains guided operations; it does not pretend a model answered. Tests sample natural conversation rather than guarantee every phrasing. External calendars, procurement, HR/finance fulfilment and production infrastructure acceptance require their separate connected-system tests. No broad production certification is implied.
