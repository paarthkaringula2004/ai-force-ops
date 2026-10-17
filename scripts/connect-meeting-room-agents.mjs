import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
const m = { exports: {} };
new Function(
    "require",
    "module",
    "exports",
    ts.transpileModule(readFileSync("lib/agent-studio-presets.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
)(() => ({}), m, m.exports);
const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
    }),
    client = await pool.connect();
try {
    await client.query("BEGIN");
    const rows = (
        await client.query(
            "SELECT w.user_id,w.agent_id,w.graph FROM agent_workflows w JOIN agents a ON a.id=w.agent_id AND a.user_id=w.user_id WHERE a.name='MeetRoom' AND a.deleted_at IS NULL FOR UPDATE OF w",
        )
    ).rows;
    let count = 0;
    for (const row of rows) {
        const next = m.exports.ensureMeetingRoomTool(row.graph);
        if (next === row.graph) continue;
        await client.query(
            "INSERT INTO agent_studio_backups(id,user_id,agent_id,graph) VALUES($1,$2,$3,$4)",
            [randomUUID(), row.user_id, row.agent_id, JSON.stringify(row.graph)],
        );
        await client.query(
            "UPDATE agent_workflows SET graph=$3,updated_at=now() WHERE user_id=$1 AND agent_id=$2",
            [row.user_id, row.agent_id, JSON.stringify(next)],
        );
        count++;
    }
    await client.query("COMMIT");
    console.log(
        `Connected current room availability to ${count} MeetRoom workflow(s). Existing definitions backed up; shared snapshots preserved.`,
    );
} catch (e) {
    await client.query("ROLLBACK");
    throw e;
} finally {
    client.release();
    await pool.end();
}
