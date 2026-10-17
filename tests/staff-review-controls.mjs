import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    c = await pool.connect();
let actor;
const query = (sql, args) => c.query(sql, args),
    client = {
        query: (sql, args) =>
            /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)
                ? Promise.resolve({ rows: [] })
                : query(sql, args),
        release() {},
    };
const db = { query, connect: async () => client };
const deps = {
    "@/lib/db": { db },
    "./db": { db },
    "@/lib/request-session": {
        getRequestSession: async () => (actor ? { user: { id: actor } } : null),
    },
};
const employment = load("app/api/workspace/employment/route.ts", deps),
    salary = load("app/api/workspace/salary/route.ts", deps);
const req = (body, user) =>
    new Request("http://localhost:3000/api/workspace/salary" + (user ? "?userId=" + user : ""), {
        method: body ? "POST" : "GET",
        headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
async function fixture(role) {
    const id = randomUUID();
    await query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [id, "Reviewer fixture " + role, id + "@example.invalid"],
    );
    await query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [id, role]);
    return id;
}
try {
    await query("BEGIN");
    const admin = await fixture("admin"),
        manager = await fixture("manager"),
        employee = await fixture("employee"),
        foreign = await fixture("employee");
    await query(
        "UPDATE workspace_members SET manager_id=$2,department_code=(SELECT code FROM staff_departments ORDER BY code LIMIT 1),department=(SELECT name FROM staff_departments ORDER BY code LIMIT 1),qualification_code=(SELECT code FROM staff_qualifications ORDER BY id LIMIT 1) WHERE user_id=$1",
        [employee, manager],
    );
    actor = employee;
    assert.equal((await employment.POST(req({ userId: employee, confirm: true }))).status, 403);
    actor = manager;
    assert.equal((await employment.POST(req({ userId: foreign, confirm: true }))).status, 403);
    let r = await employment.POST(req({ userId: employee, confirm: true }));
    assert.equal(r.status, 200);
    const confirmed = await r.json();
    assert.ok(confirmed.employeeId);
    assert.equal(
        (await (await employment.POST(req({ userId: employee, confirm: true }))).json()).employeeId,
        confirmed.employeeId,
    );
    assert.ok(
        (
            await query("SELECT employment_verified_at FROM workspace_members WHERE user_id=$1", [
                employee,
            ])
        ).rows[0].employment_verified_at,
    );
    const fields = {
        userId: employee,
        monthlySalary: 90000,
        currency: "INR",
        deductionBasis: "fixed_30",
        note: "Fixture contract verification",
    };
    assert.equal((await salary.PUT(req(fields))).status, 200);
    let saved = await (await salary.GET(req(null, employee))).json();
    assert.equal(Number(saved.salary.monthly_salary), 90000);
    assert.equal((await salary.PUT(req({ ...fields, version: "stale" }))).status, 409);
    assert.equal((await salary.PUT(req({ ...fields, userId: manager }))).status, 403);
    assert.equal((await salary.PUT(req({ ...fields, userId: foreign }))).status, 403);
    assert.equal((await salary.GET(req(null, foreign))).status, 403);
    actor = employee;
    assert.equal((await salary.GET(req(null, employee))).status, 200);
    assert.equal((await salary.PUT(req({ ...fields, version: saved.salary.version }))).status, 403);
    actor = manager;
    await query("UPDATE organization_workspace SET owner_id=$1 WHERE id=true", [admin]);
    await query(
        "INSERT INTO eassist_security(user_id,allow_writes) VALUES($1,false) ON CONFLICT(user_id) DO UPDATE SET allow_writes=false",
        [admin],
    );
    assert.equal((await salary.PUT(req({ ...fields, version: saved.salary.version }))).status, 403);
    assert.equal((await salary.GET(req(null, employee))).status, 200);
    console.log(
        "PASS Manager employment confirmation/ID generation, foreign/self denial, stable confirmation, salary persistence/version checks, own salary reads, team-only privacy and disabled-write policy. Fixtures rolled back.",
    );
} finally {
    await query("ROLLBACK");
    c.release();
    await pool.end();
}
