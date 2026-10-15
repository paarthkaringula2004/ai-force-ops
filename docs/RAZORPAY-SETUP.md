# Razorpay organization payment setup

## Implemented billing

Payments supports fixed INR ticket packs and the original recurring membership catalog:

| Plan | Charge / cycle | Instant tickets | Daily tickets | Period |
|---|---:|---:|---:|---:|
| Monthly | ₹799 | 1,000 | 50 | 30 days |
| Weekly | ₹159 | 200 | 30 | 7 days |
| Weekly Lite | ₹50 | 20 | 10 | 7 days |

The Monthly product is an exact 30-day period, not a variable calendar month. Daily rewards are earned after each complete 24 hours from the verified cycle payment. Reads and usage post all earned rewards, including missed days, once, capped at 30 or 7 days. There is no requirement to keep a browser open or click daily. Test mode records cycles and never grants spendable tickets.

Each subscription has an explicit user-selected limit of 1–120 charges (default 12). The customer must accept the displayed recurring price and period before preparing checkout. Razorpay then collects authorization. Cancellation is confirmed in the app and sent to Razorpay: active memberships cancel at cycle end, while unactivated subscriptions cancel immediately. Cancellation does not itself refund a paid cycle. Payment/invoice verification controls rewards; an Active status or browser redirect alone never grants tickets.

## Configure later without code changes

1. As Admin, open **Payments → Payment integration**. Start in Test mode. Enter matching Razorpay Key ID / Key Secret, business name, application origin and a strong webhook secret (minimum 16 characters). Secrets are encrypted on the server and are not returned to the UI.
2. For memberships, create three plans in the same Razorpay account/mode. Monthly: INR 79900 paise, `period=daily`, `interval=30`. Weekly: INR 15900 paise, `daily/7` or `weekly/1`. Lite: INR 5000 paise, `daily/7` or `weekly/1`. Paste their Plan IDs into the matching fields. Save verifies amount, currency and frequency. Blank mappings leave only those memberships unavailable.
3. Set automatic capture in Razorpay. Add the generated public HTTPS webhook endpoint and the identical webhook secret. Subscribe to `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, and `subscription.updated`.
4. Save and verify the API, then enable Test checkout. Ticket checkout requires a phone number including country code; account email is taken from the signed-in account. These details go to Razorpay when the customer continues. The entered phone is not stored here. Membership authorization uses the provider-hosted subscription link.
5. Test real provider Test flows on your deployed HTTPS origin: successful/failed/cancelled checkout, signed webhook, repeated notification, membership activation/renewal, cancellation, and refund review. **Check payment** and **Check membership** reconcile missed callbacks/webhooks. Unknown creation attempts can be recovered using a matching order/subscription ID from Razorpay; the server verifies the original receipt or membership notes and ownership before accepting the reference.
6. Add your public Terms, Privacy and Refund policy URLs and payment support email. The customer sees these links. They must be supplied before Live checkout can be enabled. Review the policies and complete Razorpay account activation and the acceptance checks; explicitly confirm the Live checklist. Change to matching Live keys/Plan IDs, configure the Live webhook, then enable Live checkout deliberately.

The app does not create your legal policies or verify their legal adequacy. API verification is a read-only credential check. The **Payment readiness** card separately reports whether a valid signed webhook has been observed for the saved configuration. It is not a compliance certificate.

Localhost HTTP is allowed for browser Test callbacks only; vendor webhooks require a public HTTPS origin. A real deployment must forward the signed webhook and callback paths without session/CSRF interception. No new code is needed to fill the setup fields, but account activation, plan creation, webhook setup and provider acceptance remain your actions.

Official references: [Hosted Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/hosted/integration-steps/), [creating plans](https://razorpay.com/docs/api/payments/subscriptions/create-plan/), [creating subscriptions](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/), [subscription webhooks](https://razorpay.com/docs/webhooks/subscriptions/), [subscription invoices](https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices/), [webhook validation](https://razorpay.com/docs/webhooks/validate-test/).

Every active role can view its own billing history and cancel its existing subscriptions after a role change. New purchases are limited to User accounts (and Admin Test mode); staff ticket allocation remains organizational. Integration and refund review are Admin-only. Before disabling a member, cancel any unwanted provider renewal through the organization billing process.

## Refund operating procedure

Issue/approve monetary refunds in the Razorpay Dashboard using your organization's authority policy. This app does not send money or provide a refund-creation API.

A signed refund webhook and authenticated provider lookup place previously credited Live purchases in **Organization refund review**. Ticket spending is held until the Admin resolves the accounting adjustment. The Admin reviews the amount and confirms; the server re-fetches the refund and removes the proportional already-granted tickets exactly once. If those tickets were spent and the balance is insufficient, the hold remains: resolve repayment or an expressly approved ticket allocation before retrying. Partial refunds round the required ticket removal upward to a whole ticket. Test refunds remove zero spendable tickets.

Any membership refund stops all future rewards for that paid cycle, even after its existing-ticket adjustment is resolved. New paid renewal cycles are separate. This policy is displayed to customers; reflect it in your refund terms. Cancelling renewal and issuing a refund are different actions.

## Organization launch boundaries

The code is prepared for credentials and tested with simulated vendor responses against the real database. No real payment, bank verification, mandate or subscription was created during development. Do not describe it as certified production billing merely because automated tests passed.

Before accepting money, validate the actual Razorpay Test flows and confirm your live account, deployment TLS/origin, webhook reachability, settlement reconciliation and incident ownership. Provide organization-approved refund, privacy and support policies. Tax invoices/GST treatment, accounting exports, statutory retention and dispute/chargeback decisions remain organization finance/compliance responsibilities; this app does not replace a tax/accounting system. Disputes must be monitored in Razorpay and handled under your incident process, including disabling affected accounts if appropriate. No automated dispute adjudication is implemented.

Back up PostgreSQL and `BETTER_AUTH_SECRET` securely. Stored payment credentials rely on this encryption key; replacing it without re-encryption prevents pending-order reconciliation. Configuration revisions retain old credentials for outstanding orders, but revoked vendor keys can no longer be used. Accounts with payment or subscription history cannot be deleted through normal member deletion. Pausing checkout blocks new purchases, while existing captured payments and membership renewals can still settle; pausing the integration does not cancel vendor subscriptions. Cancel those individually before retiring the service.

## Verification commands

- `node tests/payments.mjs`: real PostgreSQL rollback fixtures; role/origin/input validation, secrets, server price, owned replay, captured amount/currency/signatures, provider failure/recovery, paid-credit carry-forward and partial-refund accounting.
- `node tests/membership-billing.mjs`: plan mapping, consent, ownership, Test isolation, cancellation, captured invoice credit, replay, daily caps, renewal and membership refund hold/adjustment.
- `node tests/payment-concurrency.mjs`: simultaneous callback, webhook and replay across independent database transactions; exactly one wallet credit.
- `node tests/payment-transport.mjs`: fixed provider host/method paths, no redirects, response size/JSON checks and sanitized failures; no network call.
- `node tests/payments-http.mjs`: rebuilt local app routes and role boundaries using disposable accounts; no vendor call.
- `node tests/admin-core-actions.mjs`: ticket allocation and account deletion regressions.

Run `npm run db:migrate` on every deployment before installing the new build. This feature uses migrations 0063–0066.
