import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import pg from "pg";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import { load } from "./helpers/load-ts.mjs";

// Temporary tables shadow the real names on this dedicated connection.
// No application accounts, reports, or credentials are changed by these tests.
const client = new pg.Client(postgresConnectionOptions());
await client.connect();
const originalInterval = process.env.SECURITY_SCAN_INTERVAL_SECONDS;
const storage = load("lib/vulnerabilities/storage.ts", {
    "@/lib/db": { db: { connect: async () => ({
        query: client.query.bind(client), release() {},
    }) } },
});
try {
    delete process.env.SECURITY_SCAN_INTERVAL_SECONDS;
    assert.equal(storage.continuousScanSeconds(), 300);
    for (const value of ["0", "30", "NaN", "600.5", "86401"]) {
        process.env.SECURITY_SCAN_INTERVAL_SECONDS = value;
        assert.equal(storage.continuousScanSeconds(), 300);
    }
    process.env.SECURITY_SCAN_INTERVAL_SECONDS = "600";
    assert.equal(storage.continuousScanSeconds(), 600);

    await client.query(`CREATE TEMP TABLE security_scan_jobs (
        id integer PRIMARY KEY, user_id text, target text, status text,
        completed_at timestamptz, created_at timestamptz DEFAULT now(), import_id integer
    )`);
    await client.query(`CREATE TEMP TABLE service_review_records (
        id integer PRIMARY KEY, source_connection_id text, is_current boolean,
        observed_at timestamptz, record_type text DEFAULT 'metric', record_key text DEFAULT 'reading'
    )`);
    await client.query(`CREATE TEMP TABLE vulnerability_imports (
        id integer PRIMARY KEY, sheet text, filename text, status text, created_at timestamptz
    )`);
    await client.query("CREATE TEMP TABLE vulnerability_findings (import_id integer)");
    await client.query("CREATE TEMP TABLE vulnerability_revisions (import_id integer)");
    await client.query(`INSERT INTO security_scan_jobs
        SELECT n,'a','site-a','completed',now()-make_interval(mins=>n),now()
        FROM generate_series(1,110) n`);
    await client.query(`INSERT INTO security_scan_jobs(id,user_id,target,status,completed_at,created_at) VALUES
        (201,'a','site-a','failed',now()-interval '45 days',now()),
        (202,'a','site-a','failed',now()-interval '46 days',now()),
        (203,'b','site-a','completed',now()-interval '50 days',now()),
        (204,'a','site-b','completed',now()-interval '50 days',now()),
        (205,'a','site-a','running',NULL,now()-interval '50 days'),
        (206,'a','site-a','queued',NULL,now()-interval '50 days')`);
    await client.query(`INSERT INTO service_review_records(id,source_connection_id,is_current,observed_at) VALUES
        (1,'source',false,now()-interval '31 days'),
        (2,'source',true,now()-interval '31 days'),
        (3,NULL,false,now()-interval '31 days'),
        (4,'source',false,now()-interval '1 day')`);
    await client.query(`INSERT INTO vulnerability_imports
        SELECT n,'Automated','security-fixture.csv','saved',now()-interval '40 days'
        FROM generate_series(1,6) n`);
    await client.query("UPDATE security_scan_jobs SET import_id=2 WHERE id=1");
    await client.query("INSERT INTO vulnerability_findings VALUES(3)");
    await client.query("INSERT INTO vulnerability_revisions VALUES(4)");
    await client.query("UPDATE vulnerability_imports SET sheet='Uploaded' WHERE id=5");
    await client.query("UPDATE vulnerability_imports SET created_at=now() WHERE id=6");
    assert.deepEqual(await storage.maintainScanStorage(true), { scans: 11, readings: 1, imports: 1 });
    assert.deepEqual((await client.query("SELECT id FROM vulnerability_imports ORDER BY id")).rows.map(r=>r.id), [2,3,4,5,6]);
    const ids = (await client.query("SELECT id FROM security_scan_jobs ORDER BY id")).rows.map(r => r.id);
    assert.equal(ids.length, 105);
    for (const id of [1, 100, 201, 203, 204, 205, 206]) assert.ok(ids.includes(id));
    for (const id of [101, 110, 202]) assert.ok(!ids.includes(id));
    assert.deepEqual((await client.query("SELECT id FROM service_review_records ORDER BY id")).rows.map(r => r.id), [2, 3, 4]);
    assert.equal(await storage.maintainScanStorage(), undefined, "Repeated claims skip hourly cleanup");
    assert.deepEqual(await storage.maintainScanStorage(true), { scans: 0, readings: 0, imports: 0 });
    await client.query(`INSERT INTO service_review_records(id,source_connection_id,is_current,observed_at)
        SELECT n+100,'busy-source',false,now()-make_interval(secs=>n)
        FROM generate_series(1,1441) n`);
    assert.deepEqual(await storage.maintainScanStorage(true), { scans: 0, readings: 1, imports: 0 });
    assert.equal((await client.query("SELECT count(*)::int AS n FROM service_review_records WHERE source_connection_id='busy-source'")).rows[0].n, 1440);
    console.log("PASS scan interval, bounded history, account/target isolation, active jobs, current readings, external records, and maintenance throttle.");
} finally {
    if (originalInterval === undefined) delete process.env.SECURITY_SCAN_INTERVAL_SECONDS;
    else process.env.SECURITY_SCAN_INTERVAL_SECONDS = originalInterval;
    await client.end();
}
