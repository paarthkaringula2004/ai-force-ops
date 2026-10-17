import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    base = process.env.WORKSPACE_TEST_URL || "http://localhost:3000",
    users = [];
async function account() {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Disposable employee verification",
            email: `verify-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    assert.equal(r.status, 200);
    const id = (await r.json()).user.id;
    users.push(id);
    return {
        id,
        cookie: r.headers
            .getSetCookie()
            .map((v) => v.split(";")[0])
            .join("; "),
    };
}
async function call(who, path, body, status = 200) {
    const r = await fetch(base + path, {
        method: "POST",
        headers: { Origin: base, Cookie: who.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data;
}
const verify = (who, target, status) =>
    call(who, "/api/workspace/employment", { userId: target.id, confirm: true }, status);
const ask = (who, text) =>
    call(who, "/api/playground", {
        model: "",
        messages: [
            { role: "assistant", content: "I do not know your employee ID. It may be WRONG-ID." },
            { role: "user", content: text },
        ],
    });
try {
    const manager = await account(),
        employee = await account(),
        other = await account();
    await db.query("UPDATE workspace_members SET role='manager' WHERE user_id=$1", [manager.id]);
    await db.query("UPDATE workspace_members SET manager_id=$2 WHERE user_id=$1", [
        employee.id,
        manager.id,
    ]);
    assert.match(
        (await ask(employee, "whats my employee ID?")).reply,
        /No employee ID has been assigned yet/,
    );
    await verify(employee, employee, 403);
    await verify(manager, other, 403);
    const confirmed = await verify(manager, employee);
    assert.match(confirmed.employeeId, /^EMP-[0-9A-F]{12}$/);
    assert.equal((await verify(manager, employee)).employeeId, confirmed.employeeId);
    const profile = await ask(employee, "whats my employee ID?");
    assert.equal(profile.responseMode, "employee");
    assert.match(profile.reply, new RegExp(confirmed.employeeId));
    assert.doesNotMatch(profile.reply, /WRONG-ID/);
    assert.match(profile.reply, /Confirmed by Disposable employee verification/);
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [manager.id]);
    const next = await verify(manager, other);
    assert.notEqual(next.employeeId, confirmed.employeeId);
    assert.equal(
        (
            await db.query(
                "SELECT count(*)::int AS total FROM workspace_audit WHERE action='member.employment_confirmed' AND actor_id=$1",
                [manager.id],
            )
        ).rows[0].total,
        2,
    );
    console.log(
        "PASS: live ID lookup, missing-ID explanation, Manager confirmation, unique random IDs, repeat stability, Admin confirmation, self/unrelated denial and audit.",
    );
} finally {
    await db.query(
        "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
        [users],
    );
    for (const id of users) await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    await db.end();
}
