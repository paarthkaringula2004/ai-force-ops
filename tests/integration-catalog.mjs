import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
    const m = { exports: {} };
    new Function(
        "require",
        "module",
        "exports",
        ts.transpileModule(readFileSync(path, "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                esModuleInterop: true,
                jsx: ts.JsxEmit.ReactJSX,
            },
        }).outputText,
    )((n) => (n in deps ? deps[n] : require(n)), m, m.exports);
    return m.exports;
}
const catalog = load("lib/integrations/catalog.ts");
let dynamicProvider = null;
const templates = load("lib/integrations/templates.ts");
class InputError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
const seal = (v) => Buffer.from(v).toString("base64"),
    unseal = (v) => Buffer.from(v, "base64").toString();
const transportDeps = { InputError, seal, unseal };
const ids = catalog.integrationCatalog.map((p) => p.id);
assert.equal(ids.length, new Set(ids).size);
assert.equal(ids.length, 23);
for (const p of catalog.integrationCatalog) {
    assert.ok(p.name && p.description);
    assert.equal(new Set(p.operations.map((o) => o.id)).size, p.operations.length);
    for (const operation of p.operations) {
        assert.ok(["GET", "POST", "PUT", "PATCH", "DELETE"].includes(operation.method));
        if (operation.method === "GET") assert.ok(!operation.write);
    }
}
for (const t of templates.demoAgentTemplates)
    for (const p of t.providers) assert.ok(ids.includes(p), `${t.name} has unknown provider ${p}`);
assert.equal(templates.demoAgentTemplates.length, 18);

let stored = null,
    savedArgs;
const storeDb = {
    query: async (sql, args) => {
        if (sql.startsWith("SELECT secret_cipher"))
            return { rows: stored ? [{ secret_cipher: stored.secret_cipher }] : [] };
        if (sql.startsWith("SELECT config")) return { rows: stored ? [stored] : [] };
        if (sql.startsWith("INSERT INTO integration_connections")) {
            savedArgs = args;
            stored = {
                config: JSON.parse(args[2]),
                secret_cipher: args[3],
                enabled: args[4],
                revision: (stored?.revision || 0) + 1,
            };
            return { rowCount: 1, rows: [] };
        }
        if (sql.includes("FROM eassist_connections"))
            return {
                rows: [
                    {
                        id: "11111111-1111-1111-1111-111111111111",
                        enabled: true,
                        base_url: "https://tenant.service-now.com",
                        username: "existing",
                        secret_cipher: seal("linked-secret"),
                        auth_type: "basic",
                        project_id: "1",
                    },
                ],
                rowCount: 1,
            };
        throw Error(`Unhandled store SQL ${sql}`);
    },
};
const store = load("lib/integrations/store.ts", {
    "../db": { db: storeDb },
    "../eassist/transport": transportDeps,
    "./registry": {
        resolveProvider: async (_user, id) =>
            dynamicProvider?.id === id ? dynamicProvider : catalog.providerById(id),
    },
    "./catalog": catalog,
});
assert.throws(() => store.parseMappings("not JSON"), /valid JSON/);
assert.throws(
    () => store.parseMappings('[{"id":"a","label":"A","method":"GET","path":"https://evil.test"}]'),
    /relative API path/,
);
assert.throws(
    () =>
        store.parseMappings(
            '[{"id":"a","label":"A","path":"/a"},{"id":"a","label":"B","path":"/b"}]',
        ),
    /unique/,
);
assert.equal(
    store.parseMappings('[{"id":"a","label":"A","method":"POST","path":"/a","write":false}]')[0]
        .write,
    true,
);
await assert.rejects(() => store.saveConnection("one", "unknown", {}), /Unknown/);
await assert.rejects(
    () =>
        store.saveConnection("one", "confluence", {
            config: { baseUrl: "http://x.test", username: "u", password: "p" },
        }),
    /HTTPS/,
);
await assert.rejects(
    () =>
        store.saveConnection("one", "confluence", {
            config: { baseUrl: "https://u:p@x.test", username: "u", password: "p" },
        }),
    /HTTPS/,
);
await store.saveConnection("one", "confluence", {
    enabled: true,
    config: {
        baseUrl: "https://tenant.atlassian.net",
        username: "u@example.com",
        password: "secret value ",
    },
});
assert.ok(!JSON.stringify(stored.config).includes("secret value"));
assert.equal(JSON.parse(unseal(stored.secret_cipher)).password, "secret value ");
await store.saveConnection("one", "confluence", {
    enabled: true,
    config: { baseUrl: "https://tenant.atlassian.net", username: "new@example.com", password: "" },
});
assert.equal(JSON.parse(unseal(stored.secret_cipher)).password, "secret value ");
assert.equal(savedArgs[0], "one");
await store.saveConnection("one", "armis", {
    enabled: true,
    config: {
        baseUrl: "https://tenant.example.com",
        token: "token",
        authHeader: "X-API-Key",
        authPrefix: "",
        mapping: '[{"id":"assets","label":"Assets","path":"/assets"}]',
    },
});
assert.equal(stored.config.authPrefix, "");
await assert.rejects(
    () =>
        store.saveConnection("one", "armis", {
            config: {
                baseUrl: "https://tenant.example.com",
                authHeader: "Host",
                mapping: '[{"id":"assets","label":"Assets","path":"/assets"}]',
            },
        }),
    /authentication header/,
);
await store.saveConnection("one", "servicenow", {
    enabled: true,
    config: { reuseId: "11111111-1111-1111-1111-111111111111" },
});
const reused = await store.loadConnection("one", "servicenow");
assert.equal(reused.config.username, "existing");
assert.equal(reused.secrets.password, "linked-secret");

const signing = load("lib/integrations/transport.ts", { "../eassist/transport": transportDeps });
for (const ip of [
    "127.0.0.1",
    "169.254.169.254",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
])
    assert.equal(signing.privateAddress(ip), true, ip);
assert.equal(signing.privateAddress("8.8.8.8"), false);
assert.equal(signing.privateAddress("2606:4700:4700::1111"), false);
const awsConnection = {
    config: { region: "ap-south-1" },
    secrets: {
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "fixture-secret",
        sessionToken: "temporary",
    },
    enabled: true,
    revision: 1,
};
const signed = signing.awsHeaders(
    new URL("https://lambda.ap-south-1.amazonaws.com/2015-03-31/functions/?MaxItems=50"),
    "GET",
    "",
    { "content-type": "application/json" },
    awsConnection,
    "lambda",
    "ap-south-1",
    new Date("2026-10-14T12:00:00Z"),
);
assert.equal(signed["x-amz-date"], "20261014T120000Z");
assert.equal(signed["x-amz-security-token"], "temporary");
assert.match(signed.authorization, /20261014\/ap-south-1\/lambda\/aws4_request/);
assert.match(signed.authorization, /Signature=[a-f0-9]{64}$/);
assert.ok(!signed.authorization.includes("fixture-secret"));
await assert.rejects(
    () => signing.authorizeDestination(new URL("https://127.0.0.1/")),
    /Private destinations/,
);
await assert.rejects(
    () => signing.authorizeDestination(new URL("https://localhost/")),
    /Private lab/,
);
await assert.rejects(() => signing.authorizeDestination(new URL("http://example.com/")), /HTTPS/);

let allowed = true,
    policy = { allow_runs: true, allow_writes: true, allow_deletes: false, max_concurrent: 3 };
let connection = {
    config: { baseUrl: "https://fixture.example.com", username: "operator" },
    secrets: { password: "never-in-results" },
    enabled: true,
    revision: 1,
};
let approval = null,
    calls = [],
    running = 0,
    upstreamFailure = false,
    fixtures = {};
const queries = [];
const db = {
    query: async (sql, args = []) => {
        queries.push({ sql, args });
        if (sql.startsWith("INSERT INTO integration_approvals")) {
            approval = {
                token_hash: args[0],
                user_id: args[1],
                provider: args[2],
                revision: args[3],
                connection_hash: args[4],
                operation: args[5],
                inputs_cipher: args[6],
                context: JSON.parse(args[7]),
                consumed_at: null,
            };
            return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith("SELECT * FROM integration_approvals"))
            return {
                rows:
                    approval &&
                    approval.user_id === args[0] &&
                    approval.token_hash === args[1] &&
                    !approval.consumed_at
                        ? [approval]
                        : [],
            };
        if (sql.startsWith("UPDATE integration_approvals SET consumed_at")) {
            if (!approval || approval.consumed_at) return { rowCount: 0, rows: [] };
            approval.consumed_at = true;
            return { rowCount: 1, rows: [{}] };
        }
        if (sql.includes("SELECT count(*)")) return { rows: [{ count: running }] };
        return { rowCount: 1, rows: [] };
    },
    connect: async () => ({ ...db, release() {} }),
};
const external = async (url, method, headers, body) => {
    calls.push({ url: String(url), method, headers: { ...headers }, body });
    if (upstreamFailure) throw new InputError("Fixture source timeout", 502);
    const f = Array.isArray(fixtures) ? fixtures.shift() : fixtures;
    return {
        response: new Response(null, {
            status: f.status || 200,
            headers: f.headers || { "content-type": "application/json" },
        }),
        content: f.content || '{"items":[]}',
    };
};
let mailReady = true,
    mailQueued = [];
const runtime = load("lib/integrations/runtime.ts", {
    "./access": {
        requireIntegrationAccess: async () => {
            if (!allowed) throw new InputError("Access denied", 403);
        },
    },
    "../db": { db },
    "../eassist/transport": transportDeps,
    "../eassist/security": { securityPolicy: async () => policy },
    "../workspace-access": { workspaceAccess: async () => ({ allowed }) },
    "../workspace-permissions": { permitted: (m) => m.allowed },
    "./registry": {
        resolveProvider: async (_user, id) =>
            dynamicProvider?.id === id ? dynamicProvider : catalog.providerById(id),
    },
    "./catalog": catalog,
    "./store": { ...store, loadConnection: async () => connection },
    "./transport": { ...signing, external, azureToken: async () => "azure-access-token" },
    "../mail": {
        mailConfigured: () => mailReady,
        validMailAddress: (v) => v.includes("@"),
        queueMail: async (...args) => {
            mailQueued.push(args);
            return "mail-id";
        },
    },
});
allowed = false;
await assert.rejects(
    () => runtime.integrationCapabilities("one", "lambda"),
    (e) => e.status === 403,
);
allowed = true;
const savedConnection = connection;
connection = null;
assert.equal((await runtime.integrationCapabilities("one", "lambda")).configured, false);
await assert.rejects(
    () => runtime.prepareIntegration("one", "lambda", "functions", {}),
    (e) => e.status === 409,
);
connection = savedConnection;
connection.enabled = false;
await assert.rejects(
    () => runtime.prepareIntegration("one", "servicenow", "incidents", {}),
    /not configured or enabled/,
);
connection.enabled = true;
policy.allow_runs = false;
await assert.rejects(
    () => runtime.prepareIntegration("one", "servicenow", "incidents", {}),
    /execution is disabled/,
);
policy.allow_runs = true;
const read = await runtime.prepareIntegration("one", "servicenow", "incidents", {});
assert.equal(read.status, "completed");
assert.match(calls.at(-1).url, /sysparm_limit=25/);
assert.ok(!JSON.stringify(read).includes("never-in-results"));
const count = calls.length;
const scope = { agentId: "agent-one", graphHash: "graph-one", nodeId: "node-one" };
const preview = await runtime.prepareIntegration(
    "one",
    "servicenow",
    "create",
    { body: { short_description: "Fixture incident" } },
    scope,
);
assert.equal(calls.length, count);
assert.equal(preview.status, "awaiting_approval");
assert.ok(preview.destination.baseUrl);
assert.ok(!JSON.stringify(preview).includes("never-in-results"));
await assert.rejects(() => runtime.approveIntegration("two", preview.token, scope), /expired/);
await assert.rejects(
    () => runtime.approveIntegration("one", preview.token, { ...scope, graphHash: "changed" }),
    /expired/,
);
policy.allow_writes = false;
await assert.rejects(
    () => runtime.approveIntegration("one", preview.token, scope),
    /changes are disabled/,
);
assert.equal(approval.consumed_at, null);
policy.allow_writes = true;
connection.revision = 2;
await assert.rejects(
    () => runtime.approveIntegration("one", preview.token, scope),
    /connection changed/,
);
connection.revision = 1;
connection.config.baseUrl = "https://changed.example.com";
await assert.rejects(
    () => runtime.approveIntegration("one", preview.token, scope),
    /connection changed/,
);
connection.config.baseUrl = "https://fixture.example.com";
await runtime.approveIntegration("one", preview.token, scope);
assert.equal(calls.length, count + 1);
assert.equal(calls.at(-1).method, "POST");
await assert.rejects(() => runtime.approveIntegration("one", preview.token, scope), /expired/);
running = 3;
await assert.rejects(
    () => runtime.prepareIntegration("one", "servicenow", "incidents", {}),
    /concurrency/,
);
running = 0;
const failedPreview = await runtime.prepareIntegration("one", "servicenow", "create", {
    body: { short_description: "Fixture timeout" },
});
upstreamFailure = true;
await assert.rejects(() => runtime.approveIntegration("one", failedPreview.token), /timeout/);
upstreamFailure = false;
await assert.rejects(() => runtime.approveIntegration("one", failedPreview.token), /expired/);
assert.ok(
    queries.some(
        (q) => q.sql.startsWith("UPDATE integration_executions") && q.args[1] === "unknown",
    ),
);
await assert.rejects(
    () => runtime.prepareIntegration("one", "servicenow", "incident", {}),
    /Provide sysId/,
);
assert.equal(runtime.fill("/items/{id}", { id: "a/b?x=1" }), "/items/a%2Fb%3Fx%3D1");
assert.throws(() => runtime.fill("/{id}", { id: ".." }), /Invalid/);
fixtures = {
    content:
        '<!DOCTYPE SCAN_LIST_OUTPUT SYSTEM "https://example.com/schema.dtd"><SCAN_LIST_OUTPUT><RESPONSE><SCAN_LIST/></RESPONSE></SCAN_LIST_OUTPUT>',
};
await runtime.prepareIntegration("one", "qualys", "scans", {});
fixtures = {
    content:
        "<SIMPLE_RETURN><RESPONSE><CODE>1905</CODE><TEXT>API unavailable</TEXT></RESPONSE></SIMPLE_RETURN>",
};
await assert.rejects(
    () => runtime.prepareIntegration("one", "qualys", "scans", {}),
    /Qualys returned an API error/,
);
fixtures = { content: "<!DOCTYPE html><html>Sign in</html>" };
await assert.rejects(
    () => runtime.prepareIntegration("one", "confluence", "pages", {}),
    /web page instead/,
);
fixtures = {
    content: "<html><script>bad()</script><style>hide</style><p>Visible content</p></html>",
};
const web = await runtime.prepareIntegration("one", "web", "page", { path: "docs/page" });
assert.equal(calls.at(-1).url, "https://fixture.example.com/docs/page");
assert.equal(web.result.text, "Visible content");
await assert.rejects(
    () => runtime.prepareIntegration("one", "web", "page", { path: "https://evil.example/" }),
    /relative page path/,
);
fixtures = {};
for (const provider of ["lambda", "connect", "ses", "cost", "ec2"]) {
    connection = { ...awsConnection, config: { ...awsConnection.config, instanceId: "instance" } };
    const p = catalog.providerById(provider),
        o = p.operations[0];
    await runtime.prepareIntegration("one", provider, o.id, o.example || {});
    assert.match(calls.at(-1).headers.authorization, /AWS4-HMAC-SHA256/);
}
for (const provider of ["entra", "azure_vm", "azure_automation"]) {
    connection = {
        config: {
            tenantId: "tenant",
            subscriptionId: "subscription",
            resourceGroup: "lab",
            automationAccount: "account",
        },
        secrets: { clientSecret: "secret" },
        enabled: true,
        revision: 1,
    };
    const o = catalog.providerById(provider).operations[0];
    await runtime.prepareIntegration("one", provider, o.id, {});
    assert.equal(calls.at(-1).headers.authorization, "Bearer azure-access-token");
}
for (const provider of ["armis", "systrack", "aci", "cisco_bugs", "soc", "nre", "iautomate"]) {
    connection = {
        config: {
            baseUrl: "https://fixture.example.com",
            mapping: '[{"id":"list","label":"List","path":"/assets"}]',
            authHeader: "X-API-Key",
            authPrefix: "",
        },
        secrets: { token: "raw-token" },
        enabled: true,
        revision: 1,
    };
    await runtime.prepareIntegration("one", provider, "list", {});
    assert.equal(calls.at(-1).headers["X-API-Key"], "raw-token");
}
connection = {
    config: { baseUrl: "https://mcp.example.com/mcp" },
    secrets: { token: "mcp-token" },
    enabled: true,
    revision: 1,
};
fixtures = [
    {
        headers: { "mcp-session-id": "session-one" },
        content: '{"result":{"protocolVersion":"2025-03-26"}}',
    },
    { status: 202, content: "" },
    { content: 'data: {"result":{"tools":[{"name":"read_vm"}]}}\n\n' },
    { status: 204, content: "" },
];
const mcp = await runtime.prepareIntegration("one", "azure_mcp", "tools", {});
assert.equal(mcp.result.tools[0].name, "read_vm");
assert.equal(calls.at(-2).headers["mcp-session-id"], "session-one");
assert.equal(calls.at(-1).method, "DELETE");
fixtures = {};
connection = { config: {}, secrets: {}, enabled: true, revision: 1 };
assert.equal(
    (await runtime.prepareIntegration("one", "dnr_mail", "status", {})).result.configured,
    true,
);
const mail = await runtime.prepareIntegration("one", "dnr_mail", "send", {
    to: "recipient@example.com",
    subject: "Fixture",
    text: "Fixture text",
});
assert.equal(mailQueued.length, 0);
await runtime.approveIntegration("one", mail.token);
assert.equal(mailQueued.length, 1);
assert.equal(mailQueued[0][0], "notification");
mailReady = false;
const noMail = await runtime.prepareIntegration("one", "dnr_mail", "send", {
    to: "recipient@example.com",
    subject: "Fixture",
    text: "Fixture text",
});
await assert.rejects(() => runtime.approveIntegration("one", noMail.token), /Configure.*email/);
assert.equal(mailQueued.length, 1);
dynamicProvider = {
    id: "custom_oauth",
    name: "OAuth fixture",
    auth: "oauth2",
    custom: true,
    operations: [],
};
connection = {
    config: {
        baseUrl: "https://api.example.com",
        tokenUrl: "https://identity.example.com/token",
        clientId: "client",
        scope: "assets.read",
        mapping: '[{"id":"assets","label":"Assets","path":"/assets"}]',
    },
    secrets: { clientSecret: "oauth-fixture-secret" },
    enabled: true,
    revision: 1,
};
fixtures = [{ content: '{"access_token":"oauth-fixture-token"}' }, { content: '{"assets":[]}' }];
const oauth = await runtime.prepareIntegration("one", "custom_oauth", "assets", {});
assert.equal(calls.at(-1).headers.authorization, "Bearer oauth-fixture-token");
assert.ok(calls.at(-2).body.includes("grant_type=client_credentials"));
assert.ok(!JSON.stringify(oauth).includes("oauth-fixture-secret"));
assert.ok(!JSON.stringify(oauth).includes("oauth-fixture-token"));
fixtures = {};
dynamicProvider = {
    id: "custom_form",
    name: "Form fixture",
    auth: "none",
    custom: true,
    operations: [],
};
connection = {
    config: {
        baseUrl: "https://api.example.com",
        mapping:
            '[{"id":"submit","label":"Submit","method":"POST","path":"/submit","contentType":"application/x-www-form-urlencoded"}]',
    },
    secrets: {},
    enabled: true,
    revision: 1,
};
const formPreview = await runtime.prepareIntegration("one", "custom_form", "submit", {
    body: { name: "One Two", count: 2 },
});
await runtime.approveIntegration("one", formPreview.token);
assert.equal(calls.at(-1).body, "name=One+Two&count=2");
connection.config.mapping =
    '[{"id":"submit","label":"Submit XML","method":"POST","path":"/submit","contentType":"application/xml"}]';
connection.revision++;
const xmlPreview = await runtime.prepareIntegration("one", "custom_form", "submit", {
    rawBody: "<Asset>fixture</Asset>",
});
await runtime.approveIntegration("one", xmlPreview.token);
assert.equal(calls.at(-1).body, "<Asset>fixture</Asset>");
dynamicProvider = { ...catalog.providerById("lambda"), id: "custom_lambda", adapter: "lambda" };
connection = awsConnection;
await runtime.prepareIntegration("one", "custom_lambda", "functions", {});
assert.match(calls.at(-1).url, /lambda.ap-south-1.amazonaws.com/);
assert.match(calls.at(-1).headers.authorization, /lambda\/aws4_request/);
dynamicProvider = null;
console.log(
    `PASS: ${ids.length} provider definitions, ${templates.demoAgentTemplates.length} templates; encrypted secret persistence/reuse, mapped contracts, AWS signing, private-destination rejection, Admin policy, disconnected/disabled states, approval ownership/scope/revision/fingerprint/replay, concurrency, no automatic write retry, XML/API errors, scraper isolation, and AWS/Azure/custom request construction. Isolated fixtures; no vendor accounts contacted.`,
);
