import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
const base = "http://localhost:3000",
    accounts = [],
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function signup() {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Disposable conversation test",
            email: `chat-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    assert.equal(r.status, 200);
    const a = {
        id: (await r.json()).user.id,
        cookie: r.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
    };
    accounts.push(a);
    return a;
}
async function api(a, suffix = "", body, status = 200, origin = base) {
    const r = await fetch(base + "/api/service-review-center/chat" + suffix, {
        method: body ? "POST" : "GET",
        headers: { Cookie: a?.cookie || "", Origin: origin, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000),
    });
    const d = await r.json();
    assert.equal(r.status, status, JSON.stringify(d));
    return d;
}
try {
    await api(null, "", undefined, 401);
    const a = await signup(),
        b = await signup();
    const first = await api(a, "", { action: "new-chat", requestId: randomUUID() });
    await api(b, "?conversationId=" + first.conversationId, undefined, 404);
    await api(
        b,
        "",
        {
            question: "Check scan status",
            requestId: randomUUID(),
            conversationId: first.conversationId,
        },
        404,
    );
    await api(
        a,
        "",
        { action: "new-chat", requestId: randomUUID() },
        403,
        "https://untrusted.invalid",
    );
    const requestId = randomUUID(),
        body = { question: "Check scan status", requestId, conversationId: first.conversationId };
    const answer = await api(a, "", body);
    assert.equal(answer.status, "completed");
    assert.deepEqual(await api(a, "", body).then((r) => r.id), answer.id);
    const second = await api(a, "", { action: "new-chat", requestId: randomUUID() });
    assert.equal((await api(a, "?conversationId=" + second.conversationId)).turns.length, 0);
    const previous = await api(a, "?conversationId=" + first.conversationId);
    assert.equal(previous.turns.length, 1);
    assert.equal(
        previous.conversations.find((c) => c.id === first.conversationId).title,
        "Check scan status",
    );
    await api(a, "", { ...body, conversationId: second.conversationId }, 409);
    assert.equal((await api(a, "?conversationId=legacy")).turns.length, 0);
    const worker = (
        await pool.query("SELECT checked_at,capabilities FROM security_scan_worker WHERE id=1")
    ).rows[0];
    assert.ok(Date.now() - new Date(worker.checked_at).getTime() < 90000);
    assert.ok(worker.capabilities.zap && worker.capabilities.trivy);
    console.log(
        "PASS: new chats persist independently, reload/history preserve answers, owner isolation, origin checks, idempotency and automatic worker heartbeat.",
    );
} finally {
    for (const a of accounts) await pool.query('DELETE FROM "user" WHERE id=$1', [a.id]);
    await pool.end();
}
