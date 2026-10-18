import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { load } from "./helpers/load-ts.mjs";

const originalToken = process.env.PROMETHEUS_METRICS_TOKEN;
process.env.PROMETHEUS_METRICS_TOKEN = "fixture-monitoring-token-" + "a".repeat(40);
let session = null, queries = 0, sessionChecks = 0;
const dependencies = {
    "@/lib/db": { db: { query: async () => {
        queries++;
        return { rows: [{ agents: 1, workflows: 1, projects: 0, published: 0, count: 0 }] };
    } } },
    "@/lib/request-session": { getRequestSession: async () => { sessionChecks++; return session; } },
    "@/lib/auth": { auth: { api: { getSession: async () => session } } },
    "@/lib/workspace-access": { workspaceAccess: async () => ({ active: true, role: session?.role || "user" }) },
    "@/lib/organization-security": { organizationGuard: async () => null },
    "@/lib/organization": { organizationEvent: async () => {} },
};
const { GET } = load("app/api/metrics/route.ts", dependencies);
const { proxy } = load("proxy.ts", dependencies);
const { validMetricsToken } = load("lib/metrics-auth.ts");
const request = (authorization, path = "/api/metrics", method = "GET") => new NextRequest(
    "https://fixture.test" + path,
    { method, headers: authorization ? { authorization } : {} },
);
const valid = "Bearer " + process.env.PROMETHEUS_METRICS_TOKEN;
try {
    for (const authorization of [undefined, "Bearer wrong", "Basic " + process.env.PROMETHEUS_METRICS_TOKEN]) {
        assert.equal((await GET(request(authorization))).status, 401);
        assert.equal((await proxy(request(authorization))).status, 401);
    }
    assert.equal(queries, 0, "Invalid credentials never reach operational queries");
    const before = sessionChecks;
    const response = await GET(request(valid));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /eassist_app_up 1/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(sessionChecks, before, "Token collection needs no browser session");
    assert.equal((await proxy(request(valid))).headers.get("x-middleware-next"), "1");
    assert.equal((await proxy(request(valid, "/api/workspace/admin"))).status, 401);
    assert.equal((await proxy(request(valid, "/api/metrics", "POST"))).status, 401);
    session = { user: { id: "fixture" }, role: "user" };
    assert.equal((await GET(request())).status, 403);
    session.role = "admin";
    assert.equal((await GET(request())).status, 200, "Existing signed-in Admin access remains");
    process.env.PROMETHEUS_METRICS_TOKEN = "short";
    assert.equal(validMetricsToken(request("Bearer short")), false);
    delete process.env.PROMETHEUS_METRICS_TOKEN;
    assert.equal(validMetricsToken(request(valid)), false);
    // Byte lengths, not JavaScript character counts, must govern timingSafeEqual.
    process.env.PROMETHEUS_METRICS_TOKEN = "a".repeat(32);
    assert.equal(validMetricsToken(request("Bearer " + "é".repeat(32))), false);
    console.log("PASS monitoring token, route and proxy checks, scope isolation, private responses, invalid configuration, Unicode safety, and Admin access.");
} finally {
    if (originalToken === undefined) delete process.env.PROMETHEUS_METRICS_TOKEN;
    else process.env.PROMETHEUS_METRICS_TOKEN = originalToken;
}
