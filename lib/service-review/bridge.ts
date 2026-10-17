import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { projectReadings, type Source, type SourceRecord } from "./model";
import { enrichReadings, connectionHealth } from "./enrichment";

// Called by the existing leased collector after a successful source read, including worker runs.
export async function importConnection(source: Source, at = new Date().toISOString()) {
    try {
        await importSnapshot(source, at);
    } catch (error) {
        await db.query(
            `INSERT INTO service_review_sync(connection_id,last_error) VALUES($1,$2) ON CONFLICT(connection_id) DO UPDATE SET last_error=EXCLUDED.last_error`,
            [source.id, error instanceof Error ? error.message : "Review import failed."],
        );
    }
}
async function importSnapshot(source: Source, at: string) {
    // Resolve and describe outside the storage transaction so upstream latency cannot hold database locks.
    const result = await db.query<SourceRecord>(
        `SELECT kind,external_id,data FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind IN ('monitoring','alerts','silences','tasks','templates','incidents','incident_scope')`,
        [source.user_id, source.id],
    );
    const readings = projectReadings(source, result.rows, at);
    if (source.base_url)
        readings.push({
            recordType: "health",
            recordKey: `${source.id}:connection-health`,
            observedAt: at,
            payload: connectionHealth(source.base_url, source.name, source.kind, "connected", ""),
        });
    await enrichReadings(source.user_id, readings);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        // Serialize projection per connection; source removal/disable cannot leak cached data into the review.
        const locked = await client.query(
            "SELECT id FROM eassist_connections WHERE id=$1 AND user_id=$2 AND enabled=true FOR UPDATE",
            [source.id, source.user_id],
        );
        if (!locked.rowCount) {
            await client.query("ROLLBACK");
            return;
        }
        const previous = (
            await client.query(
                "SELECT imported_at FROM service_review_sync WHERE connection_id=$1",
                [source.id],
            )
        ).rows[0];
        if (previous?.imported_at && new Date(previous.imported_at).getTime() > Date.parse(at)) {
            await client.query("ROLLBACK");
            return;
        }
        await client.query(
            "UPDATE service_review_records SET is_current=false WHERE source_connection_id=$1 AND is_current=true",
            [source.id],
        );
        if (readings.length)
            await client.query(
                `INSERT INTO service_review_records(id,user_id,record_type,record_key,payload,observed_at,source_connection_id,source_kind,source_name,is_current,sample_bucket)
   SELECT x.id,$1,x.record_type,x.record_key,x.payload,x.observed_at,$2,$3,$4,true,date_trunc('minute',$5::timestamptz)
   FROM jsonb_to_recordset($6::jsonb) AS x(id uuid,record_type text,record_key text,payload jsonb,observed_at timestamptz)
   ON CONFLICT(source_connection_id,record_type,record_key,sample_bucket) WHERE source_connection_id IS NOT NULL
   DO UPDATE SET payload=EXCLUDED.payload,observed_at=EXCLUDED.observed_at,is_current=true,source_name=EXCLUDED.source_name`,
                [
                    source.user_id,
                    source.id,
                    source.kind,
                    source.name,
                    at,
                    JSON.stringify(
                        readings.map((r) => ({
                            id: randomUUID(),
                            record_type: r.recordType,
                            record_key: r.recordKey,
                            payload: r.payload,
                            observed_at: r.observedAt,
                        })),
                    ),
                ],
            );
        await client.query(
            `INSERT INTO service_review_sync(connection_id,imported_at,last_error,reading_count) VALUES($1,$2,'',$3)
   ON CONFLICT(connection_id) DO UPDATE SET imported_at=EXCLUDED.imported_at,last_error='',reading_count=EXCLUDED.reading_count`,
            [source.id, at, readings.length],
        );
        await client.query(
            `DELETE FROM service_review_records WHERE source_connection_id=$1 AND is_current=false AND observed_at<now()-interval '90 days'`,
            [source.id],
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        // A projection failure is separate from the source connection's health. Keep the last good readings visible as stale.
        await client.query(
            `INSERT INTO service_review_sync(connection_id,last_error) VALUES($1,$2) ON CONFLICT(connection_id) DO UPDATE SET last_error=EXCLUDED.last_error`,
            [source.id, error instanceof Error ? error.message : "Review import failed."],
        );
    } finally {
        client.release();
    }
}
