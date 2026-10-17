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
            name: "Disposable deletion test",
            email: `delete-${randomUUID()}@example.invalid`,
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
async function call(who, method, body, status = 200, origin = base) {
    const r = await fetch(base + "/api/workspace/requests", {
        method,
        headers: { Cookie: who.cookie, Origin: origin, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data;
}
async function seed(who, status = "cancelled") {
    const id = randomUUID(),
        number = "REQ-" + id.replaceAll("-", "").slice(0, 12).toUpperCase();
    await db.query(
        "INSERT INTO employee_service_requests(id,user_id,request_number,kind,details,status) VALUES($1,$2,$3,'leave','{}',$4)",
        [id, who.id, number, status],
    );
    return { id, confirmation: number };
}
try {
    const employee = await account(),
        manager = await account(),
        outsider = await account();
    await db.query("UPDATE workspace_members SET role='manager' WHERE user_id=$1", [manager.id]);
    await db.query("UPDATE workspace_members SET manager_id=$2 WHERE user_id=$1", [
        employee.id,
        manager.id,
    ]);
    assert.equal((await call(employee, "GET")).deleteEnabled, true);
    const own = await seed(employee);
    await call(outsider, "DELETE", own, 403);
    await call(employee, "DELETE", own, 403, "https://untrusted.invalid");
    await call(employee, "DELETE", { ...own, confirmation: "wrong" }, 400);
    await call(employee, "DELETE", own);
    assert.equal(
        (await db.query("SELECT 1 FROM employee_service_requests WHERE id=$1", [own.id])).rowCount,
        0,
    );
    const team = await seed(employee, "approved");
    await call(manager, "DELETE", team);
    await call(manager, "DELETE", team, 403);
    const foreign = await seed(outsider);
    await call(manager, "DELETE", foreign, 403);
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [manager.id]);
    await call(manager, "DELETE", foreign);
    const blocked = await seed(employee);
    await db.query("UPDATE workspace_members SET active=false WHERE user_id=$1", [employee.id]);
    await call(employee, "DELETE", blocked, 403);
    const audit = (
        await db.query(
            "SELECT request_id,details FROM workspace_audit WHERE action='request.deleted' AND actor_id=ANY($1::text[])",
            [users],
        )
    ).rows;
    assert.equal(audit.length, 3);
    assert.ok(
        audit.every(
            (r) => r.request_id === null && r.details.development_only && r.details.request_number,
        ),
    );
    console.log(
        "PASS: own and assigned-team deletion, Admin deletion, confirmation, CSRF, unrelated/disabled account denial, repeated deletion and retained audit metadata.",
    );
} finally {
    await db.query(
        "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
        [users],
    );
    for (const id of users) await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    await db.end();
}
