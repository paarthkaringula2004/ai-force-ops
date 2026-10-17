import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://localhost:3000",
    users = [];
async function call(
    cookie,
    path,
    body,
    method = body ? "POST" : "GET",
    status = 200,
    origin = base,
) {
    const r = await fetch(base + path, {
        method,
        headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data;
}
async function account() {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Employee workflow test",
            email: `employee-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    assert.equal(r.status, 200);
    const user = (await r.json()).user.id;
    users.push(user);
    return {
        user,
        cookie: r.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
    };
}
const ask = (cookie, text) =>
    call(cookie, "/api/playground", { model: "", messages: [{ role: "user", content: text }] });
try {
    const a = await account(),
        b = await account();
    assert.match((await ask(a.cookie, "hello")).reply, /Employee workflow test/);
    assert.doesNotMatch(
        (await ask(a.cookie, "what can you help with")).reply,
        /scanner|vulnerabilit|system health/i,
    );
    assert.match((await ask(a.cookie, "About AIForce.Ops")).reply, /Agent Studio/);
    assert.match((await ask(a.cookie, "show my leave balance")).reply, /not connected/);
    await ask(a.cookie, "Request a laptop");
    await ask(a.cookie, "New allocation");
    await ask(a.cookie, "32GB RAM, 1TB SSD for development");
    await ask(a.cookie, "Laptop bag");
    const ready = await ask(a.cookie, "Joining a new team");
    assert.deepEqual(ready.choices, ["Submit request", "Edit request", "Cancel request"]);
    const snapshot = await call(a.cookie, "/api/playground/employee");
    assert.equal(snapshot.draft.fields.requirements, "32GB RAM, 1TB SSD for development");
    assert.equal((await call(b.cookie, "/api/playground/employee")).draft, null);
    await call(
        a.cookie,
        "/api/playground",
        { model: "", messages: [{ role: "user", content: "Submit request" }] },
        "POST",
        403,
        "https://other.invalid",
    );
    const submitted = await ask(a.cookie, "Submit request");
    assert.match(submitted.reply, /REQ-/);
    assert.match(submitted.reply, /pending/);
    await ask(a.cookie, "Submit request");
    assert.equal((await call(a.cookie, "/api/playground/employee")).requests.length, 1);
    assert.equal((await call(b.cookie, "/api/playground/employee")).requests.length, 0);
    await ask(a.cookie, "Book a meeting room");
    await ask(a.cookie, "Chennai office");
    await ask(a.cookie, "24 October 2026, 3pm-4pm IST");
    assert.match((await ask(a.cookie, "zero")).reply, /attendee count/);
    await ask(a.cookie, "2 people");
    await ask(a.cookie, "Team planning");
    await ask(a.cookie, "Video conferencing");
    assert.match((await ask(a.cookie, "Submit request")).reply, /No room has been reserved/);
    await ask(a.cookie, "Start onboarding");
    await ask(a.cookie, "Sales");
    await ask(a.cookie, "Pause until later");
    assert.match((await ask(a.cookie, "Resume my request")).reply, /start date/);
    await call(a.cookie, "/api/playground/state", undefined, "DELETE");
    const reset = await call(a.cookie, "/api/playground/employee");
    assert.equal(reset.draft, null);
    assert.equal(reset.requests.length, 2);
    assert.match((await ask(a.cookie, "My requests")).reply, /Meeting room/);
    for (const steps of [
        [
            "Apply RH leave for Diwali",
            "24 October 2026, full day",
            "Festival celebration with family",
        ],
        ["Request access", "Team office", "Project work for one month"],
        ["IT support", "Windows", "Settings displays incorrect memory"],
        ["Start onboarding", "Sales", "1 November 2026, Chennai", "Laptop"],
    ]) {
        for (const step of steps) await ask(a.cookie, step);
        assert.deepEqual((await call(a.cookie, "/api/playground/employee")).choices, [
            "Submit request",
            "Edit request",
            "Cancel request",
        ]);
        await ask(a.cookie, "Submit request");
    }
    assert.equal((await call(a.cookie, "/api/playground/employee")).requests.length, 6);
    console.log(
        "PASS: guided employee flows, freeform requirements, durable drafts, explicit submission, replay protection, owner isolation, cross-origin rejection, room availability honesty and new-chat preservation of requests.",
    );
} finally {
    await db.query(
        "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
        [users],
    );
    for (const user of users) await db.query('DELETE FROM "user" WHERE id=$1', [user]);
    await db.end();
}
