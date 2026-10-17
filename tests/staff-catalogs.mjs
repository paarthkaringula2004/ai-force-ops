import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import pg from "pg";
const require = createRequire(import.meta.url);
import { load } from "./helpers/load-ts.mjs";
const permissions = load("lib/workspace-permissions.ts"),
    { createCatalogEntry, readStaffCatalog } = load("lib/staff-catalog.ts", {
        "./workspace-permissions": permissions,
    }),
    { updateMemberInTransaction } = load("lib/workspace-members.ts", {
        "./workspace-permissions": permissions,
    });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    c = await pool.connect();
async function account(role) {
    const id = randomUUID();
    await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [id, "Catalog test", id + "@example.invalid"],
    );
    await c.query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [id, role]);
    return id;
}
try {
    await c.query("BEGIN");
    const admin = await account("admin"),
        user = await account("user");
    const initial = (
        await c.query("SELECT last_value FROM staff_catalog_counters WHERE kind='department'")
    ).rows[0].last_value;
    await assert.rejects(
        createCatalogEntry(c, user, { kind: "department", name: "Forbidden" }),
        /Admin access/,
    );
    const d = await createCatalogEntry(c, admin, {
        kind: "department",
        name: "Catalog fixture " + randomUUID(),
    });
    assert.equal(d.code, initial + 1);
    const d2 = await createCatalogEntry(c, admin, {
        kind: "department",
        name: "Catalog fixture " + randomUUID(),
    });
    assert.equal(d2.code, d.code + 1);
    await assert.rejects(
        createCatalogEntry(c, admin, { kind: "department", name: d.name.toUpperCase() }),
        /already/,
    );
    const q = await createCatalogEntry(c, admin, {
        kind: "qualification",
        name: "Catalog qualification " + randomUUID(),
        code: "ZTEST",
    });
    await assert.rejects(
        createCatalogEntry(c, admin, {
            kind: "qualification",
            name: "Other unique fixture",
            code: "ztest",
        }),
        /already used/,
    );
    const j = await createCatalogEntry(c, admin, {
        kind: "job_title",
        name: "Assistant Fixture Developer",
        departmentCode: d.code,
    });
    await updateMemberInTransaction(c, admin, {
        userId: user,
        role: "manager",
        active: true,
        department: d.name,
        departmentCode: d.code,
        employeeId: "",
        qualificationCode: q.code,
        jobTitleId: j.id,
        managerId: null,
        permissions: [],
    });
    const member = (await c.query("SELECT * FROM workspace_members WHERE user_id=$1", [user]))
        .rows[0];
    assert.equal(member.job_title_id, j.id);
    assert.ok(member.employee_id.endsWith("M01ZTEST"));
    const catalog = await readStaffCatalog(c);
    assert.ok(catalog.departments.some((x) => x.code === d.code));
    assert.ok(catalog.qualifications.some((x) => x.code === "ZTEST"));
    assert.ok(catalog.jobTitles.some((x) => x.id === j.id));
    await c.query(
        "UPDATE staff_catalog_counters SET last_value=greatest(last_value,99) WHERE kind='department'",
    );
    const wide = await createCatalogEntry(c, admin, {
        kind: "department",
        name: "Wide fixture " + randomUUID(),
    });
    assert.ok(wide.code >= 100);
    await updateMemberInTransaction(c, admin, {
        userId: user,
        role: "manager",
        active: true,
        department: wide.name,
        departmentCode: wide.code,
        employeeId: "",
        qualificationCode: "ZTEST",
        managerId: null,
        permissions: [],
    });
    const wideId = (
        await c.query("SELECT employee_id FROM workspace_members WHERE user_id=$1", [user])
    ).rows[0].employee_id;
    assert.ok(wideId.includes(wide.code + "M01ZTEST"));
    assert.ok(
        (
            await c.query(
                "SELECT 1 FROM workspace_audit WHERE actor_id=$1 AND action='catalog.created'",
                [admin],
            )
        ).rowCount >= 4,
    );
    console.log(
        "PASS: Admin-only catalog creation, incremental codes, duplicate prevention, dynamic qualification/job assignment, audit and department IDs above 99. Fixtures rolled back.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
