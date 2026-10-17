import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    base = process.env.WORKSPACE_TEST_URL || "http://localhost:3000",
    users = [];
async function account(name) {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            email: `roles-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
            role: "admin",
        }),
    });
    assert.equal(r.status, 200, await r.clone().text());
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
async function api(who, path, body, method = body ? "POST" : "GET", status = 200, origin = base) {
    const r = await fetch(base + path, {
        method,
        headers: { Cookie: who?.cookie || "", Origin: origin, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await r.text();
    let d;
    try {
        d = JSON.parse(raw);
    } catch {
        throw new Error(
            method +
                " " +
                path +
                ": HTTP " +
                r.status +
                " " +
                r.headers.get("location") +
                " " +
                raw.slice(0, 400),
        );
    }
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(d)}`);
    return d;
}
async function edit(admin, who, role, managerId = null, permissions = [], active = true) {
    return api(
        admin,
        "/api/workspace/admin",
        {
            userId: who.user,
            role,
            managerId,
            permissions,
            active,
            department: "Software Engineering",
            departmentCode: 1,
            qualificationCode: "B",
            employeeId: "",
        },
        "PATCH",
    );
}
async function seed(who) {
    const id = randomUUID();
    await pool.query(
        "INSERT INTO employee_service_requests(id,user_id,request_number,kind,details) VALUES($1,$2,$3,'leave','{\"reason\":\"Disposable workflow test\"}')",
        [id, who.user, "REQ-TEST-" + id],
    );
    return id;
}
try {
    const [employee, manager, outsider, admin] = await Promise.all([
        account("Disposable Employee"),
        account("Disposable Manager"),
        account("Disposable Other Employee"),
        account("Disposable Admin"),
    ]);
    assert.equal((await api(employee, "/api/workspace/access")).member.role, "employee");
    await pool.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [admin.user]);
    await edit(admin, manager, "manager");
    await edit(admin, employee, "employee", manager.user);
    const protectedPaths = [
        "/api/agents",
        "/api/tools",
        "/api/epace",
        "/api/eassist",
        "/api/service-review-center/records",
        "/api/service-review-center/scans",
        "/api/service-review-center/vulnerabilities",
        "/api/workspace/admin",
        "/api/metrics",
    ];
    await Promise.all(protectedPaths.map((path) => api(employee, path, null, "GET", 403)));
    await api(employee, "/api/workspace/requests?scope=team", null, "GET", 403);
    await api(manager, "/api/workspace/admin", null, "GET", 403);
    await api(manager, "/api/service-review-center/scans", null, "GET", 403);
    const own = await seed(employee),
        foreign = await seed(outsider),
        managerOwn = await seed(manager);
    const queue = await api(manager, "/api/workspace/requests?scope=team");
    assert.deepEqual(
        queue.requests.map((r) => r.id),
        [own],
    );
    const decision = (id, action = "approve", note = "Reviewed") => ({ id, action, note });
    await api(manager, "/api/workspace/requests", decision(foreign), "PATCH", 403);
    await api(manager, "/api/workspace/requests", decision(managerOwn), "PATCH", 403);
    await api(employee, "/api/workspace/requests", decision(own), "PATCH", 403);
    await api(
        manager,
        "/api/workspace/requests",
        decision(own),
        "PATCH",
        403,
        "https://other.invalid",
    );
    await api(manager, "/api/workspace/requests", decision(own), "PATCH");
    await api(
        manager,
        "/api/workspace/requests",
        decision(own, "reject", "Changed mind"),
        "PATCH",
        409,
    );
    assert.equal(
        (await api(employee, "/api/workspace/requests?scope=own")).requests[0].status,
        "approved",
    );
    await api(
        manager,
        "/api/workspace/requests",
        decision(own, "fulfil", "Verified manually"),
        "PATCH",
        403,
    );
    await api(
        admin,
        "/api/workspace/requests",
        decision(own, "fulfil", "Verified manually"),
        "PATCH",
    );
    assert.equal(
        (await api(employee, "/api/workspace/requests?scope=own")).requests[0].status,
        "fulfilled",
    );
    console.log(
        "PASS: default Employee, protected APIs, team isolation, self-approval rejection, decision state transitions and manual fulfilment.",
    );
    await edit(admin, manager, "manager", null, ["security"]);
    assert.equal((await api(manager, "/api/workspace/access")).member.permissions[0], "security");
    await api(manager, "/api/service-review-center/scans");
    await api(manager, "/api/service-review-center/chat", {
        question: "Show scan status",
        requestId: randomUUID(),
    });
    await api(manager, "/api/service-review-center/chat", {
        question: "Is everything okay?",
        requestId: randomUUID(),
    });
    await edit(admin, manager, "manager");
    await api(manager, "/api/service-review-center/scans", null, "GET", 403);
    await edit(admin, manager, "manager", null, ["operations"]);
    await api(
        manager,
        "/api/service-review-center/chat",
        { question: "Enable continuous security monitoring", requestId: randomUUID() },
        "POST",
        403,
    );
    await api(
        manager,
        "/api/service-review-center/chat",
        { question: "Refresh my connections", requestId: randomUUID() },
        "POST",
        403,
    );
    await edit(admin, manager, "manager");
    await edit(admin, manager, "manager", null, ["integrations"]);
    await api(manager, "/api/eassist", null, "GET", 403);
    await api(manager, "/api/eassist", { action: "security.save" }, "POST", 403);
    await edit(admin, manager, "manager");
    await edit(admin, employee, "employee", manager.user, [], false);
    await api(employee, "/api/playground/employee", null, "GET", 403);
    await edit(admin, employee, "employee", manager.user);
    const payload = {
        model: "",
        agentId: randomUUID(),
        messages: [{ role: "user", content: "hello" }],
    };
    await api(employee, "/api/playground", payload, "POST", 403);
    await api(
        manager,
        "/api/workspace/admin",
        {
            userId: manager.user,
            role: "admin",
            managerId: null,
            department: "",
            employeeId: "",
            permissions: [],
            active: true,
        },
        "PATCH",
        403,
    );
    await api(
        admin,
        "/api/workspace/admin",
        {
            userId: employee.user,
            role: "employee",
            managerId: manager.user,
            department: "",
            employeeId: "",
            permissions: ["security"],
            active: true,
        },
        "PATCH",
        400,
    );
    assert.ok(
        (await pool.query("SELECT 1 FROM workspace_audit WHERE actor_id=$1", [manager.user]))
            .rowCount,
    );
    const page = await fetch(base + "/dashboard/administration", {
        headers: { Cookie: employee.cookie },
        redirect: "manual",
    });
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location"), /dashboard\?access=denied/);
    console.log(
        "PASS: explicit Manager grants/revocation, disabled-account enforcement, role escalation rejection, API agent-preview protection, audit trail and direct-page protection.",
    );
} finally {
    await pool.query(
        "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
        [users],
    );
    for (const user of users) await pool.query('DELETE FROM "user" WHERE id=$1', [user]);
    await pool.end();
}
