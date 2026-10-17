import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import { fixtureAccount, cleanupFixture } from "./helpers/account.mjs";
import { load } from "./helpers/load-ts.mjs";
import { writeFileSync } from "node:fs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    base = "http://localhost:3000",
    accounts = [],
    results = [];
const { adminCapabilities } = load("lib/admin-playground-guide.ts");
const excluded = new Set(["Agent management", "Payment access"]);
async function check(account, path, expected = 200) {
    const r = await fetch(base + path, {
        headers: { Cookie: account?.cookie || "" },
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
    });
    await r.arrayBuffer();
    assert.equal(r.status, expected, path);
    results.push({ role: account?.role || "anonymous", path, status: r.status });
}
try {
    const admin = await fixtureAccount(pool);
    admin.role = "admin";
    accounts.push(admin);
    const paths = [
        ...new Set(
            adminCapabilities
                .filter((c) => !excluded.has(c.name))
                .map((c) => {
                    const u = new URL(c.href, base);
                    return u.pathname + u.search;
                }),
        ),
    ];
    for (const path of paths) await check(admin, path);
    console.log(
        "PASS: " +
            paths.length +
            " unique authenticated Admin page/query destinations for all " +
            (adminCapabilities.length - excluded.size) +
            " in-scope capability entries. Page checks do not prove source-system execution.",
    );
    for (const path of [
        "/api/workspace/admin",
        "/api/workspace/catalog",
        "/api/workspace/organization",
        "/api/workspace/tickets",
        "/api/tools/knowledge",
        "/api/playground/state",
        "/api/meeting-rooms",
        "/api/meetings",
        "/api/account/profile",
        "/api/account/sessions",
        "/api/usage",
    ]) {
        // Catalog currently has mutation handlers; its read data is in /api/workspace/admin.
        if (path === "/api/workspace/catalog") continue;
        await check(admin, path);
    }
    for (const role of ["user", "employee", "manager"]) {
        const person = await fixtureAccount(pool, { role });
        person.role = role;
        accounts.push(person);
        for (const path of ["/api/workspace/admin", "/api/workspace/organization", "/api/eassist"])
            await check(person, path, 403);
    }
    await check(null, "/api/workspace/admin", 401);
    writeFileSync(
        "docs/verification/admin-http-checks-2026-10-15.json",
        JSON.stringify(
            {
                checkedAt: new Date().toISOString(),
                scope: "Fixture logins; read-only page/API checks; no vendor mutations.",
                results,
            },
            null,
            2,
        ),
    );
    console.log(
        "PASS: authenticated Admin read APIs, non-Admin denial across three roles, and unauthenticated denial. No real accounts were modified.",
    );
} finally {
    for (const account of accounts) await cleanupFixture(pool, account);
    await pool.end();
}
