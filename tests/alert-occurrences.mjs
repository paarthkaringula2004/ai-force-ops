import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import { load } from "./helpers/load-ts.mjs";

const { groupRepeatedAlerts, alertGroupKey, recordAlertDescription } = load("lib/alert-groups.ts");
const describe = a => ({ key: alertGroupKey(a.account, a.source, a.title), time: a.time, state: a.state, history: a.history, severity: a.severity });
const items = [
    { id: "1", account: "alice", source: "scanner", title: " API key ", time: "2026-10-18T01:00:00Z", state: "active" },
    { id: "2", account: "alice", source: "scanner", title: "API key", time: "2026-10-18T02:00:00Z", state: "resolved" },
    { id: "3", account: "bob", source: "scanner", title: "API key", time: "2026-10-18T01:00:00Z", state: "active" },
    { id: "4", account: "alice", source: "connection", title: "API key", time: "2026-10-18T01:00:00Z", state: "active" },
];
const grouped = groupRepeatedAlerts([...items, items[0]], describe);
assert.equal(grouped.length, 3);
assert.equal(grouped[0].members.length, 2);
assert.equal(grouped[0].item.id, "1", "An unresolved issue must not be hidden by a newer resolved issue");
assert.deepEqual(grouped[0].times, ["2026-10-18T02:00:00Z", "2026-10-18T01:00:00Z"]);
assert.equal(groupRepeatedAlerts([items[0], { ...items[0], id: "5" }], describe)[0].times.length, 2);
assert.equal(groupRepeatedAlerts([], describe).length, 0);
assert.equal(groupRepeatedAlerts([{ ...items[0], severity: "critical" }, { ...items[0], id: "less-urgent", time: "2026-10-18T04:00:00Z", severity: "warning" }], describe)[0].item.id, "1", "Keep a critical active issue visible even if a lower-severity one is newer");
const record = { id: "record", connection_id: "platform", observed_at: "2026-10-18T01:00:00Z", data: { platform: true, labels: { account_user_id: "alice", component: "scanner", alertname: "API key" }, occurrenceTimes: ["2026-10-18T03:00:00Z", "2026-10-18T01:00:00Z"], state: "active" } };
assert.equal(recordAlertDescription(record).time, "2026-10-18T03:00:00Z");

const db = new pg.Client(postgresConnectionOptions());
try {
    await db.connect();
    await db.query("BEGIN");
    const schema = "alert_history_test_" + randomUUID().replaceAll("-", "");
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    await db.query(`CREATE TABLE platform_alerts(id uuid PRIMARY KEY,user_id text,created_at timestamptz,updated_at timestamptz,state text,summary text,detail text,severity text);
        CREATE TABLE eassist_records(id uuid PRIMARY KEY,user_id text,kind text,data jsonb)`);
    const id = randomUUID();
    await db.query("INSERT INTO platform_alerts VALUES($1,'alice','2026-10-18T01:00:00Z','2026-10-18T01:00:00Z','active','API key','file-a','critical')", [id]);
    const payload = { labels: { platform_alert_id: id, account: createHash("sha256").update("alice").digest("hex").slice(0,24) } };
    await db.query("INSERT INTO eassist_records VALUES($1,'alice','alerts',$2)", [randomUUID(), JSON.stringify(payload)]);
    await db.query("INSERT INTO eassist_records VALUES($1,'alice','alerts','{\"labels\":{\"alertname\":\"External alert\"}}')", [randomUUID()]);
    await db.query(await readFile("db/migrations/0078_alert_occurrences.sql", "utf8"));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM eassist_records")).rows[0].n, 1, "Remove only proven project mirrors");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM platform_alert_occurrences")).rows[0].n, 1);
    await db.query("UPDATE platform_alerts SET updated_at='2026-10-18T02:00:00Z' WHERE id=$1", [id]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM platform_alert_occurrences")).rows[0].n, 1, "Polling must not inflate history");
    await db.query("UPDATE platform_alerts SET state='resolved',updated_at='2026-10-18T02:01:00Z' WHERE id=$1", [id]);
    await db.query("UPDATE platform_alerts SET state='active',updated_at='2026-10-18T03:00:00Z' WHERE id=$1", [id]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM platform_alert_occurrences")).rows[0].n, 2, "Record a genuine recurrence");
    assert.equal((await db.query("INSERT INTO eassist_records VALUES($1,'alice','alerts',$2) RETURNING id", [randomUUID(), JSON.stringify(payload)])).rowCount, 0);
    assert.equal((await db.query("INSERT INTO eassist_records VALUES($1,'bob','alerts',$2) RETURNING id", [randomUUID(), JSON.stringify(payload)])).rowCount, 1, "Do not remove another account's data");
    await db.query("DELETE FROM platform_alerts WHERE id=$1", [id]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM platform_alert_occurrences")).rows[0].n, 0, "History follows alert retention");
    console.log("PASS alert grouping, account/source isolation, unresolved state, duplicate timestamps, compact recurrence history, and mirror suppression.");
} finally {
    await db.query("ROLLBACK").catch(() => {});
    await db.end();
}
