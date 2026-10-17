import { createHash } from "node:crypto";
import { db } from "./db";
import { organizationEvent, organizationOwner } from "./organization";
import { securityPolicy } from "./eassist/security";
import type { WorkspaceAccess } from "./workspace-permissions";
import { requireTickets } from "./tickets";
import type { PoolClient } from "pg";

export class OrganizationPolicyError extends Error {
    readonly status = 403;
}

export async function organizationWriteAllowed(
    user: string,
    client: Pick<PoolClient, "query"> = db,
) {
    const policy = await client.query(
        `SELECT allow_writes FROM eassist_security WHERE user_id=COALESCE((SELECT owner_id FROM organization_workspace WHERE id=true),$1) FOR SHARE`,
        [user],
    );
    if (policy.rows[0]?.allow_writes === false)
        throw new OrganizationPolicyError(
            "Changes are disabled by the organization security policy. Nothing was submitted or changed.",
        );
}

export async function organizationGuard(request: Request, member?: WorkspaceAccess) {
    const path = new URL(request.url).pathname,
        method = request.method;
    const subject =
        member?.user_id ||
        "anonymous:" +
            createHash("sha256")
                .update(request.headers.get("x-forwarded-for") || "local")
                .digest("hex");
    const rate = (
        await db.query(
            `WITH counted AS (
  INSERT INTO organization_request_windows(subject,minute,requests) VALUES($1,date_trunc('minute',now()),1)
  ON CONFLICT(subject,minute) DO UPDATE SET requests=organization_request_windows.requests+1 RETURNING requests
 ) SELECT requests,COALESCE((SELECT requests_per_minute FROM organization_workspace WHERE id=true),180) AS limit FROM counted`,
            [subject],
        )
    ).rows[0];
    const window = rate.requests,
        limit = rate.limit;
    if (window > limit) {
        if (window === limit + 1)
            await organizationEvent(
                member?.user_id || null,
                member?.role || "anonymous",
                "rate_limit",
                path,
                method,
                "Organization request limit exceeded",
                "warning",
            );
        return Response.json(
            { error: "Too many requests. Please retry in one minute." },
            { status: 429, headers: { "Retry-After": "60" } },
        );
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const origin = request.headers.get("origin");
        if (
            request.headers.get("sec-fetch-site") === "cross-site" ||
            (origin && ![new URL(request.url).origin, process.env.BETTER_AUTH_URL].includes(origin))
        ) {
            await organizationEvent(
                member?.user_id || null,
                member?.role || "anonymous",
                "origin_denied",
                path,
                method,
                "Cross-site write rejected",
                "warning",
            );
            return Response.json(
                { error: "Cross-site requests are not permitted." },
                { status: 403 },
            );
        }
        if (member) {
            const policy = await securityPolicy(member.user_id);
            // Login, read-only chat and Admin recovery/configuration remain available.
            const mutation =
                !path.startsWith("/api/playground") &&
                !path.endsWith("/chat") &&
                !path.startsWith("/api/auth") &&
                !path.startsWith("/api/eassist") &&
                !path.startsWith("/api/workspace/admin") &&
                !path.startsWith("/api/workspace/organization") &&
                !path.endsWith("/platform-error");
            if (mutation && !policy.allow_writes) {
                await organizationEvent(
                    member.user_id,
                    member.role,
                    "policy_denied",
                    path,
                    method,
                    "Organization write policy rejected a change",
                    "warning",
                );
                return Response.json(
                    { error: "Changes are disabled by the organization security policy." },
                    { status: 403 },
                );
            }
            if (mutation)
                await organizationEvent(
                    member.user_id,
                    member.role,
                    "change_attempt",
                    path,
                    method,
                    "Authenticated change requested",
                );
        }
    }
    return null;
}
export async function organizationExecutionAllowed(user: string) {
    await requireTickets(user);
    if (!(await securityPolicy(user)).allow_runs) {
        const role =
            (await db.query("SELECT role FROM workspace_members WHERE user_id=$1", [user])).rows[0]
                ?.role || "user";
        await organizationEvent(
            user,
            role,
            "execution_denied",
            "/api/playground",
            "POST",
            "Organization execution policy rejected an agent run",
            "warning",
        );
        throw new OrganizationPolicyError(
            "Agent execution is disabled by the organization security policy.",
        );
    }
}
export async function recordAuthResult(request: Request, status: number, user?: string) {
    if (![401, 403, 429].includes(status)) return;
    await organizationEvent(
        user || null,
        "anonymous",
        "authentication_rejected",
        new URL(request.url).pathname,
        request.method,
        "Authentication request rejected",
        "warning",
    );
}
export { organizationOwner };
