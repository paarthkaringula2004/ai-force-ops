/** Shared connection settings for the website, live events, and maintenance scripts. */
export function postgresConnectionOptions(env = process.env) {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
    const url = new URL(env.DATABASE_URL);
    const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, "\n").trim();
    if (ca) {
        // pg parses SSL URL options after the config object. Remove these so they
        // cannot replace the trusted CA or weaken certificate verification.
        for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"])
            url.searchParams.delete(key);
        return {
            connectionString: url.toString(),
            ssl: { ca, rejectUnauthorized: true },
        };
    }
    if (url.hostname.endsWith(".aivencloud.com"))
        throw new Error("DATABASE_SSL_CA is required for certificate-verified Aiven connections.");
    return { connectionString: env.DATABASE_URL };
}

export function postgresPoolMax(env = process.env) {
    const max = Number(env.DATABASE_POOL_MAX || 4);
    if (!Number.isInteger(max) || max < 1 || max > 8)
        throw new Error("DATABASE_POOL_MAX must be an integer between 1 and 8.");
    return max;
}
