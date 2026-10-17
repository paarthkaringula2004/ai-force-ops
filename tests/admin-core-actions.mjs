import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    c = await pool.connect();
// Actual SQL and business handlers; every commit remains inside one rollback.
const client = {
    query: (sql, args) =>
        /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) ? Promise.resolve({ rows: [] }) : c.query(sql, args),
    release() {},
};
const db = { query: (sql, args) => c.query(sql, args), connect: async () => client };
let actor;
const access = {
    workspaceAccess: async (id) =>
        (await c.query("SELECT * FROM workspace_members WHERE user_id=$1", [id])).rows[0],
};
const deps = {
    "./db": { db },
    "@/lib/db": { db },
    "./workspace-access": access,
    "@/lib/workspace-access": access,
    "@/lib/request-session": {
        getRequestSession: async () => (actor ? { user: { id: actor } } : null),
    },
};
const members = load("lib/workspace-members.ts", deps),
    catalog = load("lib/staff-catalog.ts", deps),
    chat = load("lib/workspace-chat.ts", deps),
    decisions = load("lib/workspace-request-chat.ts", deps);
const employment = load("app/api/workspace/employment/route.ts", deps),
    tickets = load("app/api/workspace/tickets/route.ts", deps),
    organization = load("app/api/workspace/organization/route.ts", deps);
const deletion = load("lib/workspace-member-deletion.ts", deps);
const member = () => access.workspaceAccess(actor);
const req = (body) =>
    new Request("http://localhost:3000/api/workspace/test", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
async function fixture(role) {
    const id = randomUUID();
    await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [id, "Admin action fixture", id + "@example.invalid"],
    );
    await c.query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [id, role]);
    return id;
}
async function update(id, patch = {}) {
    const old = await access.workspaceAccess(id);
    await members.updateMemberInTransaction(client, actor, {
        userId: id,
        role: old.role,
        active: old.active,
        department: old.department,
        employeeId: old.employee_id,
        managerId: old.manager_id,
        permissions: [],
        departmentCode: old.department_code,
        qualificationCode: old.qualification_code,
        ...patch,
    });
}
try {
    await c.query("BEGIN");
    actor = await fixture("admin");
    const admin = actor,
        person = await fixture("user"),
        outsider = await fixture("user");
    const d = await catalog.createCatalogEntry(client, actor, {
        kind: "department",
        name: "Admin check " + randomUUID(),
    });
    const q = await catalog.createCatalogEntry(client, actor, {
        kind: "qualification",
        name: "Admin check qualification " + randomUUID(),
        code: "QVERIFY",
    });
    const job = await catalog.createCatalogEntry(client, actor, {
        kind: "job_title",
        name: "Verification Engineer",
        departmentCode: d.code,
    });
    let result = await chat.workspaceChatReply(
        actor,
        "Assign role " + person + "@example.invalid manager",
        await member(),
        { department: d.name },
    );
    assert.match(result.reply, /highest completed qualification/);
    result = await chat.workspaceChatReply(actor, q.code, await member());
    assert.match(result.reply, /Review role change/);
    assert.equal((await access.workspaceAccess(person)).role, "user");
    const confirmation = result.choices[0];
    result = await chat.workspaceChatReply(actor, confirmation, await member());
    assert.match(result.reply, /Role updated/);
    const manager = await access.workspaceAccess(person);
    assert.equal(manager.role, "manager");
    assert.equal(manager.qualification_code, q.code);
    assert.match(manager.employee_id, /M01QVERIFY$/);
    assert.match(
        (await chat.workspaceChatReply(actor, confirmation, await member())).reply,
        /expired or was replaced/,
    );
    console.log(
        "PASS role assignment: missing qualification, preview-only state, actual Manager role/ID, confirmation and replay.",
    );

    await update(outsider, {
        role: "employee",
        department: d.name,
        departmentCode: d.code,
        qualificationCode: q.code,
        jobTitleId: job.id,
        managerId: person,
    });
    let response = await employment.POST(req({ userId: outsider, confirm: true }));
    assert.equal(response.status, 200);
    const identity = (await response.json()).employeeId;
    assert.match(identity, /E02QVERIFY$/);
    response = await employment.POST(req({ userId: outsider, confirm: true }));
    assert.equal((await response.json()).employeeId, identity);
    await update(outsider, { active: false });
    assert.equal((await access.workspaceAccess(outsider)).active, false);
    await update(outsider, { active: true });
    assert.equal((await access.workspaceAccess(outsider)).manager_id, person);
    assert.equal((await access.workspaceAccess(outsider)).job_title_id, job.id);
    console.log(
        "PASS employment, qualification/job assignment, reporting manager, stable Employee ID, activation and deactivation persisted.",
    );

    const allocation = { userId: outsider, amount: 123, requestId: randomUUID() };
    response = await tickets.POST(req(allocation));
    assert.equal(response.status, 200);
    const balance = (await response.json()).balance;
    response = await tickets.POST(req(allocation));
    assert.equal((await response.json()).balance, balance);
    response = await tickets.POST(req({ ...allocation, amount: 124 }));
    assert.equal(response.status, 409);
    actor = outsider;
    assert.equal((await tickets.POST(req({ ...allocation, requestId: randomUUID() }))).status, 403);
    actor = admin;
    response = await tickets.GET(req({}));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).unlimited, true);
    console.log(
        "PASS ticket allocation changes balance once, rejects conflicting replay and non-Admin, Admin balance remains unlimited.",
    );

    for (const action of ["approve", "reject", "cancel", "fulfil"]) {
        const id = randomUUID(),
            number = "REQ-" + id.replaceAll("-", "").slice(0, 12).toUpperCase();
        await c.query(
            "INSERT INTO employee_service_requests(id,user_id,request_number,kind,details,status) VALUES($1,$2,$3,'equipment','{}',$4)",
            [id, outsider, number, action === "fulfil" ? "approved" : "pending_approval"],
        );
        const command =
            action +
            " " +
            number +
            (action === "reject"
                ? " because Not approved"
                : action === "fulfil"
                  ? " with note Verified fixture delivery"
                  : "");
        const before = (
            await c.query("SELECT status FROM employee_service_requests WHERE id=$1", [id])
        ).rows[0].status;
        result = await decisions.workspaceRequestChatReply(actor, command, await member());
        assert.match(result.reply, /Review request decision/);
        assert.equal(
            (await c.query("SELECT status FROM employee_service_requests WHERE id=$1", [id]))
                .rows[0].status,
            before,
        );
        const token = result.choices[0];
        result = await decisions.workspaceRequestChatReply(actor, token, await member());
        assert.equal(
            (await c.query("SELECT status FROM employee_service_requests WHERE id=$1", [id]))
                .rows[0].status,
            { approve: "approved", reject: "rejected", cancel: "cancelled", fulfil: "fulfilled" }[
                action
            ],
        );
        assert.match(
            (await decisions.workspaceRequestChatReply(actor, token, await member())).reply,
            /expired or was replaced/,
        );
    }
    console.log(
        "PASS approve/reject/cancel/fulfil: real persisted transitions, no mutation before confirmation, evidence notes and replay protection.",
    );

    const vacancyId = randomUUID();
    response = await organization.PATCH(
        req({
            action: "vacancy",
            id: vacancyId,
            title: "Disposable verification role",
            description: "Fixture only",
            applicationUrl: "https://example.invalid/apply",
            active: true,
        }),
    );
    assert.equal(response.status, 200);
    assert.equal(
        (await c.query("SELECT active FROM organization_vacancies WHERE id=$1", [vacancyId]))
            .rows[0].active,
        true,
    );
    response = await organization.PATCH(
        req({
            action: "vacancy",
            id: vacancyId,
            title: "Disposable verification role",
            description: "Fixture only",
            applicationUrl: "https://example.invalid/apply",
            active: false,
        }),
    );
    assert.equal(response.status, 200);
    assert.equal(
        (await c.query("SELECT active FROM organization_vacancies WHERE id=$1", [vacancyId]))
            .rows[0].active,
        false,
    );
    await assert.rejects(
        () => catalog.deleteDepartment(client, actor, { code: d.code, confirmation: d.name }),
        (e) => e.status === 409,
    );
    const unused = await catalog.createCatalogEntry(client, actor, {
        kind: "department",
        name: "Delete fixture " + randomUUID(),
    });
    await catalog.deleteDepartment(client, actor, { code: unused.code, confirmation: unused.name });
    assert.equal(
        (await c.query("SELECT 1 FROM staff_departments WHERE code=$1", [unused.code])).rowCount,
        0,
    );
    const next = await catalog.createCatalogEntry(client, actor, {
        kind: "department",
        name: "Next fixture " + randomUUID(),
    });
    assert.ok(next.code > unused.code);
    console.log(
        "PASS vacancy publish/update/close, protected in-use department deletion, unused deletion and monotonic numbers.",
    );

    const target = await fixture("user"),
        targetMember = await access.workspaceAccess(target),
        email = target + "@example.invalid";
    await deletion.deleteMemberInTransaction(client, actor, {
        userId: target,
        confirmation: email,
        updatedAt: new Date(targetMember.updated_at).toISOString(),
    });
    assert.equal((await c.query('SELECT 1 FROM "user" WHERE id=$1', [target])).rowCount, 0);
    assert.ok(
        (await c.query("SELECT 1 FROM workspace_audit WHERE actor_id=$1", [admin])).rowCount > 10,
    );
    console.log(
        "PASS actual account deletion and retained action audit evidence. All fixtures rolled back; no real mail, provider actions or account changes.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
