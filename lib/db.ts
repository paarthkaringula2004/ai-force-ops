import { Pool } from "pg";

const globalForPostgres = globalThis as typeof globalThis & { aiforcePostgresPool?: Pool };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to use the AIForce.Ops data layer.");
}

export const db = globalForPostgres.aiforcePostgresPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: "aiforce-ops",
});

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.aiforcePostgresPool = db;
}
