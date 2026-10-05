import { betterAuth } from "better-auth";
import { db } from "@/lib/db";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const secret = process.env.BETTER_AUTH_SECRET;

if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is required to start authentication.");
}

export const auth = betterAuth({
  appName: "AIForce.Ops",
  baseURL,
  secret,
  database: db,
  trustedOrigins: [baseURL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
});
