import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 15000,
        statement_timeout: 15000,
    }),
    c = await pool.connect();
const client = {
    query: (sql, args) =>
        ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)
            ? Promise.resolve({ rows: [] })
            : c.query(sql, args),
    release() {},
};
const db = { query: (...args) => c.query(...args), connect: async () => client };
const store = load("lib/playground-tools.ts", {
    "./db": { db },
    "./builtin-project-tool-settings": { builtinTools: async () => [] },
    "./integrations/project-tools": {
        projectBindings: async () => [],
        providerOperations: async () => [],
    },
    "./organization-security": { organizationWriteAllowed: async () => {} },
});
const lookup = load("lib/department-lookup.ts", { "./db": { db } });
try {
    await c.query("BEGIN");
    const alice = randomUUID(),
        bob = randomUUID();
    for (const id of [alice, bob])
        await c.query(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
            [id, "Playground tool fixture", id + "@example.invalid"],
        );
    for (const role of ["user", "employee", "manager", "admin"]) {
        const member = { role, active: true, user_id: alice };
        await store.savePlaygroundTool(alice, member, {
            sourceKind: "department",
            referenceId: "department_search",
            name: "Department Search " + role,
            purpose: "Read company departments",
            enabled: true,
        });
        const rows = await store.listPlaygroundTools(alice);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, "Department Search " + role);
        assert.equal((await store.listPlaygroundTools(bob)).length, 0);
        assert.match(
            (await lookup.readDepartmentLookup(member, "Missing " + randomUUID())).reply,
            /was found/,
        );
    }
    // Role grants use current database memberships, not a role passed by the caller.
    await c.query("UPDATE workspace_members SET role='admin',active=true WHERE user_id=$1", [
        alice,
    ]);
    const sharing = {
        sourceKind: "department",
        referenceId: "department_search",
        name: "Shared search",
        purpose: "Search company departments",
        enabled: true,
        sharedRoles: ["manager", "employee", "user"],
    };
    await store.savePlaygroundTool(alice, { role: "admin", active: true }, sharing);
    for (const role of ["manager", "employee", "user"]) {
        await c.query("UPDATE workspace_members SET role=$2,active=true WHERE user_id=$1", [
            bob,
            role,
        ]);
        const shared = await store.listPlaygroundTools(bob, { role, active: true });
        assert.equal(shared.length, 1);
        assert.equal(shared[0].shared, true);
        assert.equal(shared[0].owner_user_id, alice);
        assert.equal(
            (await store.playgroundConnectionSources(bob, { role, active: true }, shared)).get(
                shared[0].id,
            ).id,
            "department_search",
        );
    }
    await store.savePlaygroundTool(
        alice,
        { role: "admin", active: true },
        { ...sharing, sharedRoles: ["manager"] },
    );
    assert.equal(
        (await store.listPlaygroundTools(bob, { role: "manager", active: true })).length,
        0,
        "Cannot spoof a selected role while actual role is User",
    );
    await c.query("UPDATE workspace_members SET role='manager' WHERE user_id=$1", [bob]);
    assert.equal(
        (await store.listPlaygroundTools(bob, { role: "manager", active: true })).length,
        1,
    );
    await c.query("UPDATE workspace_members SET active=false WHERE user_id=$1", [alice]);
    assert.equal(
        (await store.listPlaygroundTools(bob, { role: "manager", active: true })).length,
        0,
        "Disabled Admin revokes grant",
    );
    await c.query("UPDATE workspace_members SET active=true,role='employee' WHERE user_id=$1", [
        alice,
    ]);
    assert.equal(
        (await store.listPlaygroundTools(bob, { role: "manager", active: true })).length,
        0,
        "Demoted Admin revokes grant",
    );
    await c.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [alice]);
    await c.query("UPDATE workspace_members SET active=false WHERE user_id=$1", [bob]);
    assert.equal(
        (await store.listPlaygroundTools(bob, { role: "manager", active: true })).length,
        0,
        "Disabled recipient cannot use shared tool",
    );
    await c.query("UPDATE workspace_members SET active=true WHERE user_id=$1", [bob]);
    const first = (await store.listPlaygroundTools(alice))[0];
    await store.savePlaygroundTool(
        alice,
        { role: "user", active: true },
        {
            sourceKind: "department",
            referenceId: "department_search",
            name: "Disabled search",
            purpose: "Read departments",
            enabled: false,
        },
    );
    assert.equal((await store.listPlaygroundTools(alice))[0].id, first.id);
    assert.equal((await store.listPlaygroundTools(alice))[0].enabled, false);
    await c.query("DELETE FROM playground_tool_connections WHERE user_id=$1 AND id=$2", [
        bob,
        first.id,
    ]);
    assert.equal((await store.listPlaygroundTools(alice)).length, 1);
    await c.query("DELETE FROM playground_tool_connections WHERE user_id=$1 AND id=$2", [
        alice,
        first.id,
    ]);
    assert.equal((await store.listPlaygroundTools(alice)).length, 0);
    console.log(
        "PASS: real database connection create/update/disable/remove, every role, owner isolation and department reads. All temporary accounts and connections rolled back.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
