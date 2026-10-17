import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 15000,
        statement_timeout: 15000,
    }),
    client = await pool.connect();
const db = {
    query: (...args) => client.query(...args),
    connect: async () => ({
        query: (sql, args) =>
            client.query(
                sql.startsWith("BEGIN")
                    ? "SAVEPOINT employee_share"
                    : sql === "COMMIT"
                      ? "RELEASE SAVEPOINT employee_share"
                      : sql === "ROLLBACK"
                        ? "ROLLBACK TO SAVEPOINT employee_share"
                        : sql,
                args,
            ),
        release() {},
    }),
};
const graphs = load("lib/agent-studio-graph.ts"),
    transport = load("lib/eassist/transport.ts");
const sharing = load("lib/agent-sharing.ts", {
    "./db": { db },
    "./workspace-access": {
        workspaceAccess: async (id) =>
            (await client.query("SELECT * FROM workspace_members WHERE user_id=$1", [id])).rows[0],
    },
    "./eassist/transport": transport,
    "./agent-studio-graph": graphs,
});
try {
    await client.query("BEGIN");
    const departments = (
        await client.query("SELECT code FROM staff_departments ORDER BY code LIMIT 2")
    ).rows.map((r) => r.code);
    assert.equal(departments.length, 2);
    const users = {};
    for (const [name, role, department] of [
        ["owner", "employee", departments[0]],
        ["colleague", "employee", departments[0]],
        ["unselected", "employee", departments[0]],
        ["outside", "employee", departments[1]],
        ["user", "user", null],
        ["manager", "manager", departments[0]],
        ["admin", "admin", null],
    ]) {
        const id = randomUUID();
        users[name] = id;
        await client.query(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
            [id, "Employee sharing fixture", id + "@example.invalid"],
        );
        await client.query(
            "UPDATE workspace_members SET role=$2,department_code=$3,active=true WHERE user_id=$1",
            [id, role, department],
        );
    }
    const agent = randomUUID();
    await client.query(
        "INSERT INTO agents(id,user_id,name,model_id) VALUES($1,$2,'Employee fixture','gpt-4.1-mini')",
        [agent, users.owner],
    );
    await client.query("INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)", [
        users.owner,
        agent,
        JSON.stringify(graphs.studioGraph("Employee fixture")),
    ]);
    const save = (roles, ids = []) => sharing.saveAgentShare(users.owner, agent, roles, ids);
    await assert.rejects(
        () => save(["admin"]),
        (e) => e.status === 403,
    );
    await assert.rejects(
        () => save(["user"]),
        (e) => e.status === 400,
    );
    await assert.rejects(
        () => save([], [users.user]),
        (e) => e.status === 400,
    );
    for (const id of [users.colleague, users.manager, users.admin, randomUUID()])
        await assert.rejects(
            () => save(["user"], [id]),
            (e) => e.status === 403,
        );
    await assert.rejects(
        () => save(["user"], ["not a user id"]),
        (e) => e.status === 400,
    );
    const saved = await save(["manager", "employee", "user"], [users.user]);
    const own = await sharing.listAgentShares(users.owner);
    assert.equal(own.shareMode, "recipients");
    for (const id of [users.colleague, users.unselected, users.manager, users.user])
        assert.equal((await sharing.loadSharedAgent(id, saved.shareId)).ownerId, users.owner);
    for (const id of [users.outside, users.admin])
        await assert.rejects(
            () => sharing.loadSharedAgent(id, saved.shareId),
            (e) => e.status === 403,
        );
    const fresh = randomUUID();
    await client.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [fresh, "Unselected User", fresh + "@example.invalid"],
    );
    await assert.rejects(
        () => sharing.loadSharedAgent(fresh, saved.shareId),
        (e) => e.status === 403,
    );
    await client.query("UPDATE workspace_members SET department_code=$2 WHERE user_id=$1", [
        users.manager,
        departments[1],
    ]);
    await assert.rejects(
        () => sharing.loadSharedAgent(users.manager, saved.shareId),
        (e) => e.status === 403,
    );
    await client.query("UPDATE workspace_members SET active=false WHERE user_id=$1", [users.user]);
    await assert.rejects(
        () => sharing.loadSharedAgent(users.user, saved.shareId),
        (e) => e.status === 403,
    );
    await client.query("UPDATE workspace_members SET active=true WHERE user_id=$1", [users.user]);
    await client.query("UPDATE workspace_members SET department_code=$2 WHERE user_id=$1", [
        users.owner,
        departments[1],
    ]);
    await assert.rejects(
        () => sharing.loadSharedAgent(users.colleague, saved.shareId),
        (e) => e.status === 403,
    );
    assert.equal((await sharing.loadSharedAgent(users.user, saved.shareId)).ownerId, users.owner);
    await client.query("UPDATE workspace_members SET department_code=NULL WHERE user_id=$1", [
        users.owner,
    ]);
    await assert.rejects(
        () => save(["employee"]),
        (e) => e.status === 403,
    );
    await client.query("UPDATE workspace_members SET department_code=$2 WHERE user_id=$1", [
        users.owner,
        departments[0],
    ]);
    await save(["user"], [users.user]);
    await assert.rejects(
        () => sharing.loadSharedAgent(users.colleague, saved.shareId),
        (e) => e.status === 403,
    );
    await assert.rejects(
        () => sharing.saveAgentShare(users.colleague, agent, ["user"], [users.user]),
        (e) => e.status === 404,
    );
    await save([]);
    await assert.rejects(
        () => sharing.loadSharedAgent(users.user, saved.shareId),
        (e) => e.status === 403,
    );
    assert.equal(
        (
            await client.query("SELECT 1 FROM agent_share_recipients WHERE share_id=$1", [
                saved.shareId,
            ])
        ).rowCount,
        0,
    );
    console.log(
        "PASS: Employee role checkboxes share with same-department Managers/Employees; User requires explicit User IDs, never all Users. Staff IDs, Admin, outside department, missing department, disabled accounts, foreign-agent resharing and revocation checked. Real fixtures rolled back; no provider calls.",
    );
} finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
}
