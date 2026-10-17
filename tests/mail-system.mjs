import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import pg from "pg";
const require = createRequire(import.meta.url);
import { load } from "./helpers/load-ts.mjs";
const templates = load("lib/mail-templates.ts"),
    captured = [];
process.env.MAIL_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
const mail = load("lib/mail.ts", {
    "server-only": {},
    "./db": {
        db: {
            query: async (sql, args) => {
                captured.push({ sql, args });
                return { rows: [{ id: args?.[0] }] };
            },
        },
    },
});
const content = templates.offerMail({
    name: "<script>bad()</script>",
    role: "Engineer",
    department: "Technology",
    startDate: "2026-11-01",
    location: "Remote",
    compensation: "Approved amount",
    terms: "Approved test terms & next steps",
});
assert.ok(content.html.includes("&lt;script&gt;"));
assert.ok(!content.html.includes("<script>"));
assert.ok(content.text.includes("Approved test terms"));
const encrypted = mail.encryptMail(content);
assert.ok(!encrypted.includes("Approved"));
assert.deepEqual(mail.decryptMail(encrypted), content);
assert.throws(() =>
    mail.decryptMail(encrypted.slice(0, -1) + (encrypted.endsWith("0") ? "1" : "0")),
);
await mail.queueMail("test", "safe@example.invalid", templates.testMail(), "suppressed-test");
assert.equal(captured.length, 0);
await mail.queueMail("offer", "preview@example.invalid", content, "preview-test", { draft: true });
assert.equal(captured.length, 1);
assert.equal(captured[0].args[7], "draft");
assert.ok(!captured[0].args[5].includes("Approved"));
assert.equal(mail.validMailAddress("safe@example.com\r\nBcc: attacker@example.com"), false);
assert.ok(
    !templates
        .leaveMail({
            name: "Demo",
            number: "REQ-TEST",
            status: "Approved",
            dates: "1 November 2026",
            reviewer: "Demo Manager",
            review: false,
        })
        .html.includes("medical reason"),
);
console.log(
    "PASS: branded HTML/text templates, escaping, authenticated encryption, private payloads, reserved-address suppression and header-injection rejection.",
);

// Exercise worker outcomes without contacting SMTP or exposing message content.
for (const [outcome, attempts, expected] of [
    ["accepted", 1, "sent"],
    ["temporary", 1, "queued"],
    ["permanent", 1, "failed"],
    ["temporary", 5, "failed"],
    ["reserved", 1, "failed"],
]) {
    const queries = [],
        row = {
            id: randomUUID(),
            recipient: outcome === "reserved" ? "fixture@example.invalid" : "fixture@example.com",
            encrypted_content: encrypted,
            attempts,
        };
    let sends = 0,
        closed = false;
    const worker = load("lib/mail.ts", {
        "server-only": {},
        "./db": {
            db: {
                query: async (sql, args) => {
                    queries.push({ sql, args });
                    return sql.startsWith("WITH selected")
                        ? { rows: [row], rowCount: 1 }
                        : { rows: [], rowCount: 0 };
                },
            },
        },
        nodemailer: {
            createTransport: () => ({
                sendMail: async () => {
                    sends++;
                    if (outcome === "temporary" || outcome === "permanent")
                        throw Object.assign(new Error("Do not log confidential provider text"), {
                            responseCode: outcome === "temporary" ? 451 : 550,
                        });
                    return { accepted: [row.recipient] };
                },
                close: () => {
                    closed = true;
                },
            }),
        },
    });
    await worker.deliverMailBatch();
    assert.ok(closed);
    assert.equal(sends, outcome === "reserved" ? 0 : 1);
    const result = queries.find(
        (q) => q.sql.startsWith("UPDATE mail_outbox SET status=") && q.args?.[0] === row.id,
    );
    if (expected === "sent") {
        assert.ok(result.sql.includes("status='sent'"));
        assert.ok(result.sql.includes("encrypted_content=NULL"));
    } else if (outcome === "reserved") {
        assert.ok(result.sql.includes("status='failed'"));
    } else {
        assert.equal(result.args[1], expected);
        assert.ok(result.args[2] >= 60);
        assert.ok(!result.args[3].includes("confidential"));
    }
    assert.ok(queries.some((q) => q.sql.includes("SKIP LOCKED") && q.sql.includes("90 seconds")));
    assert.ok(queries.some((q) => q.sql.includes("status='expired'")));
}
const events = [];
const leaveEvents = load("lib/mail-events.ts", {
    "./mail": { mailConfigured: () => true, queueMail: async (...args) => events.push(args) },
    "./mail-templates": templates,
});
const leaveRow = {
    id: "leave-fixture",
    user_id: "employee-fixture",
    name: "Demo employee",
    email: "employee@example.invalid",
    request_number: "REQ-TEST",
    details: { dates: "1 November 2026", reason: "Confidential medical information" },
    manager_id: "manager-fixture",
    status: "pending_approval",
    updated_at: new Date(),
    reviewer: null,
};
const transaction = {
    query: async (sql) => ({
        rows: sql.includes("SELECT r.*") ? [leaveRow] : [{ email: "manager@example.invalid" }],
    }),
};
await leaveEvents.queueLeaveEvent(transaction, leaveRow.id);
assert.equal(events.length, 2);
assert.ok(events.every((e) => e[4].client === transaction));
assert.ok(events.every((e) => !e[2].text.includes("Confidential")));
events.length = 0;
leaveRow.status = "approved";
leaveRow.reviewer = "Demo manager";
leaveRow.decided_by = "manager-fixture";
await leaveEvents.queueLeaveEvent(transaction, leaveRow.id);
assert.equal(events.length, 1);
assert.ok(events[0][2].text.includes("Demo manager"));
assert.ok(events[0][2].text.includes("Approved"));
const queued = [],
    plugins = [];
let authOptions;
load("lib/auth.ts", {
    "./google-auth": { googleSignInConfigured: () => false },
    "better-auth": {
        betterAuth: (options) => {
            authOptions = options;
            return {};
        },
    },
    "better-auth/plugins": {
        emailOTP: (options) => {
            plugins.push(options);
            return {};
        },
    },
    "@/lib/mail": { queueMail: async (...args) => queued.push(args) },
    "@/lib/mail-templates": templates,
    "@/lib/db": { db: { query: async () => ({ rows: [] }) } },
    "@/lib/organization": { organizationEvent: async () => {} },
});
await authOptions.databaseHooks.user.create.after({
    id: "new-fixture",
    name: "Demo",
    email: "new@example.invalid",
    emailVerified: false,
});
assert.equal(queued.length, 0);
await plugins[0].sendVerificationOTP({
    email: "new@example.invalid",
    otp: "123456",
    type: "email-verification",
});
assert.equal(queued[0][0], "verification");
assert.ok(queued[0][4].expires > Date.now());
await authOptions.databaseHooks.user.update.after({
    id: "new-fixture",
    name: "Demo",
    email: "new@example.invalid",
    emailVerified: true,
});
assert.equal(queued[1][0], "welcome");
assert.equal(queued[1][3], "welcome:new-fixture");
assert.ok(queued[1][2].text.includes("verified"));
assert.equal(plugins[0].storeOTP, "hashed");
assert.equal(plugins[0].allowedAttempts, 3);
assert.equal(authOptions.rateLimit.enabled, true);
assert.equal(authOptions.emailAndPassword.requireEmailVerification, true);
assert.equal(authOptions.emailVerification.autoSignInAfterVerification, true);
console.log(
    "PASS: SMTP acceptance, temporary retry, permanent rejection, attempt limit, reserved recipients, leases/expiry, private leave routing and automatic signup/OTP hooks.",
);

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    base = "http://localhost:3000",
    users = [],
    jobs = [];
async function account(name) {
    const email = `mail-${randomUUID()}@example.invalid`,
        password = randomUUID() + "Aa1!",
        headers = { Origin: base, "Content-Type": "application/json" };
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, email, password }),
    });
    assert.equal(r.status, 200);
    const u = (await r.json()).user;
    users.push(u.id);
    await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [u.id]);
    const login = await fetch(base + "/api/auth/sign-in/email", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    return {
        ...u,
        cookie: login.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
    };
}
async function request(who, path, body, status = 200) {
    const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { Origin: base, Cookie: who.cookie, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data;
}
try {
    const admin = await account("Mail test Admin"),
        user = await account("Mail test User");
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [admin.id]);
    await request(user, "/api/workspace/admin/mail", undefined, 403);
    await request(
        user,
        "/api/workspace/admin/mail",
        { action: "test", requestId: randomUUID() },
        403,
    );
    const recipient = `offer-${randomUUID()}@example.invalid`,
        details = {
            name: "Test candidate",
            role: "Test role",
            department: "Test department",
            startDate: "2026-11-01",
            location: "Test location",
            compensation: "Test compensation",
            terms: "Fictional test only. No real employment offer.",
        };
    const draft = await request(admin, "/api/workspace/admin/mail", {
        action: "preview-offer",
        to: recipient,
        details,
    });
    jobs.push(draft.id);
    assert.ok(draft.preview.html.includes("Fictional test"));
    assert.equal(
        (await db.query("SELECT status FROM mail_outbox WHERE id=$1", [draft.id])).rows[0].status,
        "draft",
    );
    await request(
        admin,
        "/api/workspace/admin/mail",
        { action: "confirm-offer", id: draft.id, confirm: false },
        400,
    );
    await request(admin, "/api/workspace/admin/mail", {
        action: "confirm-offer",
        id: draft.id,
        confirm: true,
    });
    await request(
        admin,
        "/api/workspace/admin/mail",
        { action: "confirm-offer", id: draft.id, confirm: true },
        400,
    );
    const expired = await request(admin, "/api/workspace/admin/mail", {
        action: "preview-offer",
        to: recipient,
        details,
    });
    jobs.push(expired.id);
    await db.query("UPDATE mail_outbox SET expires_at=now()-interval '1 minute' WHERE id=$1", [
        expired.id,
    ]);
    await request(
        admin,
        "/api/workspace/admin/mail",
        { action: "confirm-offer", id: expired.id, confirm: true },
        400,
    );
    const worker = await fetch(base + "/api/mail-worker", { method: "POST" });
    assert.equal(worker.status, 401);
    await db.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1', [user.id]);
    const sendOtp = await request(user, "/api/auth/email-otp/send-verification-otp", {
        email: user.email,
        type: "email-verification",
    });
    assert.ok(sendOtp);
    await request(
        user,
        "/api/auth/email-otp/verify-email",
        { email: user.email, otp: "000000" },
        400,
    );
    assert.equal(
        (await db.query('SELECT "emailVerified" FROM "user" WHERE id=$1', [user.id])).rows[0]
            .emailVerified,
        false,
    );
    // Install a known hashed fixture code in the same record created by the OTP endpoint.
    const code = "812943",
        hash = createHash("sha256").update(code).digest("base64url");
    const updated = await db.query(
        "UPDATE verification SET value=$2 WHERE identifier=$1 RETURNING id",
        ["email-verification-otp-" + user.email, hash + ":0"],
    );
    assert.equal(updated.rowCount, 1);
    await request(user, "/api/auth/email-otp/verify-email", { email: user.email, otp: code });
    assert.equal(
        (await db.query('SELECT "emailVerified" FROM "user" WHERE id=$1', [user.id])).rows[0]
            .emailVerified,
        true,
    );
    await request(user, "/api/auth/email-otp/verify-email", { email: user.email, otp: code }, 400);
    console.log(
        "PASS: Admin-only Mail Center, exact offer confirmation, preview expiry/replay safeguards, unauthorized worker blocked, incorrect OTP rejected, correct OTP verified and reuse rejected. No real recipient was emailed by these fixtures.",
    );
} finally {
    if (jobs.length) await db.query("DELETE FROM mail_outbox WHERE id=ANY($1::uuid[])", [jobs]);
    if (users.length) {
        await db.query("DELETE FROM organization_security_events WHERE actor_id=ANY($1::text[])", [
            users,
        ]);
        await db.query(
            "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
            [users],
        );
        for (const id of users) await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    }
    await db.end();
}
