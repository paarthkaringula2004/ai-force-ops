// Integration tests use two temporary PostgreSQL accounts and a local source fixture.
// They never contact an operator's configured integrations or alter their policies.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
    resolve(specifier, context, next) {
        let candidate;
        if (specifier.startsWith("@/")) candidate = resolve(root, specifier.slice(2));
        else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts"))
            candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
        if (candidate) {
            if (!extname(candidate) && existsSync(`${candidate}.ts`)) candidate += ".ts";
            if (existsSync(candidate))
                return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
        return next(specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith(".ts"))
            return {
                format: "module",
                source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
                    compilerOptions: {
                        target: ts.ScriptTarget.ES2022,
                        module: ts.ModuleKind.ESNext,
                    },
                }).outputText,
                shortCircuit: true,
            };
        return next(url, context);
    },
});

const { db } = await import("../lib/db.ts");
const { admitProviderRequest, runtimePolicy, boundedBody } =
    await import("../lib/epace/runtime.ts");
const { maintainEpace } = await import("../lib/epace/maintenance.ts");
const { defaultSettings } = await import("../lib/epace/types.ts");
const users = [`epace-production-${randomUUID()}`, `epace-production-${randomUUID()}`];
let checks = 0;
const pass = (name) => {
    checks++;
    console.log("PASS " + name);
};
try {
    process.env.EPACE_REQUESTS_PER_MINUTE = "2";
    process.env.EPACE_REQUESTS_PER_DAY = "200";
    process.env.EPACE_DAILY_TOKEN_LIMIT = "1000";
    process.env.EPACE_REQUIRE_SAFETY = "invalid";
    assert.throws(() => runtimePolicy(), /must be true or false/);
    process.env.EPACE_REQUIRE_SAFETY = "true";
    process.env.EPACE_BLOCK_FLAGGED = "true";
    process.env.EPACE_REQUESTS_PER_DAY = "NaN";
    assert.throws(() => runtimePolicy(), /Invalid server configuration/);
    process.env.EPACE_REQUESTS_PER_DAY = "200";
    pass("invalid operator policies fail closed");
    const request = new Request("http://fixture", {
        method: "POST",
        duplex: "half",
        body: new ReadableStream({
            start(c) {
                c.enqueue(new Uint8Array(5));
                c.enqueue(new Uint8Array(6));
                c.close();
            },
        }),
    });
    await assert.rejects(
        () => boundedBody(request, 10),
        (e) => e.status === 413,
    );
    pass("streamed size limit works across multiple body chunks");
    for (const id of users)
        await db.query(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',
            [id, "Disposable ePACE production test", `${id}@example.invalid`],
        );
    const concurrency = await Promise.allSettled(
        Array.from({ length: 3 }, () => admitProviderRequest(users[0])),
    );
    assert.equal(concurrency.filter((r) => r.status === "fulfilled").length, 2);
    assert.equal(
        concurrency.filter((r) => r.status === "rejected" && r.reason.status === 429).length,
        1,
    );
    const counters = (
        await db.query(
            "SELECT window_kind,requests FROM epace_request_limits WHERE user_id=$1 ORDER BY window_kind",
            [users[0]],
        )
    ).rows;
    assert.deepEqual(counters, [
        { window_kind: "day", requests: 2 },
        { window_kind: "minute", requests: 2 },
    ]);
    await admitProviderRequest(users[1]);
    pass("concurrent admission is atomic and different accounts retain their own allowance");
    await db.query(
        `INSERT INTO usage_events(id,user_id,source,model_id,input_tokens,output_tokens,total_tokens) VALUES($1,$2,'epace','fixture',1000,0,1000)`,
        [randomUUID(), users[1]],
    );
    await assert.rejects(
        () => admitProviderRequest(users[1]),
        (e) => e.status === 429,
    );
    pass("daily recorded-token guard rejects further provider admission");
    const pid = randomUUID(),
        pid2 = randomUUID();
    await db.query(
        "INSERT INTO epace_projects(id,user_id,name,settings) VALUES($1,$2,$3,$4),($5,$6,$7,$8)",
        [
            pid,
            users[0],
            "Disposable one-day retention",
            { ...defaultSettings, retention: 1 },
            pid2,
            users[1],
            "Disposable thirty-day retention",
            defaultSettings,
        ],
    );
    const expired = randomUUID(),
        pending = randomUUID(),
        retained = randomUUID(),
        document = randomUUID();
    await db.query(
        `INSERT INTO epace_records(id,user_id,project_id,kind,data,created_at) VALUES
    ($1,$2,$3,'run','{"status":"success"}',now()-interval '2 days'),
    ($4,$2,$3,'run','{"status":"pending","output":"must be cleared"}',now()-interval '20 minutes'),
    ($5,$6,$7,'run','{"status":"success"}',now()-interval '2 days'),
    ($8,$2,$3,'document','{"name":"must remain"}',now()-interval '2 days')`,
        [expired, users[0], pid, pending, retained, users[1], pid2, document],
    );
    // Advance the maintenance schedule, then let the real authenticated worker or this maintenance invocation perform the due cleanup.
    await db.query(
        "UPDATE epace_maintenance_health SET checked_at=NULL,lease_until=NULL WHERE id=true",
    );
    await maintainEpace();
    let remaining;
    for (let i = 0; i < 10; i++) {
        remaining = (
            await db.query("SELECT id,data FROM epace_records WHERE id=ANY($1::uuid[])", [
                [expired, pending, retained, document],
            ])
        ).rows;
        if (!remaining.some((r) => r.id === expired)) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.ok(!remaining.some((r) => r.id === expired));
    assert.ok(remaining.some((r) => r.id === retained));
    assert.ok(remaining.some((r) => r.id === document));
    assert.equal(remaining.find((r) => r.id === pending).data.status, "error");
    assert.equal(remaining.find((r) => r.id === pending).data.output, "");
    pass(
        "unattended cleanup respects each project retention, preserves documents and clears abandoned output",
    );
    process.env.AUTH_DISABLE_SIGNUP = "true";
    const { auth } = await import("../lib/auth.ts");
    const origin = process.env.BETTER_AUTH_URL || "http://localhost:3000";
    const signup = await auth.handler(
        new Request(origin + "/api/auth/sign-up/email", {
            method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Forbidden registration",
                email: `closed-${randomUUID()}@example.invalid`,
                password: randomUUID() + "A1!",
            }),
        }),
    );
    assert.equal(signup.status, 400);
    const result = await signup.json();
    assert.equal(result.code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
    pass("closed public registration rejects actual authentication sign-up");
    console.log(`Completed ${checks} ePACE production-control checks.`);
} finally {
    await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
    await db.end();
    console.log("Disposable production-control fixtures removed.");
}
