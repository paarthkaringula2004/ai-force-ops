# Leave and payroll policy

The workspace company policy grants two paid calendar days per month. Unused entitlement carries forward without expiry or a cap. Accrual starts in the later of the policy activation month and the staff member's recorded employment confirmation month (account creation month when no confirmation exists). It does not invent an opening balance for earlier employment.

Leave dates are resolved in Asia/Kolkata, including tomorrow, next Monday, date ranges and half days. One conversation can supply type, dates and reason. The assistant displays a professional request/mail preview and asks for confirmation before writing a leave request. Conversation state is retained internally without a saved-draft popup.

Employee and Manager free-text messages now use an OpenAI Responses function call to interpret personal leave intent. The interpreter receives recent conversation turns, the active leave preview, and up to five of the signed-in person's submitted leave records (type, dates, reason and status). Confirmation does not erase submitted context: a follow-up such as “the 14th, same reason” can prepare a separate sick-leave request without re-asking known details. No other employee's records, salary, credentials or payroll settings are passed to this interpreter. Exact navigation and confirmation buttons remain server protocols. Other active request workflows retain their existing behavior.

The selected Playground model is used unless `OPENAI_EMPLOYEE_ROUTER_MODEL` is configured. Model usage is recorded. The model only proposes validated leave fields: it cannot set a paid balance, approval, payroll amount or recipient. The server recomputes allocation, checks for concurrent preview changes and overlapping submitted requests, and requires explicit confirmation. Incomplete, invalid or failed model responses do not submit leave. Existing local guided parsing remains available when the OpenAI key is absent; it is not represented as a model call.

Available entitlement includes approved, fulfilled and pending paid reservations. Future reservations constrain earlier use of carried days so the same days cannot be spent twice. Rejection or cancellation releases reserved entitlement. Fully covered leave is automatically approved; additional days default unpaid and need review. Assigned Managers or Admins review employee leave. Only Admins review Managers' leave. Self-approval is forbidden.

Reviewers can grant additional paid exceptions or change unpaid deductions with an audit note. A paid exception adds a company benefit without consuming extra future entitlement. An unpaid decision releases the request's paid entitlement.

Managers can configure assigned employees' monthly salaries; Admins configure staff salaries including Managers. The company chooses actual calendar days or a fixed 30-day payroll divisor. Deductions are rounded to currency cents and capped against monthly salary. Base salary is preserved. Amounts are recorded for payroll review, not transferred to an external payroll system. Missing salary prevents approval of unpaid leave. Reviewer changes use version checks and audited transactions.

Leave notifications use the configured mail outbox. Queued mail is not proof of delivery. No Manager email is required for automatic paid approval; unpaid requests notify the appropriate reviewers when mail is configured.

Validation: `node tests/leave-policy.mjs` checks relative dates, timezone boundaries, carry-forward, future reservations, cancellations, automatic approval, unpaid deductions, paid exceptions and Manager/Admin permissions using database fixtures rolled back at completion. No test email is sent.

`node tests/leave-ai-intent.mjs` validates model-field boundaries. Add `--live` to exercise real OpenAI calls with synthetic context, including post-confirmation follow-ups and negated submission. Live checks consume API tokens but do not create employee requests or send email.
