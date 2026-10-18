import { Pool } from "pg";
import { postgresConnectionOptions, postgresPoolMax } from "../config/postgres.mjs";

const globalForPostgres = globalThis as typeof globalThis & { aiforcePostgresPool?: Pool };

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to use the AIForce.Ops data layer.");
}

export const db =
    globalForPostgres.aiforcePostgresPool ??
    new Pool({
        ...postgresConnectionOptions(),
        max: postgresPoolMax(),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        application_name: "aiforce-ops",
    });

// pg removes a broken idle client automatically. Handle its background error so
// a database restart does not become an uncaught error or dump client details.
// The cached development pool must not gain another listener on each reload.
if (db.listenerCount("error") === 0) {
    db.on("error", (error: Error & { code?: string }) => {
        console.warn(
            `[database] Idle connection closed (${error.code || "connection_error"}); the pool will reconnect on the next request.`,
        );
    });
}

if (process.env.NODE_ENV !== "production") {
    globalForPostgres.aiforcePostgresPool = db;
}
