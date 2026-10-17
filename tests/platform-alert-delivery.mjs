import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
globalThis.__opsTestDb = pool;
globalThis.__opsTestCalls = [];
globalThis.__opsTestFailure = false;
globalThis.__opsTestWrites = true;
const stub =
    "export const db=globalThis.__opsTestDb;export async function remote(c,path,method,body){globalThis.__opsTestCalls.push({path,method,body});if(globalThis.__opsTestFailure)throw new Error('Simulated outage');return null;}export async function securityPolicy(){return {allow_writes:globalThis.__opsTestWrites};}export class InputError extends Error{}";
const moduleURL = "data:text/javascript;base64," + Buffer.from(stub).toString("base64");
let source = await readFile("lib/eassist/platform.ts", "utf8");
source = source
    .replace(/from "@\/lib\/db"/g, `from "${moduleURL}"`)
    .replace(/from "\.\/transport"/g, `from "${moduleURL}"`)
    .replace(/from "\.\/security"/g, `from "${moduleURL}"`);
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
    },
}).outputText;
const { relayPlatformAlerts } = await import(
    "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const userId = "delivery-verification-" + randomUUID(),
    connectionId = randomUUID(),
    alertId = randomUUID();
try {
    await pool.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',
        [userId, "Disposable delivery verification", userId + "@example.invalid"],
    );
    await pool.query(
        "INSERT INTO eassist_connections(id,user_id,name,kind,base_url) VALUES($1,$2,'Verification receiver','alertmanager','https://example.invalid')",
        [connectionId, userId],
    );
    await pool.query(
        "INSERT INTO platform_alerts(id,user_id,source,event_key,summary,detail) VALUES($1,$2,'reactflow','verification','Agent execution failed','Inspect the source agent.')",
        [alertId, userId],
    );
    globalThis.__opsTestFailure = true;
    await relayPlatformAlerts(userId);
    let row = (
        await pool.query("SELECT * FROM platform_alert_deliveries WHERE alert_id=$1", [alertId])
    ).rows[0];
    assert.equal(row.state, "error");
    assert.equal(row.attempts, 1);
    assert.ok(row.next_attempt > row.checked_at);
    assert.equal(row.lease_until, null);
    console.log("PASS delivery failures persist a retry deadline and release their lease");
    globalThis.__opsTestFailure = false;
    await pool.query("UPDATE platform_alert_deliveries SET next_attempt=now() WHERE alert_id=$1", [
        alertId,
    ]);
    await relayPlatformAlerts(userId);
    row = (await pool.query("SELECT * FROM platform_alert_deliveries WHERE alert_id=$1", [alertId]))
        .rows[0];
    assert.equal(row.state, "delivered");
    assert.equal(row.attempts, 2);
    let call = globalThis.__opsTestCalls.at(-1);
    assert.equal(call.method, "POST");
    assert.equal(call.path, "/api/v2/alerts");
    assert.equal(call.body[0].labels.platform_alert_id, alertId);
    assert.ok(!JSON.stringify(call.body).includes(userId));
    assert.ok(Date.parse(call.body[0].endsAt) > Date.now());
    console.log(
        "PASS retries use Alertmanager API with stable identity and an active refresh window",
    );
    const previous = globalThis.__opsTestCalls.length;
    await relayPlatformAlerts(userId);
    assert.equal(globalThis.__opsTestCalls.length, previous);
    console.log(
        "PASS repeated synchronization avoids duplicate delivery before the refresh deadline",
    );
    await pool.query("UPDATE platform_alert_deliveries SET next_attempt=now() WHERE alert_id=$1", [
        alertId,
    ]);
    const beforeConcurrent = globalThis.__opsTestCalls.length;
    await Promise.all([relayPlatformAlerts(userId), relayPlatformAlerts(userId)]);
    assert.equal(globalThis.__opsTestCalls.length, beforeConcurrent + 1);
    console.log("PASS concurrent collectors lease a delivery only once");
    await pool.query(
        "UPDATE platform_alerts SET state='acknowledged',updated_at=now() WHERE id=$1",
        [alertId],
    );
    await relayPlatformAlerts(userId);
    row = (await pool.query("SELECT * FROM platform_alert_deliveries WHERE alert_id=$1", [alertId]))
        .rows[0];
    assert.equal(row.state, "resolved");
    assert.ok(Date.parse(globalThis.__opsTestCalls.at(-1).body[0].endsAt) <= Date.now());
    console.log("PASS acknowledgement closes the forwarded alert with a final end time");
    globalThis.__opsTestWrites = false;
    await pool.query(
        "INSERT INTO platform_alerts(user_id,source,event_key,summary) VALUES($1,'epace','policy','Policy verification')",
        [userId],
    );
    const count = globalThis.__opsTestCalls.length;
    await relayPlatformAlerts(userId);
    assert.equal(globalThis.__opsTestCalls.length, count);
    console.log("PASS disabled write policy prevents forwarding");
} finally {
    await pool.query('DELETE FROM "user" WHERE id=$1', [userId]);
    await pool.end();
    delete globalThis.__opsTestDb;
    delete globalThis.__opsTestCalls;
    delete globalThis.__opsTestFailure;
    delete globalThis.__opsTestWrites;
    console.log("Disposable delivery records removed.");
}
