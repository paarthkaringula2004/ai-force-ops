import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresDialect } from "kysely";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { load } from "./helpers/load-ts.mjs";
const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 15000,
        statement_timeout: 15000,
    }),
    client = await pool.connect();
const sent = [];
let configuration;
const adapterPool = {
    connect: async () => ({ query: (...args) => client.query(...args), release() {} }),
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
                secret: "fixture-verification-only-secret-at-least-32-characters",
                baseURL: "https://fixture.invalid",
                trustedOrigins: ["https://fixture.invalid"],
                rateLimit: { enabled: false },
                socialProviders: {},
                emailAndPassword: { ...options.emailAndPassword, disableSignUp: false },
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
    "@/lib/db": { db: { query: (...args) => client.query(...args) } },
    "@/lib/mail": { queueMail: async () => {} },
    "@/lib/organization": { organizationEvent: async () => {} },
    "./google-auth": { googleSignInConfigured: () => false },
});
try {
    await client.query("BEGIN");
    const email = randomUUID() + "@example.invalid",
        password = randomUUID() + "Aa1!";
    const created = await auth.api.signUpEmail({
        body: { name: "Verification fixture", email, password },
    });
    assert.equal(created.user.emailVerified, false);
    assert.equal(created.token, null);
    assert.equal(configuration.emailAndPassword.requireEmailVerification, true);
    assert.equal(configuration.emailVerification.autoSignInAfterVerification, false);
    assert.equal(sent.at(-1).email, email);
    assert.equal(sent.at(-1).type, "email-verification");
    await assert.rejects(
        () => auth.api.signInEmail({ body: { email, password } }),
        (e) => e.body?.code === "EMAIL_NOT_VERIFIED",
    );
    const previous = sent.at(-1).otp;
    await auth.api.sendVerificationOTP({ body: { email, type: "email-verification" } });
    const otp = sent.at(-1).otp;
    assert.match(otp, /^\d{6}$/);
    if (previous !== otp)
        await assert.rejects(() => auth.api.verifyEmailOTP({ body: { email, otp: previous } }));
    const verified = await auth.api.verifyEmailOTP({ body: { email, otp } });
    assert.equal(verified.status, true);
    assert.equal(verified.token, null);
    assert.equal(
        (await client.query('SELECT 1 FROM session WHERE "userId"=$1', [created.user.id])).rowCount,
        0,
    );
    await assert.rejects(() => auth.api.verifyEmailOTP({ body: { email, otp } }));
    const signedIn = await auth.api.signInEmail({ body: { email, password } });
    assert.equal(signedIn.user.emailVerified, true);
    assert.ok(signedIn.token);
    console.log(
        "PASS: actual configured signup requests an OTP; unverified password sign-in is blocked; resend replaces the code; verification is single-use and creates no session; verified credentials then sign in successfully. Mail mocked; all real database fixtures rolled back.",
    );
} finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
}
