import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, deps) {
    const m = { exports: {} };
    new Function(
        "require",
        "module",
        "exports",
        ts.transpileModule(readFileSync(path, "utf8"), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
    )((n) => (n in deps ? deps[n] : require(n)), m, m.exports);
    return m.exports;
}
let session = null,
    role = "admin";
const actors = [];
const deps = {
    "@/lib/request-session": { getRequestSession: async () => session },
    "@/lib/workspace-access": {
        workspaceAccess: async (id) => {
            actors.push(id);
            return { role };
        },
    },
    "@/lib/workspace-permissions": { permitted: (m) => m.role === "admin" },
    "@/lib/builtin-project-tool-settings": {
        builtinTools: async (id) => {
            actors.push(id);
            return [
                {
                    id: "profile",
                    name: "Profile",
                    purpose: "Own profile",
                    capabilityPurpose: "Own data only",
                    enabled: true,
                },
                {
                    id: "scan_reports",
                    name: "Scan reports",
                    purpose: "Recorded findings",
                    enabled: false,
                },
            ];
        },
    },
    "@/lib/integrations/registry": {
        listProviders: async (id) => {
            actors.push(id);
            return [
                { id: "ready", name: "Ready API", description: "Read records" },
                { id: "empty", name: "Unconfigured API", description: "Needs setup" },
                { id: "broken-link", name: "Removed reused account", description: "Needs relink" },
            ];
        },
    },
    "@/lib/integrations/project-tools": {
        providerOperations: async () => [
            { id: "ready", operations: [{ id: "read", label: "Read records", write: false }] },
            { id: "broken-link", operations: [{ id: "read", label: "Read", write: false }] },
        ],
        projectBindings: async () => [
            {
                id: "binding",
                name: "Bound tool",
                provider: "empty",
                operation: "read",
                purpose: "Waiting for connection",
            },
        ],
    },
    "@/lib/db": {
        db: {
            query: async (sql) => {
                assert.ok(!sql.includes("secret_cipher")); // Knowledge never requests encrypted credentials.
                if (sql.includes("FROM integration_connections"))
                    return {
                        rows: [
                            {
                                provider: "ready",
                                enabled: true,
                                check_state: "passed",
                                checked_at: "2026-10-15T01:00:00Z",
                            },
                            { provider: "broken-link", enabled: true, reuse_id: "deleted-account" },
                        ],
                    };
                if (sql.includes("FROM eassist_connections")) return { rows: [] };
                throw Error("Unexpected query");
            },
        },
    },
};
const knowledge = load("lib/tool-knowledge.ts", deps);
const route = load("app/api/tools/knowledge/route.ts", {
    ...deps,
    "@/lib/tool-knowledge": knowledge,
});
const request = new Request("http://localhost:3000/api/tools/knowledge");
assert.equal((await route.GET(request)).status, 401);
session = { user: { id: "owner" } };
let response = await route.GET(request);
assert.equal(response.headers.get("cache-control"), "no-store");
let data = await response.json();
assert.equal(data.items.length, 6);
assert.equal(data.items.find((t) => t.id === "integration:ready").configured, true);
for (const id of [
    "scan_reports",
    "integration:empty",
    "integration:broken-link",
    "project:binding",
]) {
    const item = data.items.find((t) => t.id === id);
    assert.equal(item.knowledge, null);
    assert.match(item.status, /NULL/);
}
assert.ok(actors.every((id) => id === "owner"));
assert.ok(!JSON.stringify(data).includes("deleted-account"));
role = "employee";
data = await (await route.GET(request)).json();
assert.deepEqual(
    data.items.map((t) => t.id),
    ["profile"],
);
console.log(
    "PASS: tool knowledge is owner-scoped, role-filtered, no-store, credential-free and explicitly NULL for disabled, unconfigured and disconnected bindings. No source API calls.",
);
