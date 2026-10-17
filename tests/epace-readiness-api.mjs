import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
const base = process.env.EPACE_TEST_URL || "http://localhost:3000",
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
let uid,
    cookie,
    checks = 0;
const pass = (name) => {
    checks++;
    console.log("PASS " + name);
};
async function call(path, body, status = 200) {
    const r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Cookie: cookie || "", Origin: base, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(110000),
    });
    const data = await r.json();
    assert.equal(r.status, status, data.error);
    return data;
}
try {
    const signup = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Disposable readiness API verification",
            email: `epace-ready-${randomUUID()}@example.invalid`,
            password: randomUUID() + "A1!",
        }),
    });
    const user = await signup.json();
    assert.equal(signup.status, 200);
    uid = user.user.id;
    cookie = signup.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const { id } = await call("/api/epace", {
        action: "createProject",
        name: "Disposable readiness verification",
    });
    const saved = await call(`/api/epace?project=${id}`);
    const models = await call("/api/playground/models");
    const model = models.models.includes("gpt-4o-mini")
        ? "gpt-4o-mini"
        : models.models.find((m) => /^gpt-.*mini/.test(m));
    assert.ok(model);
    await call("/api/epace", {
        action: "settings",
        projectId: id,
        settings: { ...saved.project.settings, model },
    });
    const before = await call(`/api/epace/readiness?project=${id}`);
    assert.equal(before.checks.find((c) => c.id === "probe").state, "attention");
    assert.equal(before.checks.find((c) => c.id === "evidence").state, "attention");
    assert.equal(before.checks.find((c) => c.id === "provider").source, "Server configuration");
    assert.equal(before.checks.find((c) => c.id === "evidence").source, "PostgreSQL");
    pass("readiness distinguishes actual configuration from provider tests and stored knowledge");
    const tested = await call("/api/epace/readiness", { projectId: id });
    assert.equal(tested.readiness.checks.find((c) => c.id === "probe").state, "passed");
    assert.equal(tested.readiness.checks.find((c) => c.id === "probe").source, "OpenAI API");
    assert.equal(tested.readiness.checks.length, before.checks.length);
    assert.ok(Date.parse(tested.readiness.checkedAt) >= Date.parse(before.checkedAt));
    assert.equal(tested.readiness.checks.find((c) => c.id === "evidence").state, "attention");
    pass(
        "Test provider makes real requests and returns every refreshed check without inventing knowledge coverage",
    );
    await call("/api/epace", {
        action: "settings",
        projectId: id,
        settings: {
            ...saved.project.settings,
            model: "epace-deliberately-unavailable-verification-model",
        },
    });
    await call("/api/epace/readiness", { projectId: id }, 502);
    const failed = await call(`/api/epace/readiness?project=${id}`);
    assert.equal(failed.checks.find((c) => c.id === "probe").state, "attention");
    assert.match(failed.checks.find((c) => c.id === "probe").detail, /failed/);
    pass("real provider failure is recorded and shown as needing attention");
    await call("/api/epace", {
        action: "settings",
        projectId: id,
        settings: { ...saved.project.settings, model },
    });
    await pool.query("INSERT INTO epace_audit(id,user_id,project_id,action) VALUES($1,$2,$3,$4)", [
        randomUUID(),
        uid,
        id,
        `Provider access failed: ${model} / ${model}`,
    ]);
    const invalidated = await call(`/api/epace/readiness?project=${id}`);
    assert.equal(invalidated.checks.find((c) => c.id === "probe").state, "attention");
    pass(
        "a newer failed test supersedes an earlier successful result for the same selected models",
    );
    console.log(`Completed ${checks} readiness API verification checks.`);
} finally {
    if (uid) await pool.query('DELETE FROM "user" WHERE id=$1', [uid]);
    await pool.end();
    console.log("Disposable readiness account and fixtures removed.");
}
