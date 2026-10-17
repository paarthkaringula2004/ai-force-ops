import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    c = await pool.connect();
const client = {
    query: (sql, args) =>
        /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) ? Promise.resolve({ rows: [] }) : c.query(sql, args),
    release() {},
};
const db = { query: (sql, args) => c.query(sql, args), connect: async () => client };
let owner;
const calls = [];
const real = load("lib/eassist/transport.ts");
const transport = {
    ...real,
    remote: async (connection, path, method = "GET", body) => {
        calls.push({ kind: connection.kind, path, method, body });
        if (connection.kind === "prometheus")
            return { status: "success", data: { resultType: "vector", result: [] } };
        if (connection.kind === "servicenow")
            return path.includes("sys_journal")
                ? { result: [] }
                : {
                      result: {
                          sys_id: "fixture-incident",
                          short_description: body?.short_description || "Fixture",
                      },
                  };
        if (path.endsWith("/output")) return [{ output: "Fixture output" }];
        if (path.endsWith("/tasks") && method === "POST")
            return { id: 900, template_id: 1, status: "running" };
        if (/\/tasks\/\d+$/.test(path))
            return { id: 900, template_id: 1, status: "waiting_confirmation" };
        if (connection.kind === "alertmanager") return { silenceID: "fixture-silence" };
        return { id: 1, ...body };
    },
};
const deps = {
    "./db": { db },
    "@/lib/db": { db },
    "./transport": transport,
    "@/lib/organization": { organizationOwner: async () => owner },
    "@/lib/workspace-access": {
        workspaceAccess: async (id) =>
            (await c.query("SELECT * FROM workspace_members WHERE user_id=$1", [id])).rows[0],
    },
    "./organization-context": {
        sharedOperationsOwner: async () => owner,
        operationsActor: (user) => user,
    },
};
const { action } = load("lib/eassist/actions.ts", deps),
    { resourceFields } = load("lib/eassist/types.ts");
async function fixture(role) {
    const id = randomUUID();
    await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [id, "Operations fixture", id + "@example.invalid"],
    );
    await c.query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [id, role]);
    return id;
}
const run = (body, user = owner) => action(user, body);
const policy = {
    allow_runs: true,
    allow_writes: true,
    allow_deletes: true,
    require_confirmation: true,
    require_https: true,
    max_concurrent: 20,
};
try {
    await c.query("BEGIN");
    owner = await fixture("admin");
    const outsider = await fixture("employee");
    await run({ action: "security.save", policy });
    const saved = (
        await c.query(
            "SELECT allow_deletes,require_confirmation FROM eassist_security WHERE user_id=$1",
            [owner],
        )
    ).rows[0];
    assert.equal(saved.allow_deletes, true);
    assert.equal(saved.require_confirmation, true);
    const connections = {};
    for (const kind of ["semaphore", "servicenow", "alertmanager", "prometheus"])
        connections[kind] = (
            await run({
                action: "connection.save",
                kind,
                name: "Fixture " + kind,
                base_url: "https://example.invalid",
                project_id: "1",
                auth_type: "none",
            })
        ).id;
    await assert.rejects(
        () =>
            run(
                {
                    action: "connection.save",
                    kind: "semaphore",
                    name: "Denied",
                    base_url: "https://example.invalid",
                    project_id: "1",
                    auth_type: "none",
                },
                outsider,
            ),
        (e) => e.status === 403,
    );
    const id = connections.semaphore;
    for (const kind of Object.keys(resourceFields).filter((k) => k !== "incidents")) {
        const fields = {};
        for (const f of resourceFields[kind]) {
            if (f.required)
                fields[f.key] = f.type === "number" ? 1 : f.options?.[0] || "Fixture " + f.key;
        }
        if (kind === "keys") fields.type = "none";
        if (kind === "environment") {
            fields.json = "{}";
            fields.env = "{}";
        }
        const request = {
            action: "resource.save",
            connectionId: id,
            kind,
            fields,
            requestKey: randomUUID(),
        };
        const result = await run(request);
        assert.equal(result.id, "1");
        const count = calls.length;
        assert.equal((await run(request)).id, "1");
        assert.equal(
            calls.length,
            count,
            "Identical operation replay must not call the vendor twice",
        );
        await run({ ...request, id: "1", requestKey: randomUUID() });
        assert.equal(calls.at(-1).method, "PUT");
        await run({
            action: "resource.delete",
            connectionId: id,
            kind,
            id: "1",
            requestKey: randomUUID(),
        });
        assert.equal(calls.at(-1).method, "DELETE");
        console.log(
            "PASS actual operation dispatcher with fixture source: " +
                kind +
                " create/update/delete, SQL operation records and replay.",
        );
    }
    const sn = connections.servicenow;
    await run({
        action: "resource.save",
        connectionId: sn,
        kind: "incidents",
        fields: { short_description: "Fixture incident" },
        requestKey: randomUUID(),
    });
    assert.equal(calls.at(-1).method, "POST");
    await assert.rejects(
        () =>
            run({
                action: "resource.save",
                connectionId: sn,
                kind: "incidents",
                id: "fixture-incident",
                fields: { short_description: "Fixture", state: "6" },
                requestKey: randomUUID(),
            }),
        /Resolution notes/,
    );
    await run({
        action: "resource.save",
        connectionId: sn,
        kind: "incidents",
        id: "fixture-incident",
        fields: {
            short_description: "Fixture",
            state: "6",
            close_code: "Solved",
            close_notes: "Verified fixture",
        },
        requestKey: randomUUID(),
    });
    assert.equal(calls.at(-1).method, "PATCH");
    await run({ action: "incident.journal", connectionId: sn, id: "fixture-incident" });
    assert.ok(calls.at(-1).path.includes("sys_journal_field"));
    await run({ action: "monitor.query", connectionId: connections.prometheus, query: "up" });
    assert.ok(calls.at(-1).path.includes("query=up"));
    const am = connections.alertmanager;
    await run({
        action: "silence.create",
        connectionId: am,
        fields: {
            matchers: [{ name: "job", value: "fixture" }],
            comment: "Fixture reason",
            createdBy: "Fixture",
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 3600000).toISOString(),
        },
        requestKey: randomUUID(),
    });
    assert.equal(calls.at(-1).method, "POST");
    await run({
        action: "silence.expire",
        connectionId: am,
        id: "fixture-silence",
        requestKey: randomUUID(),
    });
    assert.equal(calls.at(-1).method, "DELETE");
    const token = await run({ action: "connection.token", connectionId: am });
    assert.match(token.token, /^[a-f0-9]{64}$/);
    assert.notEqual(
        (await c.query("SELECT webhook_hash FROM eassist_connections WHERE id=$1", [am])).rows[0]
            .webhook_hash,
        token.token,
    );
    console.log(
        "PASS incident creation/resolution validation/journal, PromQL, silence lifecycle and hashed webhook credentials (fixture source only).",
    );
    const approval = await run({ action: "task.authorize", connectionId: id, id: "1" }),
        task = {
            action: "task.run",
            connectionId: id,
            id: "1",
            approvalId: approval.approvalId,
            requestKey: randomUUID(),
        };
    assert.equal((await run(task)).id, "900");
    const count = calls.length;
    await run(task);
    assert.equal(calls.length, count);
    await run({ action: "task.stop", connectionId: id, id: "900", requestKey: randomUUID() });
    assert.ok(calls.at(-1).path.endsWith("/stop"));
    for (const name of ["task.confirm", "task.reject"]) {
        await assert.rejects(
            () => run({ action: name, connectionId: id, id: "900", requestKey: randomUUID() }),
            /Confirm this task action/,
        );
        await run({
            action: name,
            connectionId: id,
            id: "900",
            confirmed: true,
            requestKey: randomUUID(),
        });
    }
    await run({
        action: "security.save",
        policy: { ...policy, allow_writes: false, allow_runs: false, allow_deletes: false },
    });
    await assert.rejects(
        () =>
            run({
                action: "resource.save",
                connectionId: id,
                kind: "inventory",
                fields: { name: "Denied" },
                requestKey: randomUUID(),
            }),
        (e) => e.status === 403,
    );
    await assert.rejects(
        () => run({ action: "task.authorize", connectionId: id, id: "1" }),
        (e) => e.status === 403,
    );
    console.log(
        "PASS launch approval, idempotency, stop/confirm/reject contracts and disabled-write/run policy. No real vendor calls; SQL fixture rolled back.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
