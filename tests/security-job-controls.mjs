import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import ExcelJS from "exceljs";
const base = "http://localhost:3000",
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
let account;
async function call(path, body, auth = {}, status = 200) {
    const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { Origin: base, "Content-Type": "application/json", ...auth },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000),
    });
    const d = await r.json();
    assert.equal(r.status, status, JSON.stringify(d));
    return d;
}
const worker = (body, status = 200) =>
    call(
        "/api/service-review-center/scans/worker",
        body,
        { Authorization: `Bearer ${process.env.SECURITY_SCAN_WORKER_TOKEN}` },
        status,
    );
try {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Disposable queue control test",
            email: `queue-${randomUUID()}@example.invalid`,
            password: randomUUID() + "Aa1!",
        }),
    });
    const user = await r.json();
    assert.equal(r.status, 200);
    account = {
        id: user.user.id,
        cookie: r.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
    };
    const owner = { Cookie: account.cookie };
    await call(
        "/api/service-review-center/scans/worker",
        { action: "claim", capabilities: { zap: true, trivy: true } },
        {},
        401,
    );
    await worker({ action: "claim", capabilities: { zap: true, trivy: true } });
    await call(
        "/api/service-review-center/scans",
        { action: "schedule", frequency: "hourly" },
        owner,
        400,
    );
    await call(
        "/api/service-review-center/scans",
        { action: "schedule", frequency: "daily" },
        owner,
    );
    assert.equal(
        (await call("/api/service-review-center/scans", undefined, owner)).schedule.frequency,
        "daily",
    );
    await pool.query(
        "UPDATE security_scan_schedules SET next_run_at=now()-interval '1 minute' WHERE user_id=$1",
        [account.id],
    );
    const { job } = await worker({ action: "claim", capabilities: { zap: true, trivy: true } });
    assert.ok(job);
    const repeated = await worker({ action: "claim", capabilities: { zap: true, trivy: true } });
    assert.equal(repeated.job, null);
    await worker(
        { action: "progress", id: job.id, lease: randomUUID(), phase: "Wrong lease", progress: 10 },
        409,
    );
    await worker({
        action: "progress",
        id: job.id,
        lease: job.lease,
        phase: "Fixture queue check",
        progress: 90,
    });
    await worker({
        action: "progress",
        id: job.id,
        lease: job.lease,
        phase: "Fixture queue check",
        progress: 10,
    });
    assert.equal(
        (await call("/api/service-review-center/scans", undefined, owner)).jobs[0].progress,
        90,
    );
    await worker({
        action: "complete",
        id: job.id,
        lease: job.lease,
        findings: [],
        coverage: [
            {
                tool: "Queue test fixture",
                version: "1",
                status: "Completed",
                detail: "Empty result tests export behavior; no real security assessment.",
            },
        ],
    });
    const excel = await fetch(base + `/api/service-review-center/scans?id=${job.id}&format=xlsx`, {
        headers: owner,
    });
    assert.equal(excel.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await excel.arrayBuffer()));
    assert.deepEqual(
        book.worksheets.map((s) => s.name),
        ["Summary", "Findings", "Analysis", "Coverage", "Remediation"],
    );
    assert.equal(book.getWorksheet("Findings").rowCount, 1);
    assert.equal(book.getWorksheet("Coverage").rowCount, 2);
    await call(
        "/api/service-review-center/scans",
        { action: "schedule", frequency: "manual" },
        owner,
    );
    assert.equal(
        (await call("/api/service-review-center/scans", undefined, owner)).schedule.frequency,
        "manual",
    );
    const requestId = randomUUID();
    const chat = await call(
        "/api/service-review-center/chat",
        { question: "Start project scan", requestId },
        owner,
    );
    assert.match(chat.answer, /queued/);
    const repeat = await call(
        "/api/service-review-center/chat",
        { question: "Start project scan", requestId },
        owner,
    );
    assert.equal(repeat.answer, chat.answer);
    const claimed = await worker({ action: "claim", capabilities: { zap: true, trivy: true } });
    assert.ok(claimed.job);
    await pool.query(
        "UPDATE security_scan_jobs SET heartbeat_at=now()-interval '4 minutes' WHERE id=$1",
        [claimed.job.id],
    );
    const failed = (await call("/api/service-review-center/scans", undefined, owner)).jobs.find(
        (j) => j.id === claimed.job.id,
    );
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /stopped responding/);
    await worker(
        {
            action: "complete",
            id: claimed.job.id,
            lease: claimed.job.lease,
            findings: [],
            coverage: [],
        },
        409,
    );
    await call(
        "/api/service-review-center/vulnerabilities",
        { action: "analyze", ids: [randomUUID()] },
        owner,
        403,
    );
    console.log(
        "PASS: schedules create/pause/enqueue, one active worker, monotonic progress, lease rejection/expiry, empty CSV/XLSX report support, idempotent chatbot scan launch, paid analysis disabled.",
    );
} finally {
    if (account) await pool.query('DELETE FROM "user" WHERE id=$1', [account.id]);
    await pool.end();
}
