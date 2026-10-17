import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
async function fixture(role, department = 7, qualification = "B", confirmed = false) {
    const id = randomUUID();
    await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [id, "Structured ID test", id + "@example.invalid"],
    );
    return (
        await c.query(
            "UPDATE workspace_members SET role=$2,department_code=$3,qualification_code=$4,employment_verified_at=CASE WHEN $5 THEN now() ELSE NULL END WHERE user_id=$1 RETURNING *",
            [id, role, department, qualification, confirmed],
        )
    ).rows[0];
}
try {
    await c.query("BEGIN");
    assert.equal(
        (
            await c.query(
                "SELECT count(*)::int AS n FROM staff_departments WHERE code BETWEEN 1 AND 60",
            )
        ).rows[0].n,
        60,
    );
    await c.query(
        "INSERT INTO staff_department_counters VALUES(7,0) ON CONFLICT(department_code) DO UPDATE SET last_value=0",
    );
    const year = String(
        (await c.query("SELECT extract(year FROM now() AT TIME ZONE 'Asia/Kolkata')::int AS y"))
            .rows[0].y,
    ).slice(-2);
    const employee = await fixture("employee");
    assert.equal(employee.employee_id, "");
    const first = (
        await c.query(
            "UPDATE workspace_members SET employment_verified_at=now() WHERE user_id=$1 RETURNING employee_id",
            [employee.user_id],
        )
    ).rows[0].employee_id;
    assert.equal(first, year + "07E01B");
    const manager = await fixture("manager");
    assert.equal(manager.employee_id, year + "07M02B");
    const promoted = (
        await c.query("UPDATE workspace_members SET role='manager' WHERE user_id=$1 RETURNING *", [
            employee.user_id,
        ])
    ).rows[0];
    assert.equal(promoted.employee_id, year + "07M01B");
    assert.equal(promoted.staff_sequence, employee.staff_sequence ?? "1");
    assert.equal(
        (
            await c.query(
                "SELECT 1 FROM staff_id_history WHERE user_id=$1 AND old_id=$2 AND new_id=$3",
                [employee.user_id, first, promoted.employee_id],
            )
        ).rowCount,
        1,
    );
    assert.equal(
        (
            await c.query(
                "UPDATE workspace_members SET qualification_code='MBA' WHERE user_id=$1 RETURNING employee_id",
                [employee.user_id],
            )
        ).rows[0].employee_id,
        year + "07M01MBA",
    );
    await c.query("UPDATE staff_department_counters SET last_value=99 WHERE department_code=7");
    assert.equal((await fixture("manager")).employee_id, year + "07M100B");
    const admin = await fixture("admin");
    assert.equal(admin.employee_id, "");
    assert.match(admin.admin_id, /^ADM-/);
    const user = await fixture("user");
    assert.equal(user.employee_id, "");
    await c.query('DELETE FROM "user" WHERE id=$1', [manager.user_id]);
    assert.equal((await fixture("manager")).employee_id, year + "07M101B");
    console.log(
        "PASS: 60 departments, confirmation gate, per-department shared sequence, promotion, qualification update, ID history, 100+ staff, no reuse, Admin/User exclusion. All fixtures rolled back.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
