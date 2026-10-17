import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { load } from "./helpers/load-ts.mjs";
class OrganizationPolicyError extends Error {
    status = 403;
}
const policy = {
    OrganizationPolicyError,
    organizationWriteAllowed: async () => {
        throw new OrganizationPolicyError(
            "Changes are disabled by the organization security policy.",
        );
    },
};
const writes = [],
    client = {
        query: async (sql) => {
            writes.push(sql);
            if (!["BEGIN", "ROLLBACK"].includes(sql) && !sql.includes("pg_advisory_xact_lock"))
                throw new Error("Disabled policy reached business SQL: " + sql);
            return { rows: [] };
        },
        release() {},
    };
const deps = {
    "./db": { db: { connect: async () => client, query: async (sql) => client.query(sql) } },
    "./organization-security": policy,
    "@/lib/organization-security": policy,
    "@/lib/db": { db: { connect: async () => client } },
    "@/lib/request-session": { getRequestSession: async () => ({ user: { id: "fixture" } }) },
    "@/lib/workspace-access": { workspaceAccess: async () => ({ role: "admin", active: true }) },
};
for (const [file, name, args] of [
    [
        "lib/staff-catalog.ts",
        "createCatalogEntry",
        [{ kind: "department", name: "Must not exist" }],
    ],
    ["lib/staff-catalog.ts", "deleteDepartment", [{ code: 1, confirmation: "Must remain" }]],
    [
        "lib/workspace-member-deletion.ts",
        "deleteMemberInTransaction",
        [
            {
                userId: "target",
                confirmation: "target@example.invalid",
                updatedAt: "2026-10-15T00:00:00Z",
            },
        ],
    ],
])
    await assert.rejects(
        () => load(file, deps)[name](client, "fixture", ...args),
        (e) => e.status === 403,
    );
for (const [file, body] of [
    ["app/api/workspace/employment/route.ts", { userId: "target", confirm: true }],
    [
        "app/api/workspace/tickets/route.ts",
        { userId: "target", amount: 1, requestId: randomUUID() },
    ],
]) {
    const r = await load(file, deps).POST(
        new Request("http://localhost:3000/api/workspace/test", {
            method: "POST",
            headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
    assert.equal(r.status, 403);
    assert.match((await r.json()).error, /Changes are disabled/);
}
assert.equal(
    writes.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)),
    false,
);
console.log(
    "PASS disabled organization policy blocks catalog create/delete, account deletion, employment confirmation and top-up at the mutation boundary without business writes.",
);
