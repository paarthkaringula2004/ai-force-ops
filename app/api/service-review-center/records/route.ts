import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";

const recordTypes = new Set(["metric", "health", "inventory", "lifecycle", "forecast", "availability"]);
type RecordType = "metric" | "health" | "inventory" | "lifecycle" | "forecast" | "availability";
type InputRecord = { recordType: RecordType; recordKey: string; payload: Record<string, unknown>; observedAt?: Date };
type StoredRecord = { id: string; recordType: RecordType; recordKey: string; payload: Record<string, unknown>; observedAt: Date };

function parseRecord(value: unknown): InputRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const recordType = item.recordType;
  const recordKey = typeof item.recordKey === "string" ? item.recordKey.trim() : "";
  const payload = item.payload;
  if (typeof recordType !== "string" || !recordTypes.has(recordType) || !recordKey || recordKey.length > 180 || !payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data = payload as Record<string, unknown>;
  const numeric = (key: string) => typeof data[key] === "number" && Number.isFinite(data[key]);
  const string = (key: string, max = 240) => typeof data[key] === "string" && (data[key] as string).trim().length > 0 && (data[key] as string).length <= max;
  const valid = recordType === "metric" ? string("label") && numeric("value")
    : recordType === "health" ? string("device", 180) && string("status", 40)
      : recordType === "inventory" ? string("region", 80) && string("category", 80) && numeric("count")
        : recordType === "lifecycle" ? string("stage", 80) && numeric("count")
          : recordType === "forecast" ? string("environment", 40) && string("period", 40) && numeric("lowerBound") && numeric("upperBound")
            : string("service", 180) && numeric("availability");
  if (!valid) return null;
  const observedAt = item.observedAt === undefined ? undefined : new Date(String(item.observedAt));
  if (observedAt && Number.isNaN(observedAt.getTime())) return null;
  return { recordType: recordType as RecordType, recordKey, payload: data, observedAt };
}

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view service review data." }, { status: 401 });
  try {
    const result = await db.query<StoredRecord>(
      `SELECT id, record_type AS "recordType", record_key AS "recordKey", payload,
              observed_at AS "observedAt"
       FROM service_review_records WHERE user_id = $1
       ORDER BY observed_at DESC LIMIT 1500`,
      [session.user.id],
    );
    return Response.json({ records: result.rows.map((row) => ({ ...row, observedAt: row.observedAt.toISOString() })), checkedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: "Could not load service review records from PostgreSQL." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to write service review data." }, { status: 401 });
  try {
    const body = await request.json() as { records?: unknown };
    if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 250) {
      return Response.json({ error: "Send between 1 and 250 service records." }, { status: 400 });
    }
    const records = body.records.map(parseRecord);
    if (records.some((record) => record === null)) {
      return Response.json({ error: "A record is invalid. Check its type, key, and required fields." }, { status: 400 });
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const record of records as InputRecord[]) {
        await client.query(
          `INSERT INTO service_review_records (id, user_id, record_type, record_key, payload, observed_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, now()))`,
          [randomUUID(), session.user.id, record.recordType, record.recordKey, JSON.stringify(record.payload), record.observedAt?.toISOString() ?? null],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return Response.json({ accepted: records.length, receivedAt: new Date().toISOString() }, { status: 201 });
  } catch {
    return Response.json({ error: "Could not save service review records to PostgreSQL." }, { status: 503 });
  }
}
