import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    c = await pool.connect();
let actor = null;
const client = {
    query: (sql, args) =>
        /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) ? Promise.resolve({ rows: [] }) : c.query(sql, args),
    release() {},
};
const route = load("app/api/workspace/catalog/route.ts", {
    "@/lib/db": { db: { query: (sql, args) => c.query(sql, args), connect: async () => client } },
    "./db": { db: { query: (sql, args) => c.query(sql, args) } },
    "@/lib/request-session": {
        getRequestSession: async () => (actor ? { user: { id: actor } } : null),
    },
});
const request = (body, origin = "http://localhost:3000") =>
    new Request("http://localhost:3000/api/workspace/catalog", {
        method: "DELETE",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
try {
    await c.query("BEGIN");
    const admin = randomUUID(),
        user = randomUUID();
    for (const id of [admin, user])
        await c.query(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
            [id, "Catalog route fixture", id + "@example.invalid"],
        );
    await c.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [admin]);
    assert.equal((await route.DELETE(request({}))).status, 401);
    actor = admin;
    assert.equal((await route.DELETE(request({}, "https://invalid.example"))).status, 403);
    assert.equal((await route.DELETE(request("{"))).status, 400);
    const created = await route.POST(
        request({ kind: "department", name: "Delete route " + randomUUID() }),
    );
    assert.equal(created.status, 201);
    const { entry } = await created.json();
    assert.equal(
        (await route.DELETE(request({ code: entry.code, confirmation: "Wrong name" }))).status,
        409,
    );
    actor = user;
    assert.equal(
        (await route.DELETE(request({ code: entry.code, confirmation: entry.name }))).status,
        403,
    );
    actor = admin;
    assert.equal(
        (await route.DELETE(request({ code: entry.code, confirmation: entry.name }))).status,
        200,
    );
    assert.equal(
        (await route.DELETE(request({ code: entry.code, confirmation: entry.name }))).status,
        404,
    );
    assert.equal(
        (await c.query("SELECT 1 FROM staff_departments WHERE code=$1", [entry.code])).rowCount,
        0,
    );
    console.log(
        "PASS catalog API: authentication, origin, malformed body, non-Admin denial, exact-name confirmation, persisted deletion and repeated-delete rejection. SQL fixture rolled back.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
