import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Pool } from "pg";
const base = "http://localhost:3000",
    pool = new Pool({ connectionString: process.env.DATABASE_URL }),
    accounts = [];
let title = "Fixture observation",
    hits = 0,
    healthy = true;
const mock = createServer((req, res) => {
    if (req.headers.authorization !== "Bearer fixture-token") {
        res.writeHead(401).end();
        return;
    }
    hits++;
    if (!healthy) {
        res.writeHead(503).end();
        return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
        JSON.stringify({
            findings: [
                {
                    id: "fixture-1",
                    title,
                    host: "localhost",
                    severity: "High",
                    status: "Active",
                    solution: "Fixture remediation",
                },
            ],
        }),
    );
});
await new Promise((resolve) => mock.listen(39091, "127.0.0.1", resolve));
async function signup() {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Disposable security control test",
            email: `control-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    assert.equal(r.status, 200);
    const a = {
        id: (await r.json()).user.id,
        cookie: r.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
    };
    accounts.push(a);
    return a;
}
async function api(a, path, body, status = 200, origin = base) {
    const r = await fetch(base + "/api/service-review-center/" + path, {
        method: body ? "POST" : "GET",
        headers: { Cookie: a?.cookie || "", Origin: origin, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000),
    });
    const d = await r.json();
    assert.equal(r.status, status, JSON.stringify(d));
    return d;
}
const question = (a, q) => api(a, "chat", { question: q, requestId: randomUUID() });
try {
    await api(null, "security-tools", undefined, 401);
    await api(null, "security-alerts", undefined, 401);
    const a = await signup(),
        b = await signup();
    await api(a, "scans", { action: "ensure-continuous" });
    assert.equal((await api(a, "scans")).schedule.frequency, "continuous");
    await question(a, "Pause continuous monitoring");
    await api(a, "scans", { action: "ensure-continuous" });
    assert.equal((await api(a, "scans")).schedule.frequency, "manual");
    assert.equal((await question(a, "Add scanner tools")).actions[0].kind, "integration");
    assert.match((await question(a, "OWASP Juice Shop")).answer, /not a scanner/);
    assert.match((await question(a, "nmap")).answer, /no built-in REST API/);
    await api(
        a,
        "security-tools",
        {
            action: "test",
            name: "Rejected origin",
            kind: "json",
            base_url: "http://169.254.169.254",
            path: "/api/findings",
            auth_type: "none",
            mapping: { title: "title", dns: "host" },
        },
        403,
    );
    const body = {
        action: "test",
        name: "Disposable scanner API",
        kind: "json",
        base_url: "http://127.0.0.1:39091",
        path: "/api/findings",
        auth_type: "bearer",
        secret: "fixture-token",
        results_path: "findings",
        mapping: {
            title: "title",
            dns: "host",
            qid: "id",
            severity: "severity",
            status: "status",
            solution: "solution",
        },
    };
    assert.equal((await api(a, "security-tools", body)).count, 1);
    const saved = await api(a, "security-tools", { ...body, action: "save" });
    assert.ok(saved.id);
    const connections = (await api(a, "security-tools")).connections;
    assert.equal(connections.length, 1);
    assert.ok(!JSON.stringify(connections).includes("fixture-token"));
    const cipher = (
        await pool.query("SELECT secret_cipher FROM security_tool_connections WHERE id=$1", [
            saved.id,
        ])
    ).rows[0].secret_cipher;
    assert.ok(cipher && !cipher.includes("fixture-token"));
    assert.equal((await api(b, "security-tools")).connections.length, 0);
    await api(b, "security-tools", { action: "toggle", id: saved.id, enabled: false }, 404);
    const alerts = (await api(a, "security-alerts")).alerts;
    assert.ok(alerts.some((x) => x.summary === title));
    assert.equal((await api(b, "security-alerts")).alerts.length, 0);
    await api(a, "security-alerts", { action: "acknowledge", id: alerts[0].id });
    assert.equal((await api(a, "security-alerts")).alerts[0].state, "acknowledged");
    await api(
        a,
        "security-alerts",
        { action: "acknowledge", id: alerts[0].id },
        403,
        "https://untrusted.invalid",
    );
    title = "Updated fixture observation";
    await pool.query(
        "UPDATE security_tool_connections SET checked_at=now()-interval '1 minute' WHERE id=$1",
        [saved.id],
    );
    const sync = await fetch(base + "/api/service-review-center/scans/worker", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + process.env.SECURITY_SCAN_WORKER_TOKEN,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "sync-connections" }),
    });
    assert.equal(sync.status, 200);
    const updated = await api(a, "security-alerts");
    assert.ok(
        updated.alerts.some((x) => x.summary === title && x.state === "active"),
        JSON.stringify({
            alerts: updated.alerts,
            connection: (await api(a, "security-tools")).connections,
        }),
    );
    assert.ok(hits >= 3);
    const before = hits;
    await pool.query(
        "UPDATE security_tool_connections SET checked_at=now()-interval '1 minute',sync_until=now()+interval '2 minutes' WHERE id=$1",
        [saved.id],
    );
    const syncWorker = async () => {
        const r = await fetch(base + "/api/service-review-center/scans/worker", {
            method: "POST",
            headers: {
                Authorization: "Bearer " + process.env.SECURITY_SCAN_WORKER_TOKEN,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "sync-connections" }),
        });
        assert.equal(r.status, 200);
    };
    await syncWorker();
    assert.equal(hits, before, "An active collector lease must prevent duplicate collection.");
    healthy = false;
    await pool.query(
        "UPDATE security_tool_connections SET sync_until=NULL,checked_at=now()-interval '1 minute' WHERE id=$1",
        [saved.id],
    );
    await syncWorker();
    assert.ok(
        (await api(a, "security-alerts")).alerts.some(
            (x) => x.summary.includes("synchronization failed") && x.state === "active",
        ),
    );
    healthy = true;
    await pool.query(
        "UPDATE security_tool_connections SET checked_at=now()-interval '1 minute' WHERE id=$1",
        [saved.id],
    );
    await syncWorker();
    assert.ok(
        (await api(a, "security-alerts")).alerts.some(
            (x) => x.summary.includes("synchronization failed") && x.state === "resolved",
        ),
    );
    await api(a, "security-tools", { action: "toggle", id: saved.id, enabled: false });
    assert.equal((await api(a, "security-tools")).connections[0].enabled, false);
    const id = randomUUID();
    await pool.query(
        "INSERT INTO security_scan_jobs(id,user_id,request_id,target,status,phase,progress,findings,coverage,completed_at) VALUES($1,$2,$3,$4,'completed','Fixture',100,'[]','[]',now())",
        [id, a.id, randomUUID(), base],
    );
    const exportTurn = await question(a, "Give me Excel file");
    assert.deepEqual(exportTurn.actions, [{ kind: "download", format: "xlsx", scanId: id }]);
    assert.ok(!exportTurn.answer.includes("]("));
    const download = await fetch(
        base + "/api/service-review-center/scans?id=" + id + "&format=xlsx",
        { headers: { Cookie: a.cookie } },
    );
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /attachment/);
    assert.equal(
        Buffer.from(await download.arrayBuffer())
            .subarray(0, 2)
            .toString(),
        "PK",
    );
    console.log(
        "PASS: continuous defaults and pause persistence, chat actions, tool capability guidance, encrypted API connection/test/sync, changed findings, eAssist alerts/acknowledgment, account isolation, approved origins and Excel attachment actions.",
    );
} finally {
    mock.close();
    for (const a of accounts) await pool.query('DELETE FROM "user" WHERE id=$1', [a.id]);
    await pool.end();
}
