import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import pg from "pg";
import * as marked from "marked";

const require = createRequire(import.meta.url),
    cache = new Map(),
    overrides = new Map();
function load(path) {
    const full = resolve(path);
    if (overrides.has(full)) return overrides.get(full);
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {} };
    cache.set(full, module);
    const code = ts.transpileModule(readFileSync(full, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
        },
    }).outputText;
    new Function("require", "module", "exports", code)(
        (name) => {
            if (name === "server-only") return {};
            if (name === "marked") return marked;
            if (name.startsWith(".") || name.startsWith("@/")) {
                let local = name.startsWith("@/")
                    ? resolve(name.slice(2))
                    : resolve(dirname(full), name);
                if (!existsSync(local)) local += ".ts";
                return load(local);
            }
            return require(name);
        },
        module,
        module.exports,
    );
    return module.exports;
}

process.env.MAIL_ENCRYPTION_KEY ||= "ab".repeat(32);
process.env.SMTP_USER ||= "fixture@example.invalid";
process.env.SMTP_PASS ||= "fixture";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    connection = await pool.connect(),
    actorId = randomUUID();
const client = {
    query: (sql, args) =>
        /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)
            ? Promise.resolve({ rows: [] })
            : connection.query(sql, args),
    release() {},
};
const db = { query: (sql, args) => connection.query(sql, args), connect: async () => client };
overrides.set(resolve("lib/db.ts"), { db });
overrides.set(resolve("lib/request-session.ts"), {
    getRequestSession: async () => ({
        user: { id: actorId, name: "Fixture Admin", email: actorId + "@example.invalid" },
    }),
});
overrides.set(resolve("lib/workspace-access.ts"), {
    workspaceAccess: async () => ({
        user_id: actorId,
        role: "admin",
        active: true,
        permissions: [],
    }),
});
overrides.set(resolve("lib/service-review/ingestion.ts"), {
    requireSameOrigin: (request) => {
        if (request.headers.get("origin") !== "http://localhost:3000") throw new Error("Origin");
    },
});
const uploads = load("app/api/workspace/admin/mail/attachments/route.ts"),
    api = load("app/api/workspace/admin/mail/customization/route.ts"),
    store = load("lib/organization-document-store.ts"),
    files = load("lib/organization-mail-attachments.ts"),
    docs = load("lib/organization-documents.ts");
try {
    await connection.query("BEGIN");
    await connection.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [actorId, "Attachment Fixture", actorId + "@example.invalid"],
    );
    await connection.query(
        "UPDATE workspace_members SET role='admin',active=true WHERE user_id=$1",
        [actorId],
    );
    const ids = [];
    for (let index = 0; index < 6; index++) {
        const content = "x".repeat((index === 0 ? 8 : 1) * 1024 * 1024),
            form = new FormData();
        form.set("documentType", "offer");
        form.set(
            "file",
            new File([content], index === 0 ? "large-admin-file.bin" : "guide-" + index + ".txt"),
        );
        const response = await uploads.POST(
            new Request("http://localhost:3000/api/workspace/admin/mail/attachments", {
                method: "POST",
                headers: { origin: "http://localhost:3000" },
                body: form,
            }),
        );
        assert.equal(response.status, 200, await response.clone().text());
        ids.push((await response.json()).attachment.id);
    }
    const existing = await store.readDocumentTemplate(client, "offer"),
        definition = docs.documentDefinition("offer");
    const response = await api.PUT(
        new Request("http://localhost:3000/api/workspace/admin/mail/customization", {
            method: "PUT",
            headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
            body: JSON.stringify({
                documentType: "offer",
                markdown: definition.markdown,
                subject: definition.subject,
                revision: existing?.revision ?? 0,
                attachmentIds: ids,
            }),
        }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    const saved = (await response.json()).template;
    assert.equal(saved.attachments.length, 6);
    assert.equal(
        saved.attachments.reduce((sum, file) => sum + file.size, 0),
        13 * 1024 * 1024,
    );
    const loaded = await files.loadDocumentAttachments(client, "offer", ids, actorId);
    assert.equal(loaded.length, 6);
    assert.equal(Buffer.from(loaded[0].content, "base64").length, 8 * 1024 * 1024);
    const download = await uploads.GET(
        new Request("http://localhost:3000/api/workspace/admin/mail/attachments?id=" + ids[0]),
    );
    assert.equal(download.status, 200);
    assert.equal((await download.arrayBuffer()).byteLength, 8 * 1024 * 1024);
    console.log(
        "PASS: Admin uploads and saves six files including an 8 MB arbitrary file, 13 MB combined; encrypted load and download preserve exact bytes. Fixtures rolled back; no email sent.",
    );
} finally {
    await connection.query("ROLLBACK");
    connection.release();
    await pool.end();
}
