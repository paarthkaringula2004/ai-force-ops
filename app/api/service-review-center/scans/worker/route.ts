import { syncConnections } from "@/lib/vulnerabilities/connections";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { boundedJson } from "@/lib/epace/runtime";
import { PaceError } from "@/lib/epace/store";
import { fields, type Facts, type Finding } from "@/lib/vulnerabilities/schema";
import { saveReport } from "@/lib/vulnerabilities/store";
import { continuousScanSeconds, maintainScanStorage } from "@/lib/vulnerabilities/storage";
import {
    expireScans,
    isUuid,
    scanTarget,
    ensureOrganizationMonitoring,
} from "@/lib/vulnerabilities/scans";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) {
    const expected = process.env.SECURITY_SCAN_WORKER_TOKEN || "",
        actual = request.headers.get("authorization")?.replace(/^Bearer /i, "") || "";
    if (
        expected.length < 32 ||
        actual.length !== expected.length ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
        return Response.json({ error: "Worker authentication required." }, { status: 401 });
    try {
        const body = await boundedJson(request, 5_000_000);
        await expireScans();
        if (body.action === "sync-connections") {
            await syncConnections();
            return Response.json({ ok: true });
        }
        if (body.action === "claim") {
            const capabilities = body.capabilities as Record<string, unknown>;
            if (
                !capabilities ||
                typeof capabilities.zap !== "boolean" ||
                typeof capabilities.trivy !== "boolean"
            )
                throw new PaceError("Report scanner availability.");
            await ensureOrganizationMonitoring();
            await maintainScanStorage();
            await db.query(
                "INSERT INTO security_scan_worker(id,checked_at,capabilities) VALUES(1,now(),$1::jsonb) ON CONFLICT(id) DO UPDATE SET checked_at=now(),capabilities=excluded.capabilities",
                [JSON.stringify({ zap: capabilities.zap, trivy: capabilities.trivy })],
            );
            if (!capabilities.zap || !capabilities.trivy) return Response.json({ job: null });
            const lease = randomUUID(),
                target = scanTarget();
            // Serialize workers; SKIP LOCKED and a running-job check prevent shared scanner sessions.
            const c = await db.connect();
            try {
                await c.query("BEGIN");
                await c.query("SELECT pg_advisory_xact_lock(8470220020)");
                const due = await c.query(
                    "SELECT user_id,frequency FROM security_scan_schedules WHERE user_id IN (SELECT user_id FROM workspace_members WHERE active=true AND (role='admin' OR (role='manager' AND 'security'=ANY(permissions)))) AND next_run_at<=now() ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 20",
                );
                for (const schedule of due.rows) {
                    await c.query(
                        "INSERT INTO security_scan_jobs(user_id,request_id,target) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM security_scan_jobs WHERE user_id=$1 AND status IN ('queued','running')) AND ($4='continuous' OR (SELECT count(*) FROM security_scan_jobs WHERE user_id=$1 AND created_at>now()-interval '24 hours')<8) ON CONFLICT DO NOTHING",
                        [schedule.user_id, randomUUID(), target, schedule.frequency],
                    );
                    await c.query(
                        "UPDATE security_scan_schedules SET next_run_at=now()+CASE WHEN frequency='continuous' THEN make_interval(secs => $2) WHEN frequency='manual' THEN interval '100 years' WHEN frequency='daily' THEN interval '1 day' ELSE interval '7 days' END WHERE user_id=$1",
                        [schedule.user_id, continuousScanSeconds()],
                    );
                }
                const running = await c.query(
                    "SELECT 1 FROM security_scan_jobs WHERE status='running'",
                );
                if (running.rowCount) {
                    await c.query("COMMIT");
                    return Response.json({ job: null });
                }
                const job = await c.query(
                    "UPDATE security_scan_jobs SET status='running',lease=$1,heartbeat_at=now(),started_at=now(),phase='Starting scanners',progress=5 WHERE id=(SELECT id FROM security_scan_jobs WHERE user_id IN (SELECT user_id FROM workspace_members WHERE active=true AND (role='admin' OR (role='manager' AND 'security'=ANY(permissions)))) AND status='queued' AND target=$2 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,target,lease",
                    [lease, target],
                );
                await c.query("COMMIT");
                return Response.json({ job: job.rows[0] || null });
            } catch (e) {
                await c.query("ROLLBACK");
                throw e;
            } finally {
                c.release();
            }
        }
        if (!isUuid(body.id) || !isUuid(body.lease))
            throw new PaceError("A job lease is required.");
        const job = (
            await db.query(
                "SELECT * FROM security_scan_jobs WHERE id=$1 AND lease=$2 AND status='running'",
                [body.id, body.lease],
            )
        ).rows[0];
        if (!job) throw new PaceError("Scan lease expired.", 409);
        await db.query("UPDATE security_scan_worker SET checked_at=now() WHERE id=1");
        if (body.action === "progress") {
            if (
                typeof body.phase !== "string" ||
                body.phase.length > 140 ||
                !Number.isInteger(body.progress) ||
                Number(body.progress) < 0 ||
                Number(body.progress) > 95
            )
                throw new PaceError("Invalid scan progress.");
            await db.query(
                "UPDATE security_scan_jobs SET phase=$3,progress=greatest(progress,$4),heartbeat_at=now() WHERE id=$1 AND lease=$2",
                [body.id, body.lease, body.phase, body.progress],
            );
            return Response.json({ ok: true });
        }
        if (body.action === "fail") {
            await db.query(
                "UPDATE security_scan_jobs SET status='failed',phase='Scan failed',error=$3,completed_at=now(),lease=NULL WHERE id=$1 AND lease=$2",
                [
                    body.id,
                    body.lease,
                    typeof body.error === "string" ? body.error.slice(0, 500) : "Scanner failed.",
                ],
            );
            await db.query(
                "INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail,href) VALUES($1,'review-center','security-worker','warning','Project scanner failed',$2,'/service-review-center/eassist?view=automated-alerts') ON CONFLICT(user_id,source,event_key) DO UPDATE SET state='active',detail=excluded.detail,updated_at=now()",
                [
                    job.user_id,
                    typeof body.error === "string" ? body.error.slice(0, 500) : "Scanner failed.",
                ],
            );
            await db.query(
                "UPDATE security_scan_schedules SET next_run_at=now()+make_interval(secs => $2) WHERE user_id=$1 AND frequency='continuous'",
                [job.user_id, continuousScanSeconds()],
            );
            return Response.json({ ok: true });
        }
        if (
            body.action !== "complete" ||
            !Array.isArray(body.findings) ||
            body.findings.length > 5000 ||
            !Array.isArray(body.coverage) ||
            body.coverage.length > 20
        )
            throw new PaceError("Invalid scan result.");
        const coverage = body.coverage.map((value: unknown) => {
            if (!value || typeof value !== "object") throw new PaceError("Invalid coverage.");
            const c = value as Record<string, unknown>;
            for (const k of ["tool", "version", "status", "detail"])
                if (typeof c[k] !== "string" || String(c[k]).length > 4000)
                    throw new PaceError("Invalid coverage field.");
            return { tool: c.tool, version: c.version, status: c.status, detail: c.detail };
        });
        const facts: Facts[] = body.findings.map((value: unknown) => {
            if (!value || typeof value !== "object") throw new PaceError("Invalid finding.");
            const f = value as Record<string, unknown>;
            if (
                Object.values(f).some((v) => typeof v !== "string" || v.length > 8000) ||
                !f.title ||
                (!f.ip && !f.dns) ||
                !["Critical", "High", "Medium", "Low", "Informational", "Unknown"].includes(
                    String(f.severity),
                )
            )
                throw new PaceError("Invalid scanner facts.");
            const normalized = Object.fromEntries(
                fields.map(([k]) => [k, String(f[k] || "")]),
            ) as Omit<Facts, "raw">;
            return {
                ...normalized,
                raw: Object.fromEntries(fields.map(([k, label]) => [label, normalized[k]])),
            };
        });
        const scope = "Automated · " + new URL(job.target).host,
            stamp = new Date().toISOString();
        let importId = job.import_id;
        if (facts.length) {
            if (!importId) {
                const inserted = await db.query(
                    "INSERT INTO vulnerability_imports(user_id,filename,sheet,headers,rows) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id",
                    [
                        job.user_id,
                        "security-" + job.id.slice(0, 8) + ".csv",
                        "Automated",
                        JSON.stringify(fields.map((f) => f[1])),
                        JSON.stringify(facts.map((f) => fields.map(([k]) => f[k]))),
                    ],
                );
                importId = inserted.rows[0].id;
                await db.query(
                    "UPDATE security_scan_jobs SET import_id=$3 WHERE id=$1 AND lease=$2",
                    [body.id, body.lease, importId],
                );
            }
            await saveReport(job.user_id, {
                id: importId,
                scope,
                scannedAt: stamp,
                mapping: Object.fromEntries(fields.map(([k, label]) => [k, label])),
            });
        }
        const snapshot: Finding[] = facts.map((f) => ({
            id: randomUUID(),
            scope,
            facts: f,
            scannedAt: stamp,
            analysis: null,
            analysisModel: null,
            analyzedAt: null,
            updatedAt: stamp,
        }));
        const completed = await db.query(
            "UPDATE security_scan_jobs SET status='completed',phase='Your security report is ready',progress=100,findings=$3::jsonb,coverage=$4::jsonb,completed_at=now(),lease=NULL WHERE id=$1 AND lease=$2 RETURNING id",
            [body.id, body.lease, JSON.stringify(snapshot), JSON.stringify(coverage)],
        );
        if (!completed.rowCount) throw new PaceError("Scan lease expired.", 409);
        await db.query(
            "INSERT INTO platform_events(user_id,source,action,status,summary,href) VALUES($1,'review-center','security-scan','success',$2,'/service-review-center/eassist?view=automated-alerts')",
            [
                job.user_id,
                `Security baseline complete: ${facts.length} scanner observations for ${job.target}`,
            ],
        );
        await db.query(
            "UPDATE platform_alerts SET state='resolved',updated_at=now() WHERE user_id=$1 AND source='review-center' AND event_key='security-worker' AND state<>'resolved'",
            [job.user_id],
        );
        return Response.json({ ok: true, count: facts.length });
    } catch (e) {
        return Response.json(
            { error: e instanceof PaceError ? e.message : "Worker operation failed." },
            { status: e instanceof PaceError ? e.status : 503 },
        );
    }
}
