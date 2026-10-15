# Admin natural-language routing

Admin Playground free text is interpreted through a verified OpenAI Responses routing model before invoking an organization workflow. Admins do not need to memorize command phrases. Exact action buttons retain the existing server protocol so they remain available without an extra inference request.

The interpreter defaults to `gpt-4.1-mini`, independently of the Playground answer model. Configure `OPENAI_ADMIN_ROUTER_MODEL` on the server to override it, or set it to `selected` to use the selected answer model. Availability is checked against the API account's verified catalog before inference. The model distinction is shown in Admin Playground configuration. General conversation passes through to the selected answer model and its instructions; provider usage from both stages is recorded and combined in the response.

The model receives recent conversation, the project's capability/document catalogs, and the signed-in Admin's authoritative unexpired draft: its kind, missing field, permitted choices and supplied values. It does not receive SMTP credentials, attachment content or confirmation tokens. Strict function tools describe distinct supported intents. Continuation/editing tools require an existing draft; the confirmation-presentation tool requires a complete preview. Unknown, refused, incomplete, parallel or invalid calls do not execute.

Supported chat adapters prepare all 18 saved document templates, exact-body custom emails, website role assignments, departments, request decisions and mail status. They can also read the Admin profile and requests. The remaining capability catalog entries direct the Admin to their actual workspace controls. They do not create new integration capabilities: SMTP, scanners and automation services still need configuration, and payment checkout is not implemented.

Extracted initial fields must occur in user-authored conversation or already supplied server values. Existing form validators check addresses, dates, employment options, required details and account identities. Missing facts are asked for, not invented. Approved multiline content and custom mail bodies keep their original wording/formatting. Changing an email recipient, subject or body replaces its confirmation token; recipient/subject edits preserve the existing body.

The model cannot commit an email, role change, department or request decision. A natural request to proceed presents the saved preview's confirmation button. Only that exact server-issued button command reaches the existing permission, expiry, version and audit checks. This prevents an interpretation mistake from executing a consequential action. Cancellation can abandon an unexpired draft.

API usage, including incomplete responses, is recorded. Router output has its own bounded budget because reasoning and tool arguments share a token limit; a small user-facing answer setting must not truncate an action selection. No automatic paid retry occurs. Provider failures leave existing backend drafts intact.

Verification:

- `node tests/admin-natural-language.mjs`: strict schemas, all 66 destinations and 18 document adapters, sourced fields, draft isolation, missing/expired preview handling, exact multiline bodies and actual provider-usage accounting.
- `node tests/admin-natural-language.mjs --live`: live router-model interpretation of natural wording, follow-ups, ambiguity and negative confirmations; does not execute backend changes or send mail. Twenty-eight cases passed in the full run; a focused rerun also covered the added email-system question and four regressions.
- `node tests/admin-playground-routing.mjs`: actual POST dispatch, selected answer-model handoff, preserved instructions, pending-draft isolation and combined usage for complete/incomplete answers.
- `node tests/admin-role-draft.mjs`: sourced role/department details create a real saved preview without changing the account; invalid details, access checks and cancellation are verified inside a rollback transaction.
- Existing PostgreSQL rollback tests cover actual document templates/attachments, email edits, confirmed queues, role/department/request permissions, replay prevention and audit behavior.

Validation on 9 October 2026: TypeScript and lint passed. The offer, organization-document, custom-email and role-preview rollback suites passed. The older HTTP `tests/workspace-chat.mjs` could not authenticate its temporary signup account (401), so its full role/request integration result is unverified for this run; it is not counted as a passing check.

Implementation follows [OpenAI's function calling documentation](https://developers.openai.com/api/docs/guides/function-calling). The application validates every model-selected tool and supplies the actual backend result.
