import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";

// Real database, transactions, wallet policy and handlers. Only the vendor API
// is simulated. The outer rollback removes every fixture and configuration.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    c = await pool.connect();
let tx = 0,
    actor = null,
    sequence = 0,
    failProvider = false;
const client = {
    async query(sql, args) {
        if (sql === "BEGIN") return c.query("SAVEPOINT payment_test_" + ++tx);
        if (sql === "COMMIT") return c.query("RELEASE SAVEPOINT payment_test_" + tx--);
        if (sql === "ROLLBACK") {
            await c.query("ROLLBACK TO SAVEPOINT payment_test_" + tx);
            return c.query("RELEASE SAVEPOINT payment_test_" + tx--);
        }
        return c.query(sql, args);
    },
    release() {},
};
const db = { query: (sql, args) => c.query(sql, args), connect: async () => client };
const access = {
    workspaceAccess: async (id) =>
        (await c.query("SELECT * FROM workspace_members WHERE user_id=$1", [id])).rows[0],
};
const { PaymentError } = load("lib/payment-provider.ts");
const payments = new Map(),
    providerOrders = new Map();
const provider = {
    PaymentError,
    async razorpay(config, path, method, body) {
        if (failProvider) throw new PaymentError("Simulated vendor unavailable.", 503);
        if (path === "/orders?count=1") return { items: [] };
        if (path === "/orders" && method === "POST") {
            const id = "order_fixture" + ++sequence;
            providerOrders.set(id, body);
            return { ...body, id };
        }
        if (path.startsWith("/orders/") && !path.endsWith("/payments"))
            return { ...providerOrders.get(path.split("/")[2]), id: path.split("/")[2] };
        if (path.startsWith("/payments/")) return payments.get(path.slice("/payments/".length));
        if (path.endsWith("/payments"))
            return {
                items: [...payments.values()].filter((p) => p.order_id === path.split("/")[2]),
            };
        throw Error("Unexpected provider call " + path);
    },
};
const deps = {
    "./db": { db },
    "@/lib/db": { db },
    "./workspace-access": access,
    "@/lib/workspace-access": access,
    "./payment-provider": provider,
    "@/lib/payment-provider": provider,
    "./request-session": {
        getRequestSession: async () => (actor ? { user: { id: actor } } : null),
    },
    "./currency-rate": {
        currencyRate: async () => ({
            usdInr: 100,
            source: "fixture",
            checkedAt: new Date().toISOString(),
        }),
    },
};
const review = load("lib/payment-review.ts", deps),
    api = load("lib/payments.ts", deps),
    configRoute = load("app/api/payments/configuration/route.ts", deps),
    orderRoute = load("app/api/payments/orders/route.ts", deps),
    http = load("lib/payment-http.ts", deps),
    usage = load("lib/model-usage.ts", deps);
const sign = (secret, value) => createHmac("sha256", secret).update(value).digest("hex");
const keySecret = "fixture-key-secret-only",
    webhookSecret = "fixture-webhook-secret-only";
const body = (revision = null, mode = "test") => ({
    revision,
    mode,
    keyId: "rzp_" + mode + "_fixture1234",
    keySecret,
    webhookSecret,
    businessName: "Fixture only",
    liveAcknowledged: true,
    merchantPolicies: {
        termsUrl: "https://example.invalid/terms",
        privacyUrl: "https://example.invalid/privacy",
        refundUrl: "https://example.invalid/refunds",
        supportEmail: "payments@example.invalid",
    },
    publicOrigin: mode === "test" ? "http://localhost:3000" : "https://payments.example.invalid",
    enabled: true,
});
const request = (value, origin = "http://localhost:3000") =>
    new Request("http://localhost:3000/api/payments/configuration", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(value),
    });
const wallet = async (id) =>
    (await c.query("SELECT * FROM ticket_wallets WHERE user_id=$1", [id])).rows[0];
async function fixture(role) {
    const id = randomUUID();
    await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [id, "Payment test", id + "@example.invalid"],
    );
    await c.query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [id, role]);
    return id;
}
function captured(order, patch = {}) {
    const p = {
        id: "pay_fixture" + ++sequence,
        order_id: order.fields.order_id,
        amount: Number(order.fields.amount),
        currency: "INR",
        status: "captured",
        captured: true,
        amount_refunded: 0,
        ...patch,
    };
    payments.set(p.id, p);
    return p;
}
const callback = (p, signature = sign(keySecret, p.order_id + "|" + p.id)) =>
    api.paymentCallback({
        razorpay_order_id: p.order_id,
        razorpay_payment_id: p.id,
        razorpay_signature: signature,
    });
const webhook = (p) => {
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: p } } });
    return api.paymentWebhook(raw, sign(webhookSecret, raw), "fixture-event-" + p.id);
};
try {
    await c.query("BEGIN");
    await c.query("UPDATE payment_settings SET configuration_id=NULL WHERE id=true");
    const admin = await fixture("admin"),
        user = await fixture("user"),
        other = await fixture("user"),
        employee = await fixture("employee");
    actor = null;
    assert.equal((await configRoute.POST(request(body()))).status, 401);
    actor = user;
    assert.equal((await configRoute.POST(request(body()))).status, 403);
    actor = employee;
    assert.equal(
        (
            await orderRoute.POST(
                request({ contact: "919999999999", tickets: 100, requestId: randomUUID() }),
            )
        ).status,
        403,
    );
    actor = admin;
    assert.equal((await configRoute.POST(request(body(), "https://evil.example"))).status, 403);
    await assert.rejects(() => http.paymentJson(request([])), /valid payment/);
    await assert.rejects(
        () =>
            http.paymentBody(
                new Request("http://localhost", { method: "POST", body: "x".repeat(65537) }),
                65536,
            ),
        (e) => e.status === 413,
    );
    assert.equal((await api.paymentState(admin)).integration, null);
    await assert.rejects(
        () =>
            api.createPaymentOrder(user, {
                contact: "919999999999",
                requestId: randomUUID(),
                tickets: 100,
            }),
        /not enabled/,
    );
    await assert.rejects(
        () => api.savePaymentConfig(admin, { ...body(), publicOrigin: "http://unsafe.example" }),
        /HTTPS/,
    );
    await assert.rejects(
        () => api.savePaymentConfig(admin, { ...body(), keyId: "rzp_live_fixture1234" }),
        /matching Key ID/,
    );
    await assert.rejects(
        () => api.savePaymentConfig(admin, { ...body(), webhookSecret: "short" }),
        /16 characters/,
    );
    await assert.rejects(
        () => api.savePaymentConfig(admin, { ...body(null, "live"), liveAcknowledged: false }),
        /acceptance checks/,
    );
    const config = await api.savePaymentConfig(admin, body());
    const stored = await api.currentPaymentConfig();
    assert.notEqual(stored.key_cipher, keySecret);
    assert.ok(!JSON.stringify(config).includes(keySecret));
    assert.ok(!JSON.stringify(await api.paymentState(user)).includes("rzp_test"));
    await assert.rejects(
        () => api.savePaymentConfig(admin, body()),
        (e) => e.status === 409,
    );
    console.log(
        "PASS auth, Admin-only configuration, CSRF, bounded bodies, validation, encrypted credentials and stale revision.",
    );

    const attempt = randomUUID(),
        order = await api.createPaymentOrder(user, {
            contact: "919999999999",
            tickets: 100,
            amount: 1,
            requestId: attempt,
        });
    assert.equal(order.fields.amount, "8000");
    assert.equal(order.action, "https://api.razorpay.com/v1/checkout/embedded");
    assert.deepEqual(
        await api.createPaymentOrder(user, {
            contact: "919999999999",
            tickets: 100,
            requestId: attempt,
        }),
        order,
    );
    await assert.rejects(
        () =>
            api.createPaymentOrder(other, {
                contact: "919999999999",
                tickets: 100,
                requestId: attempt,
            }),
        (e) => e.status === 409,
    );
    await assert.rejects(
        () =>
            api.createPaymentOrder(user, {
                contact: "919999999999",
                tickets: 250,
                requestId: attempt,
            }),
        (e) => e.status === 409,
    );
    await assert.rejects(
        () =>
            api.createPaymentOrder(user, {
                contact: "919999999999",
                tickets: 101,
                requestId: randomUUID(),
            }),
        /valid ticket pack/,
    );
    const baseline = Number((await wallet(user)).balance),
        p = captured(order);
    await assert.rejects(() => callback(p, "0".repeat(64)), /signature/);
    for (const patch of [
        { status: "authorized", captured: false },
        { amount: 1 },
        { currency: "USD" },
        { order_id: "order_wrong" },
        { amount_refunded: 1 },
    ]) {
        payments.set(p.id, { ...p, ...patch });
        await assert.rejects(() => callback(p), /captured, matching/);
    }
    payments.set(p.id, p);
    assert.equal((await callback(p)).state, "test_paid");
    assert.equal((await webhook(p)).credited, 0);
    assert.equal(Number((await wallet(user)).balance), baseline);
    assert.equal(
        (
            await c.query(
                "SELECT count(*) FROM ticket_ledger WHERE user_id=$1 AND kind='purchase'",
                [user],
            )
        ).rows[0].count,
        "0",
    );
    await assert.rejects(() => api.reconcilePayment(other, order.id), /No confirmed/);
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: p } } });
    await assert.rejects(() => api.paymentWebhook(raw, "0".repeat(64), "forged"), /signature/);
    console.log(
        "PASS fixed server price, owned idempotent orders, forged/mismatched/uncaptured/refunded rejection, Test isolation.",
    );

    const live = await api.savePaymentConfig(admin, body(config.id, "live"));
    await assert.rejects(
        () =>
            api.createPaymentOrder(admin, {
                contact: "919999999999",
                tickets: 100,
                requestId: randomUUID(),
            }),
        /unlimited/,
    );
    const liveOrder = await api.createPaymentOrder(user, {
            contact: "919999999999",
            tickets: 250,
            requestId: randomUUID(),
        }),
        paid = captured(liveOrder);
    assert.equal((await webhook(paid)).credited, 250);
    assert.equal((await callback(paid)).state, "paid");
    assert.equal((await api.reconcilePayment(user, liveOrder.id)).credited, 250);
    assert.equal(Number((await wallet(user)).balance), baseline + 250);
    assert.equal(Number((await wallet(user)).paid_balance), 250);
    assert.equal(
        (
            await c.query(
                "SELECT count(*) FROM ticket_ledger WHERE user_id=$1 AND kind='purchase'",
                [user],
            )
        ).rows[0].count,
        "1",
    );
    const pending = await api.createPaymentOrder(user, {
        contact: "919999999999",
        tickets: 100,
        requestId: randomUUID(),
    });
    await api.savePaymentConfig(admin, { revision: live.id, action: "pause" });
    await assert.rejects(
        () =>
            api.createPaymentOrder(user, {
                contact: "919999999999",
                tickets: 100,
                requestId: randomUUID(),
            }),
        /not enabled/,
    );
    assert.equal((await callback(captured(pending))).credited, 100);
    console.log(
        "PASS Live fixture credits exactly once across webhook/callback/reconciliation, history isolation and pause-safe settlement.",
    );

    await c.query("UPDATE workspace_members SET role='employee' WHERE user_id=$1", [user]);
    await c.query("SELECT refresh_ticket_wallet($1)", [user]);
    assert.equal(Number((await wallet(user)).balance), 400); // 350 purchased + 50 daily
    await c.query(
        "UPDATE ticket_wallets SET last_refill_date=last_refill_date-1,balance=360 WHERE user_id=$1",
        [user],
    );
    await c.query("SELECT refresh_ticket_wallet($1)", [user]);
    assert.equal(Number((await wallet(user)).balance), 400);
    await c.query("UPDATE ticket_wallets SET balance=paid_balance WHERE user_id=$1", [user]);
    await usage.recordModelUsage(user, "payment-fixture", {
        modelId: "gpt-4.1-mini",
        inputTokens: 10000,
        outputTokens: 0,
    });
    const used = await wallet(user);
    assert.ok(Number(used.paid_balance) < 350);
    assert.equal(Number(used.balance), Number(used.paid_balance));
    assert.ok(
        (
            await c.query(
                "SELECT 1 FROM workspace_audit WHERE actor_id=$1 AND action='payment.integration_paused'",
                [admin],
            )
        ).rowCount,
    );
    console.log(
        "PASS purchased-credit carry-forward, daily reset, usage consumption and integration audit.",
    );

    await api.savePaymentConfig(admin, { ...body(live.id), enabled: true });
    failProvider = true;
    const uncertain = randomUUID();
    await assert.rejects(
        () =>
            api.createPaymentOrder(other, {
                contact: "919999999999",
                tickets: 100,
                requestId: uncertain,
            }),
        (e) => e.status === 503,
    );
    failProvider = false;
    await assert.rejects(
        () =>
            api.createPaymentOrder(other, {
                contact: "919999999999",
                tickets: 100,
                requestId: uncertain,
            }),
        (e) => e.status === 409,
    );
    providerOrders.set("order_fixtureRecovery", {
        receipt: uncertain,
        amount: 8000,
        currency: "INR",
    });
    await assert.rejects(
        () => api.recoverPayment(admin, { id: uncertain, providerId: "order_fixtureRecovery" }),
        (e) => e.status === 409,
    );
    assert.equal(
        (await api.recoverPayment(other, { id: uncertain, providerId: "order_fixtureRecovery" }))
            .state,
        "pending",
    );
    console.log(
        "PASS provider outage cannot create unverified credit or silently duplicate an uncertain attempt.",
    );
    await assert.rejects(
        () => api.paymentWebhook("null", "", ""),
        (e) => e.status === 400,
    );
    await assert.rejects(
        () =>
            api.createPaymentOrder(other, {
                contact: "919999999999",
                tickets: 100,
                requestId: attempt,
            }),
        (e) => e.status === 409,
    );
    // A settled purchase cannot be reopened for checkout.
    await c.query("UPDATE workspace_members SET role='user' WHERE user_id=$1", [user]);
    await assert.rejects(
        () =>
            api.createPaymentOrder(user, {
                contact: "919999999999",
                tickets: 250,
                requestId: liveOrder.id,
            }),
        (e) => e.status === 409,
    );
    payments.set(paid.id, { ...paid, amount_refunded: 8000 });
    const refundRaw = JSON.stringify({
        event: "refund.processed",
        payload: { refund: { entity: { payment_id: paid.id } } },
    });
    assert.equal(
        (await api.paymentWebhook(refundRaw, sign(webhookSecret, refundRaw), "refund-fixture"))
            .state,
        "refund_review",
    );
    assert.ok((await review.refundQueue(admin)).some((r) => r.id === liveOrder.id));
    await assert.rejects(
        () =>
            review.resolveRefund(other, {
                kind: "tickets",
                id: liveOrder.id,
                refundedAmount: 8000,
                confirm: true,
            }),
        (e) => e.status === 403,
    );
    await assert.rejects(
        () =>
            review.resolveRefund(admin, {
                kind: "tickets",
                id: liveOrder.id,
                refundedAmount: 1,
                confirm: true,
            }),
        (e) => e.status === 409,
    );
    const beforeRefund = Number((await wallet(user)).balance);
    assert.equal(
        (
            await review.resolveRefund(admin, {
                kind: "tickets",
                id: liveOrder.id,
                refundedAmount: 8000,
                confirm: true,
            })
        ).ticketsDebited,
        100,
    );
    assert.equal(Number((await wallet(user)).balance), beforeRefund - 100);
    assert.equal(
        (
            await review.resolveRefund(admin, {
                kind: "tickets",
                id: liveOrder.id,
                refundedAmount: 8000,
                confirm: true,
            })
        ).ticketsDebited,
        0,
    );
    assert.equal(
        (
            await api.paymentWebhook(
                refundRaw,
                sign(webhookSecret, refundRaw),
                "refund-fixture-replay",
            )
        ).state,
        "refunded",
    );
    console.log(
        "PASS malformed webhook, settled checkout protection, refund review, partial-ticket adjustment and replay protection.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
