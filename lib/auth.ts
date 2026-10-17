import { emailOTP } from "better-auth/plugins";
import { queueMail } from "@/lib/mail";
import { welcomeMail, verificationMail, passwordChangedMail } from "@/lib/mail-templates";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { db } from "@/lib/db";
import { organizationEvent } from "@/lib/organization";
import { googleSignInConfigured } from "./google-auth";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const secret = process.env.BETTER_AUTH_SECRET;

if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required to start authentication.");
}

if (
    process.env.AUTH_DISABLE_SIGNUP !== undefined &&
    !["true", "false"].includes(process.env.AUTH_DISABLE_SIGNUP)
)
    throw new Error("AUTH_DISABLE_SIGNUP must be true or false.");

export const auth = betterAuth({
    appName: "AIForce.Ops",
    baseURL,
    secret,
    database: db,
    trustedOrigins: [baseURL],
    rateLimit: { enabled: true },
    socialProviders: googleSignInConfigured()
        ? {
              google: {
                  clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
                  clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
                  prompt: "select_account",
                  accessType: "online",
                  includeGrantedScopes: false,
                  disableSignUp: process.env.AUTH_DISABLE_SIGNUP === "true",
              },
          }
        : {},
    account: {
        accountLinking: {
            enabled: true,
            requireLocalEmailVerified: true,
            allowDifferentEmails: false,
        },
    },
    plugins: [
        emailOTP({
            otpLength: 6,
            expiresIn: 600,
            allowedAttempts: 3,
            storeOTP: "hashed",
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            disableSignUp: true,
            rateLimit: { window: 60, max: 3 },
            sendVerificationOTP: async ({ email, otp, type }) => {
                await db.query(
                    "UPDATE mail_outbox SET status='expired',encrypted_content=NULL WHERE recipient=lower($1) AND kind='verification' AND status='queued'",
                    [email],
                );
                await queueMail(
                    "verification",
                    email,
                    verificationMail(otp, type),
                    "otp:" + randomUUID(),
                    { expires: new Date(Date.now() + 600000) },
                );
            },
        }),
    ],
    emailVerification: { autoSignInAfterVerification: false },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    if (user.emailVerified)
                        await queueMail(
                            "welcome",
                            user.email,
                            welcomeMail(user.name),
                            "welcome:" + user.id,
                            { actor: user.id },
                        );
                },
            },
            update: {
                after: async (user) => {
                    if (user.emailVerified)
                        await queueMail(
                            "welcome",
                            user.email,
                            welcomeMail(user.name),
                            "welcome:" + user.id,
                            { actor: user.id },
                        );
                },
            },
        },
        session: {
            create: {
                after: async (session) => {
                    const role =
                        (
                            await db.query("SELECT role FROM workspace_members WHERE user_id=$1", [
                                session.userId,
                            ])
                        ).rows[0]?.role || "user";
                    await organizationEvent(
                        session.userId,
                        role,
                        "sign_in",
                        "/api/auth",
                        "POST",
                        "Account signed in",
                    );
                },
            },
        },
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        revokeSessionsOnPasswordReset: true,
        onPasswordReset: async ({ user }) => {
            await db.query(
                "INSERT INTO workspace_audit(id,target_id,action,details) VALUES($1,$2,'member.password_recovered',$3::jsonb)",
                [
                    randomUUID(),
                    user.id,
                    JSON.stringify({ method: "email_otp", sessionsRevoked: true }),
                ],
            );
            try {
                await queueMail(
                    "notification",
                    user.email,
                    passwordChangedMail(user.name),
                    "password-changed:" + randomUUID(),
                    { actor: user.id },
                );
            } catch {
                console.error("Password-change notification could not be queued.");
            }
        },
        disableSignUp: process.env.AUTH_DISABLE_SIGNUP === "true",
        minPasswordLength: 8,
        maxPasswordLength: 128,
    },
});
