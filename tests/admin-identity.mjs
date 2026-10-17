import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    ids = [],
    base = "http://localhost:3000";
async function account(name) {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            email: `admin-identity-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    assert.equal(r.status, 200);
    const u = (await r.json()).user;
    ids.push(u.id);
    return {
        ...u,
        cookie: r.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
    };
}
async function ask(u, text) {
    const r = await fetch(base + "/api/playground", {
        method: "POST",
        headers: { Origin: base, Cookie: u.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "", messages: [{ role: "user", content: text }] }),
    });
    assert.equal(r.status, 200);
    return r.json();
}
async function member(u) {
    return (await db.query("SELECT * FROM workspace_members WHERE user_id=$1", [u.id])).rows[0];
}
try {
    const actor = await account("Identity Admin"),
        a = await account("Additional Admin One"),
        b = await account("Additional Admin Two");
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [actor.id]);
    const identity = (await member(actor)).admin_id;
    assert.match(identity, /^ADM-[A-F0-9]{32}$/);
    const profile = await ask(actor, "About me");
    assert.match(profile.reply, new RegExp(identity));
    assert.ok(profile.reply.includes(actor.email));
    assert.doesNotMatch(
        profile.reply,
        /Employee ID|Department|Reporting manager|Employment:|Contact your Admin/,
    );
    assert.equal((await ask(a, `Make ${b.email} an Admin`)).responseMode, "user");
    assert.equal((await member(b)).role, "user");
    for (const target of [a, b]) {
        const preview = await ask(actor, `Add ${target.email} as Admin`);
        assert.match(preview.reply, /Review role change/);
        assert.doesNotMatch(preview.reply, /Department/);
        assert.equal((await member(target)).role, "user");
        const saved = await ask(actor, preview.choices[0]);
        assert.match(saved.reply, /Admin ID/);
        assert.equal((await member(target)).role, "admin");
        assert.match((await ask(actor, preview.choices[0])).reply, /expired or was replaced/);
    }
    assert.notEqual((await member(a)).admin_id, (await member(b)).admin_id);
    const retained = (await member(a)).admin_id;
    await db.query("UPDATE workspace_members SET role='user' WHERE user_id=$1", [a.id]);
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [a.id]);
    assert.equal((await member(a)).admin_id, retained);
    assert.equal((await member(actor)).admin_id, identity);
    assert.equal(
        (
            await db.query(
                "SELECT count(*)::int AS n FROM workspace_audit WHERE actor_id=$1 AND action='member.updated'",
                [actor.id],
            )
        ).rows[0].n,
        2,
    );
    console.log(
        "PASS: Admin profile, persistent unique IDs, multiple Admins through confirmed chat, no department step, unauthorized promotion blocked, replay protection and audit.",
    );
} finally {
    if (ids.length) {
        await db.query("DELETE FROM organization_security_events WHERE actor_id=ANY($1::text[])", [
            ids,
        ]);
        await db.query(
            "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
            [ids],
        );
        for (const id of ids) await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    }
    await db.end();
}
