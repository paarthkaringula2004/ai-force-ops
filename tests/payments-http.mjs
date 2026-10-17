import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { fixtureAccount, cleanupFixture } from "./helpers/account.mjs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    fixtures = [];
const base = process.env.WORKSPACE_TEST_URL || "http://localhost:3000";
async function call(path, account, body) {
    const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: {
            Origin: base,
            "content-type": "application/json",
            ...(account ? { Cookie: account.cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
    });
    return r;
}
try {
    assert.equal((await call("/api/payments")).status, 401);
    assert.equal(
        (await call("/api/payments/webhook", null, { event: "payment.captured" })).status,
        400,
    );
    const callback = await fetch(base + "/api/payments/callback", {
        method: "POST",
        body: "razorpay_order_id=order_unknown&razorpay_payment_id=pay_unknown&razorpay_signature=invalid",
        redirect: "manual",
    });
    assert.equal(callback.status, 400);
    for (const role of ["admin", "user", "employee"]) {
        const a = await fixtureAccount(pool, {
            role,
            base,
            name: "Disposable payment route check",
        });
        fixtures.push(a);
        const state = await call("/api/payments", a);
        assert.equal(state.status, 200);
        {
            const data = await state.json();
            assert.equal(data.canConfigure, role === "admin");
            assert.equal(data.unlimited, role === "admin");
            assert.equal(data.integration, null);
            assert.equal(data.orders.length, 0);
            assert.equal(data.canPurchase, role !== "employee");
        }
        const config = await call("/api/payments/configuration", a, {
            revision: null,
            action: "pause",
        });
        assert.equal(config.status, role === "admin" ? 200 : 403);
        assert.equal((await call("/api/payments/review", a)).status, role === "admin" ? 200 : 403);
        assert.equal(
            (
                await call("/api/payments/memberships", a, {
                    plan: "monthly",
                    requestId: randomUUID(),
                    cycles: 12,
                    acceptRecurring: true,
                })
            ).status,
            role === "employee" ? 403 : 409,
        );
        const order = await call("/api/payments/orders", a, {
            tickets: 100,
            contact: "919999999999",
            requestId: randomUUID(),
        });
        assert.equal(order.status, role === "employee" ? 403 : 409);
    }
    console.log(
        "PASS live HTTP routes: anonymous auth, signed public endpoints, Admin/User/Employee boundaries, unconfigured checkout rejection. No provider request or charge.",
    );
} finally {
    for (const fixture of fixtures.reverse()) await cleanupFixture(pool, fixture);
    await pool.end();
}
