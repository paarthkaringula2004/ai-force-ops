import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresDialect } from "kysely";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 15000,
        statement_timeout: 15000,
    }),
    c = await pool.connect();
let sent = [],
    queued = [],
    configuration;
const adapterPool = {
    connect: async () => ({ query: (...args) => c.query(...args), release() {} }),
    end: async () => {},
};
const { auth } = load("lib/auth.ts", {
    "better-auth": {
        betterAuth: (options) => {
            configuration = options;
            return betterAuth({
                ...options,
                database: {
                    dialect: new PostgresDialect({ pool: adapterPool }),
                    type: "postgres",
                    transaction: false,
                },
                secret: "fixture-recovery-only-secret-at-least-32-characters",
                baseURL: "https://fixture.invalid",
                trustedOrigins: ["https://fixture.invalid"],
                rateLimit: { enabled: false },
                socialProviders: {},
            });
        },
    },
    "better-auth/plugins": {
        emailOTP: (options) =>
            emailOTP({
                ...options,
                sendVerificationOTP: async (data, ctx) => {
                    sent.push(data);
                    await options.sendVerificationOTP(data, ctx);
                },
            }),
    },
    "@/lib/db": { db: { query: (...args) => c.query(...args) } },
    "@/lib/mail": {
        queueMail: async (...args) => {
            queued.push(args);
        },
    },
    "@/lib/organization": { organizationEvent: async () => {} },
    "./google-auth": { googleSignInConfigured: () => false },
});
try {
    await c.query("BEGIN");
    const user = randomUUID(),
        email = user + "@example.invalid",
        oldPassword = randomUUID() + "Aa1!",
        newPassword = randomUUID() + "Bb2!";
    await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [user, "Recovery fixture", email],
    );
    await c.query(
        `INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,'credential',$2,$3,now(),now())`,
        [randomUUID(), user, await hashPassword(oldPassword)],
    );
    await c.query(
        `INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval '1 day',now(),now())`,
        [randomUUID(), randomUUID(), user],
    );
    const request = () => auth.api.requestPasswordResetEmailOTP({ body: { email } });
    const reset = (otp, password = newPassword) =>
        auth.api.resetPasswordEmailOTP({ body: { email, otp, password } });
    assert.equal(
        (
            await auth.api.requestPasswordResetEmailOTP({
                body: { email: randomUUID() + "@example.invalid" },
            })
        ).success,
        true,
    );
    assert.equal(sent.length, 0, "Unknown email gives generic success without sending");
    await request();
    let code = sent.at(-1).otp;
    assert.match(code, /^\d{6}$/);
    const stored = (
        await c.query("SELECT value FROM verification WHERE identifier=$1", [
            "forget-password-otp-" + email,
        ])
    ).rows[0].value;
    assert.ok(!stored.includes(code), "Only a hashed code is stored");
    await assert.rejects(() => reset(code, "short"));
    await c.query(
        "UPDATE verification SET \"expiresAt\"=now()-interval '1 second' WHERE identifier=$1",
        ["forget-password-otp-" + email],
    );
    await assert.rejects(() => reset(code));
    await request();
    code = sent.at(-1).otp;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) await assert.rejects(() => reset(wrong));
    await assert.rejects(() => reset(code), "Attempt limit rejects even the correct code");
    await request();
    const previous = sent.at(-1).otp;
    await request();
    code = sent.at(-1).otp;
    if (previous !== code)
        await assert.rejects(() => reset(previous), "Resend invalidates the previous code");
    assert.equal((await reset(code)).success, true);
    await assert.rejects(() => reset(code), "Consumed code cannot be replayed");
    const hashed = (await c.query('SELECT password FROM account WHERE "userId"=$1', [user])).rows[0]
        .password;
    assert.equal(await verifyPassword({ hash: hashed, password: newPassword }), true);
    assert.equal(await verifyPassword({ hash: hashed, password: oldPassword }), false);
    assert.equal((await c.query('SELECT 1 FROM session WHERE "userId"=$1', [user])).rowCount, 0);
    assert.equal(configuration.emailAndPassword.revokeSessionsOnPasswordReset, true);
    assert.ok(queued.some((q) => q[0] === "notification" && q[1] === email));
    const emailHtml = queued.find((q) => q[0] === "verification")[2].html;
    assert.match(emailHtml, /Open account recovery/);
    assert.doesNotMatch(emailHtml, /<script|onclick=/i);
    assert.ok(
        (
            await c.query(
                "SELECT 1 FROM workspace_audit WHERE target_id=$1 AND action='member.password_recovered'",
                [user],
            )
        ).rowCount,
    );
    console.log(
        "PASS: actual configured OTP plugin, random/hashed codes, generic unknown-email response, expiry, attempt lockout, resend invalidation, one-use reset, actual password verification, session revocation, audit and notification templates. No external email; all database fixtures rolled back.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
