import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run SQL migrations.");
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
const migrationsDirectory = join(process.cwd(), "db", "migrations");

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aiforce_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const names = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [8_470_220_001]);
      const applied = await client.query("SELECT 1 FROM aiforce_schema_migrations WHERE name = $1", [name]);
      if (applied.rowCount) {
        await client.query("COMMIT");
        console.log(`Already applied: ${name}`);
        continue;
      }

      await client.query(await readFile(join(migrationsDirectory, name), "utf8"));
      await client.query("INSERT INTO aiforce_schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
