import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://localhost:3000";
const users = [];
async function api(cookie, body, status = 200) {
    const r = await fetch(base + "/api/epace", {
        method: "POST",
        headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data;
}
async function account() {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Disposable project deletion test",
            email: `project-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    assert.equal(r.status, 200);
    const user = (await r.json()).user.id;
    users.push(user);
    return {
        user,
        cookie: r.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
    };
}
try {
    const owner = await account(),
        other = await account();
    const { id } = await api(owner.cookie, {
        action: "createProject",
        name: "Disposable deletion check",
    });
    await api(other.cookie, { action: "deleteProject", projectId: id }, 404);
    const doc = randomUUID(),
        run = randomUUID();
    await db.query(
        "INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$3,$4,'document','{\"name\":\"Disposable document\"}'),($2,$3,$4,'run','{\"status\":\"pending\"}')",
        [doc, run, owner.user, id],
    );
    await db.query(
        "INSERT INTO epace_chunks(id,document_id,user_id,project_id,ordinal,content) VALUES($1,$2,$3,$4,0,'Disposable chunk')",
        [randomUUID(), doc, owner.user, id],
    );
    await api(owner.cookie, { action: "deleteProject", projectId: id }, 409);
    assert.equal((await db.query("SELECT 1 FROM epace_projects WHERE id=$1", [id])).rowCount, 1);
    await db.query('UPDATE epace_records SET data=\'{"status":"completed"}\' WHERE id=$1', [run]);
    await api(owner.cookie, { action: "deleteProject", projectId: id });
    for (const table of ["epace_records", "epace_chunks", "epace_audit"])
        assert.equal(
            (await db.query(`SELECT 1 FROM ${table} WHERE project_id=$1`, [id])).rowCount,
            0,
        );
    assert.equal((await db.query("SELECT 1 FROM epace_projects WHERE id=$1", [id])).rowCount, 0);
    await api(owner.cookie, { action: "deleteProject", projectId: id }, 404);
    console.log(
        "PASS: owner-only project deletion; pending-run protection; cascaded document/chunk/run/audit cleanup; missing project rejection.",
    );
} finally {
    for (const user of users) await db.query('DELETE FROM "user" WHERE id=$1', [user]);
    await db.end();
}
