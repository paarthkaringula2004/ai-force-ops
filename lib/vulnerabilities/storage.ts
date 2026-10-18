import { db } from "@/lib/db";

// Full ZAP/Trivy scans are separate from the live alert and integration collectors.
export function continuousScanSeconds() {
    const configured = Number(process.env.SECURITY_SCAN_INTERVAL_SECONDS || 300);
    return Number.isInteger(configured) && configured >= 60 && configured <= 86400
        ? configured
        : 300;
}

let nextMaintenance = 0;

// Keep current findings and manually uploaded reports. Only disposable scan history
// and expired connector snapshots have a retention limit.
export async function maintainScanStorage(force = false) {
    if (!force && Date.now() < nextMaintenance) return;
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            "SELECT pg_try_advisory_xact_lock(8470220021) AS locked",
        );
        if (!locked.rows[0].locked) {
            await client.query("ROLLBACK");
            return;
        }
        // Preserve at least the latest successful report for every account/target,
        // even if monitoring has been paused for more than a month.
        const scans = await client.query(`
            WITH ranked AS (
                SELECT id, completed_at,
                    row_number() OVER (
                        PARTITION BY user_id, target, status
                        ORDER BY completed_at DESC NULLS LAST, created_at DESC, id DESC
                    ) AS position
                FROM security_scan_jobs
                WHERE status IN ('completed', 'failed')
            )
            DELETE FROM security_scan_jobs j USING ranked r
            WHERE j.id=r.id AND j.status IN ('completed', 'failed')
                AND r.position>1
                AND (r.position>100 OR r.completed_at<now()-interval '30 days')
        `);
        const readings = await client.query(`
            WITH ranked AS (
                SELECT id, row_number() OVER (
                    PARTITION BY source_connection_id, record_type, record_key
                    ORDER BY observed_at DESC, id DESC
                ) AS position
                FROM service_review_records
                WHERE source_connection_id IS NOT NULL
            )
            DELETE FROM service_review_records r USING ranked h
            WHERE r.id=h.id AND r.is_current=false
                AND (h.position>1440 OR r.observed_at<now()-interval '30 days')
        `);
        // These are saved worker-generated envelopes, not uploaded spreadsheets.
        // Keep any envelope still needed by a report, finding, or audit revision.
        const imports = await client.query(`
            DELETE FROM vulnerability_imports i
            WHERE i.sheet='Automated' AND i.filename LIKE 'security-%.csv'
                AND i.status='saved' AND i.created_at<now()-interval '30 days'
                AND NOT EXISTS (SELECT 1 FROM security_scan_jobs j WHERE j.import_id=i.id)
                AND NOT EXISTS (SELECT 1 FROM vulnerability_findings f WHERE f.import_id=i.id)
                AND NOT EXISTS (SELECT 1 FROM vulnerability_revisions v WHERE v.import_id=i.id)
        `);
        await client.query("COMMIT");
        nextMaintenance = Date.now() + 60 * 60 * 1000;
        return {
            scans: scans.rowCount || 0,
            readings: readings.rowCount || 0,
            imports: imports.rowCount || 0,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
