import assert from "node:assert/strict";
import { postgresConnectionOptions, postgresPoolMax } from "../config/postgres.mjs";

const url = "postgres://test:fake@database.example.test:5432/app?sslmode=require&options=-c%20search_path%3Dtesting";
const config = postgresConnectionOptions({ DATABASE_URL: url, DATABASE_SSL_CA: "line1\\nline2" });
assert.equal(config.ssl.ca, "line1\nline2");
assert.equal(config.ssl.rejectUnauthorized, true);
assert.equal(new URL(config.connectionString).searchParams.has("sslmode"), false);
assert.equal(new URL(config.connectionString).searchParams.get("options"), "-c search_path=testing");
assert.equal(postgresConnectionOptions({ DATABASE_URL: url }).connectionString, url);
assert.equal(postgresConnectionOptions({ DATABASE_URL: url, DATABASE_SSL_CA: "line1\nline2" }).ssl.ca, "line1\nline2");
for (const parameter of ["sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
    const configured = postgresConnectionOptions({ DATABASE_URL: url + "&" + parameter + "=ignored", DATABASE_SSL_CA: "trusted-ca" });
    assert.equal(new URL(configured.connectionString).searchParams.has(parameter), false);
    assert.equal(configured.ssl.rejectUnauthorized, true);
}
assert.throws(() => postgresConnectionOptions({}), /DATABASE_URL/);
assert.throws(() => postgresConnectionOptions({ DATABASE_URL: "postgres://test:fake@db.aivencloud.com/app?sslmode=disable" }), /DATABASE_SSL_CA/);
assert.equal(postgresPoolMax({}), 4);
assert.equal(postgresPoolMax({ DATABASE_POOL_MAX: "2" }), 2);
for (const invalid of ["0", "-1", "1.5", "9", "invalid"])
    assert.throws(() => postgresPoolMax({ DATABASE_POOL_MAX: invalid }), /DATABASE_POOL_MAX/);
console.log("PASS PostgreSQL TLS verification, SSL option precedence, missing-CA checks, and pool limits.");
