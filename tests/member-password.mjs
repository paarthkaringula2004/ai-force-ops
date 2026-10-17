import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 15000,
        statement_timeout: 15000,
    }),
    c = await pool.connect();
const deps = {
    "better-auth/crypto": { hashPassword },
    "./organization-security": { organizationWriteAllowed: async () => {} },
};
const { resetMemberPassword } = load("lib/workspace-member-password.ts", deps);
const { updateMemberInTransaction } = load("lib/workspace-members.ts", deps);
try {
    await c.query("BEGIN");
    const admin = randomUUID(),
        target = randomUUID(),
        external = randomUUID();
    for (const id of [admin, target, external])
        await c.query(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
            [id, "Password test fixture", id + "@example.invalid"],
        );
    await c.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [admin]);
    const account = randomUUID(),
        oldPassword = randomUUID() + "Aa1!",
        newPassword = randomUUID() + "Bb2!";
    await c.query(
        `INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,'credential',$2,$3,now(),now())`,
        [account, target, await hashPassword(oldPassword)],
    );
    await c.query(
        `INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval '1 day',now(),now())`,
        [randomUUID(), randomUUID(), target],
    );
    await c.query(
        `INSERT INTO verification(id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval '1 day',now(),now())`,
        [randomUUID(), "reset-password:" + randomUUID(), target],
    );
    const input = { userId: target, password: newPassword, confirm: true };
    for (const role of ["user", "employee", "manager"]) {
        await c.query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [external, role]);
        await assert.rejects(
            () => resetMemberPassword(c, external, input),
            (e) => e.status === 403,
        );
    }
    await assert.rejects(
        () => resetMemberPassword(c, admin, { ...input, confirm: false }),
        /Confirm/,
    );
    await assert.rejects(
        () => resetMemberPassword(c, admin, { ...input, password: "short" }),
        /8–128/,
    );
    await assert.rejects(
        () => resetMemberPassword(c, admin, { ...input, userId: admin }),
        /own password/,
    );
    await assert.rejects(
        () => resetMemberPassword(c, admin, { ...input, userId: external }),
        /external sign-in/,
    );
    const result = await resetMemberPassword(c, admin, input);
    assert.equal(result.saved, true);
    const saved = (await c.query("SELECT password FROM account WHERE id=$1", [account])).rows[0]
        .password;
    assert.notEqual(saved, newPassword);
    assert.equal(await verifyPassword({ hash: saved, password: newPassword }), true);
    assert.equal(await verifyPassword({ hash: saved, password: oldPassword }), false);
    assert.equal((await c.query('SELECT 1 FROM session WHERE "userId"=$1', [target])).rowCount, 0);
    assert.equal(
        (await c.query("SELECT 1 FROM verification WHERE value=$1", [target])).rowCount,
        0,
    );
    const audit = (
        await c.query(
            "SELECT details FROM workspace_audit WHERE actor_id=$1 AND action='member.password_reset'",
            [admin],
        )
    ).rows[0].details;
    assert.deepEqual(audit, { sessionsRevoked: true });
    assert.ok(!JSON.stringify(audit).includes(newPassword));
    for (let i = 0; i < 9; i++)
        await c.query(
            "INSERT INTO workspace_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,'member.password_reset','{}')",
            [randomUUID(), admin, target],
        );
    await assert.rejects(
        () => resetMemberPassword(c, admin, input),
        (e) => e.status === 429,
    );
    // Manager role discards a stale reporting manager; Employee restores support for assignment.
    const dept = (await c.query("SELECT code,name FROM staff_departments ORDER BY code LIMIT 1"))
            .rows[0],
        qualification = (
            await c.query("SELECT code FROM staff_qualifications ORDER BY code LIMIT 1")
        ).rows[0];
    const update = {
        userId: target,
        role: "manager",
        active: true,
        department: dept.name,
        departmentCode: dept.code,
        qualificationCode: qualification.code,
        employeeId: "",
        managerId: external,
        permissions: [],
    };
    await updateMemberInTransaction(c, admin, update);
    assert.equal(
        (await c.query("SELECT manager_id FROM workspace_members WHERE user_id=$1", [target]))
            .rows[0].manager_id,
        null,
    );
    await updateMemberInTransaction(c, admin, { ...update, userId: external, managerId: null });
    await updateMemberInTransaction(c, admin, { ...update, role: "employee" });
    assert.equal(
        (await c.query("SELECT manager_id FROM workspace_members WHERE user_id=$1", [target]))
            .rows[0].manager_id,
        external,
    );
    console.log(
        "PASS: real password hash/verification, Admin-only reset, confirmation/length checks, external-provider protection, session/token revocation, secret-free audit, reset rate limit and role-aware manager assignment. All fixtures rolled back.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
