# Transactional mailing

Configured sender: **AIForce.Ops <ai.force.ops@gmail.com>** using Gmail SMTP on port 465 with TLS. The app password is held only in the ignored local `.env`; it is never returned by APIs or included in this document.

## Implemented flows

| Event | Recipient and behavior |
| --- | --- |
| Signup | New email/password signup receives only the verification code. No login session is created before verification. Signup does not grant employment or staff access. |
| Successful verification | The account receives its welcome email only after the saved emailVerified flag becomes true. A stable per-account dedupe key prevents duplicate welcome emails. Google-verified new accounts also qualify. |
| Email verification | Six-digit code, hashed in authentication storage, expires after ten minutes, maximum three attempts. Resend has a per-endpoint limit of three requests per minute. |
| Leave submission | Employee receives the saved request status; active assigned manager receives a review notification. If no active manager is assigned, active Admins receive the review notification. |
| Leave decision | Employee receives the recorded approval, rejection, cancellation or fulfilment status, with the saved decision maker's name where present. Medical reasons and private decision notes are excluded. |
| Offer letter | Admin enters recipient, position, department, start date, location, approved compensation and terms in Administration → Mail Center. Exact email preview and explicit confirmation are required. Preview expires after ten minutes; confirmation cannot be replayed. Sending an offer does not grant a role or confirm employment. |
| Test | Admin can send a test to their own signed-in email, up to five per hour. CLI verification can queue a test to the configured sender. |

Email verification is required for email/password login. Signup opens the verification screen; a valid code verifies the account and creates its session. Unverified existing accounts are directed to verification on their next password login. Existing sessions are not revoked by this change. The verification screen offers a return to sign-in rather than a workspace bypass.

## Queue and privacy

Migration `0036_mail_outbox.sql` creates the delivery queue and worker heartbeat. Leave notifications are queued within the same database transaction as the saved request or decision. Dedupe keys prevent repeated event insertion. SMTP runs separately from user requests.

Message bodies, including verification codes and offer terms, use AES-256-GCM encryption at rest. Successful or terminal deliveries clear the encrypted body. Drafts and OTP messages expire. Delivery metadata is retained for up to ninety days. Admin APIs expose metadata, never queue ciphertext or SMTP credentials. Draft preview is restricted to its creating active Admin. HTML templates escape entered values and include a plain-text alternative.

The worker claims up to five jobs with database locking and ninety-second leases. Temporary SMTP errors retry with exponential backoff, up to five attempts; permanent SMTP errors stop retries. Expired codes are not retried. Reserved `.invalid`, `.test` and `.example` recipients never produce external mail.

The Mail Center displays **SMTP accepted** after Gmail accepts a message. That is not proof of inbox placement or that the recipient read it. Bounce processing and delivery webhooks are not implemented. Delivery is at least once: a crash after SMTP acceptance and before the database update can cause a retry; a stable Message-ID is used but cannot guarantee provider deduplication.

## Running

Keep these server-only values in your local `.env` or deployment secret store:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=ai.force.ops@gmail.com
SMTP_PASS=<Gmail app password>
MAIL_ENCRYPTION_KEY=<32 random bytes encoded as 64 hex characters>
MAIL_WORKER_TOKEN=<random secret of at least 32 characters>
```

Use an app password for the sender account. Rotate the password shared in chat and replace `SMTP_PASS`, then restart the website and mail worker. Preserve `MAIL_ENCRYPTION_KEY` while existing encrypted jobs or drafts remain; changing it without re-encryption makes those bodies unreadable.

```sh
npm run db:migrate
npm run dev
```

Development starts the website and mail worker together. Production requires a separately supervised, always-on `npm run mail:worker` process alongside `npm run start`; `BETTER_AUTH_URL` must point to the deployed website. The worker uses a constant-time-checked bearer secret against `/api/mail-worker`. Do not expose its token in browser code.

```sh
node scripts/mail-check.mjs
node scripts/mail-check.mjs --queue-test
node tests/mail-system.mjs
```

The check script uses Node 24 TypeScript stripping. The second command queues a real test to the configured sender; tests otherwise use reserved fixture addresses and mocked SMTP. The application must be running for API integration tests.

## Verified locally on 8 October 2026

- Gmail TLS and authentication succeeded.
- A branded test to the sender mailbox was SMTP accepted on its first attempt, with the queue payload removed after acceptance. Inbox placement was not independently confirmed.
- Tests cover templates and HTML escaping, encryption/tamper detection, reserved-address suppression, worker retry/permanent rejection, attempt limits, lease/expiry behavior, private leave routing, automatic welcome/OTP hooks and Admin-only offer confirmation. API tests verified incorrect-code rejection, successful verification and rejection of code reuse.
- TypeScript and targeted ESLint checks passed. Browser visual verification was blocked by the browser tool's URL policy; the Mail Center layout has not been visually certified.
- Production dependency audit found three existing moderate reports in the Mammoth/argparse/sprintf-js chain; no high/critical production report and no Nodemailer report. This mail change does not resolve the document parser dependency reports.

## Deployment follow-up

Use a transactional provider or properly administered Workspace sender when volume and delivery assurance require it. Configure your production domain's mail authentication, monitor quotas/bounces, supervise the worker and alert on stale heartbeat or failed jobs. Gmail SMTP alone does not provide delivery webhooks. HR fulfilment, calendar bookings, signed PDF offer attachments and other employee-service notification types remain separate integrations.
