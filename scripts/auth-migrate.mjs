import "./load-env.mjs";
import pg from "pg";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins";

if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for authentication migrations.");
const pool = new pg.Pool({
    ...postgresConnectionOptions(),
    max: 2,
    connectionTimeoutMillis: 10000,
});
const lock = await pool.connect();
try {
    // Serialize authentication DDL across overlapping Render deploys.
    await lock.query("SELECT pg_advisory_lock($1)", [8470220000]);
    const migration = await getMigrations({
        database: pool,
        plugins: [emailOTP({ sendVerificationOTP: async () => {} })],
    });
    await migration.runMigrations();
    console.log("Authentication schema is ready using the installed Better Auth version.");
} finally {
    await lock.query("SELECT pg_advisory_unlock($1)", [8470220000]).catch(() => {});
    lock.release();
    await pool.end();
}
