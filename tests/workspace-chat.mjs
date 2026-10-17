import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    base = process.env.WORKSPACE_TEST_URL || "http://localhost:3000",
    users = [];
async function account(name) {
    const response = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            email: `chat-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    assert.equal(response.status, 200);
    const user = (await response.json()).user;
    users.push(user.id);
    return {
        id: user.id,
        email: user.email,
        cookie: response.headers
            .getSetCookie()
            .map((cookie) => cookie.split(";")[0])
            .join("; "),
    };
}
async function call(who, path, body, method = body ? "POST" : "GET") {
    const response = await fetch(base + path, {
        method,
        headers: { Origin: base, Cookie: who.cookie, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
}
const ask = (who, text) =>
    call(who, "/api/playground", { model: "", messages: [{ role: "user", content: text }] });
const membership = async (who) =>
    (await db.query("SELECT * FROM workspace_members WHERE user_id=$1", [who.id])).rows[0];
try {
    const admin = await account("Chat test Admin"),
        target = await account("Chat target"),
        employee = await account("Chat Employee");
    await db.query("UPDATE workspace_members SET role='admin',updated_at=now() WHERE user_id=$1", [
        admin.id,
    ]);
    const command = `ASSIGN ${target.email} to manager role in SDE department`;
    assert.match((await ask(employee, command)).reply, /Only an active Admin/);
    assert.equal((await membership(target)).role, "employee");
    const preview = await ask(admin, command);
    assert.match(preview.reply, /Review role change/);
    assert.match(preview.reply, /SDE/);
    assert.equal((await membership(target)).role, "employee");
    assert.ok((await call(admin, "/api/playground/employee")).choices.includes(preview.choices[0]));
    assert.match((await ask(employee, preview.choices[0])).reply, /Only an active Admin/);
    assert.match((await ask(admin, preview.choices[0])).reply, /Role updated/);
    assert.equal((await membership(target)).role, "manager");
    assert.equal((await membership(target)).department, "SDE");
    assert.deepEqual((await membership(target)).permissions, []);
    assert.match((await ask(admin, preview.choices[0])).reply, /expired or was replaced/);
    const cancelled = await ask(
        admin,
        `Assign ${target.email} to employee role in Engineering department`,
    );
    await ask(admin, "Cancel role change");
    assert.match((await ask(admin, cancelled.choices[0])).reply, /expired or was replaced/);
    assert.equal((await membership(target)).role, "manager");
    const stale = await ask(admin, command);
    await db.query(
        "UPDATE workspace_members SET department='Changed elsewhere',updated_at=now() WHERE user_id=$1",
        [target.id],
    );
    assert.match((await ask(admin, stale.choices[0])).reply, /changed after your preview/);
    await ask(admin, "Assign role");
    await ask(admin, target.email);
    await ask(admin, "Employee");
    const guided = await ask(admin, "Keep current department");
    assert.match(guided.reply, /Changed elsewhere/);
    await ask(admin, guided.choices[0]);
    assert.equal((await membership(target)).role, "employee");
    const expired = await ask(admin, command);
    await db.query(
        "UPDATE workspace_chat_actions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [admin.id],
    );
    assert.match((await ask(admin, expired.choices[0])).reply, /expired/);
    const revoked = await ask(admin, command);
    await db.query(
        "UPDATE workspace_members SET role='employee',updated_at=now() WHERE user_id=$1",
        [admin.id],
    );
    assert.match((await ask(admin, revoked.choices[0])).reply, /Only an active Admin/);
    assert.equal((await membership(target)).role, "employee");
    await db.query("UPDATE workspace_members SET role='admin',updated_at=now() WHERE user_id=$1", [
        admin.id,
    ]);
    await call(admin, "/api/playground/state", undefined, "DELETE");
    assert.equal(
        (await db.query("SELECT 1 FROM workspace_chat_actions WHERE user_id=$1", [admin.id]))
            .rowCount,
        0,
    );
    assert.equal(
        (
            await db.query(
                "SELECT count(*)::int AS count FROM workspace_audit WHERE actor_id=$1 AND action='member.updated'",
                [admin.id],
            )
        ).rows[0].count,
        2,
    );
    await db.query(
        "UPDATE workspace_members SET role='manager',updated_at=now() WHERE user_id=$1",
        [target.id],
    );
    await db.query("UPDATE workspace_members SET manager_id=$2,updated_at=now() WHERE user_id=$1", [
        employee.id,
        target.id,
    ]);
    async function seed(owner) {
        const id = randomUUID(),
            number = "REQ-" + id.replaceAll("-", "").slice(0, 12).toUpperCase();
        await db.query(
            'INSERT INTO employee_service_requests(id,user_id,request_number,kind,details) VALUES($1,$2,$3,\'leave\',\'{"dates":"12 November 2026","reason":"Test leave"}\')',
            [id, owner.id, number],
        );
        return { id, number };
    }
    const request = await seed(employee),
        foreign = await seed(admin);
    assert.match((await ask(target, "Team requests")).reply, new RegExp(request.number));
    assert.doesNotMatch((await ask(target, "Team requests")).reply, new RegExp(foreign.number));
    assert.match((await ask(employee, "Approve " + request.number)).reply, /not permitted/);
    assert.match((await ask(target, "Approve " + foreign.number)).reply, /not permitted/);
    const approval = await ask(target, "Approve " + request.number);
    assert.match(approval.reply, /Review request decision/);
    assert.ok(
        (await call(target, "/api/playground/employee")).choices.includes(approval.choices[0]),
    );
    assert.match((await ask(employee, approval.choices[0])).reply, /expired or was replaced/);
    assert.match((await ask(target, approval.choices[0])).reply, /Approved/);
    assert.match((await ask(target, approval.choices[0])).reply, /expired or was replaced/);
    assert.match(
        (await ask(admin, "Fulfil " + request.number)).reply,
        /verified manual fulfilment evidence/,
    );
    const fulfil = await ask(
        admin,
        "Fulfil " + request.number + " with note Verified manually in the company system",
    );
    assert.match((await ask(admin, fulfil.choices[0])).reply, /Fulfilled/);
    const rejected = await seed(employee);
    assert.match((await ask(target, "Reject " + rejected.number)).reply, /rejection reason/);
    const rejection = await ask(
        target,
        "Reject " + rejected.number + " because Schedule coverage unavailable",
    );
    assert.match((await ask(target, rejection.choices[0])).reply, /Rejected/);
    assert.match((await ask(employee, rejected.number)).reply, /Schedule coverage unavailable/);
    const conflict = await seed(employee),
        decision = await ask(target, "Approve " + conflict.number);
    await db.query(
        "UPDATE employee_service_requests SET status='cancelled',updated_at=now() WHERE id=$1",
        [conflict.id],
    );
    assert.match((await ask(target, decision.choices[0])).reply, /already changed/);
    const reassign = await seed(employee),
        reassignPreview = await ask(target, "Approve " + reassign.number);
    await db.query("UPDATE workspace_members SET manager_id=NULL WHERE user_id=$1", [employee.id]);
    assert.match((await ask(target, reassignPreview.choices[0])).reply, /not permitted/);
    console.log(
        "PASS: team chat isolation, decision previews, self-approval denial, approval/rejection/verified fulfilment, replay/conflict/reporting reassignment checks and employee decision-note lookup.",
    );
    console.log(
        "PASS: direct and guided role assignment, exact preview confirmation, no implicit module grants, owner isolation, replay/cancel/expiry/conflict/revocation protection, audit and new-chat cleanup.",
    );
} finally {
    await db.query(
        "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
        [users],
    );
    for (const id of users) await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    await db.end();
}
