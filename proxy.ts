import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted, requiredPermission } from "@/lib/workspace-permissions";
import { organizationGuard } from "@/lib/organization-security";
import { organizationEvent } from "@/lib/organization";
export async function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    // These endpoints validate their own worker/webhook/collector credentials.
    if (
        [
            "/api/payments/callback",
            "/api/payments/webhook",
            "/api/eassist/worker",
            "/api/eassist/webhook",
            "/api/service-review-center/scans/worker",
            "/api/cron/purge-agent-bin",
        ].includes(path)
    )
        return NextResponse.next();
    if (
        [
            "/api/service-review-center/records",
            "/api/service-review-center/vulnerabilities",
        ].includes(path) &&
        request.method === "POST" &&
        request.headers.has("authorization")
    )
        return NextResponse.next();
    try {
        if (path.startsWith("/api/auth/"))
            return (await organizationGuard(request)) || NextResponse.next();
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user)
            return path.startsWith("/api/")
                ? NextResponse.json({ error: "Sign in required." }, { status: 401 })
                : NextResponse.redirect(new URL("/sign-in", request.url));
        const member = await workspaceAccess(session.user.id);
        const guarded = await organizationGuard(request, member);
        if (guarded) return guarded;
        const allowed =
            permitted(member, requiredPermission(path)) ||
            (path === "/api/service-review-center/chat" && permitted(member, "security"));
        if (!allowed) {
            await organizationEvent(
                member.user_id,
                member.role,
                "access_denied",
                path,
                request.method,
                "Role access check rejected a request",
                "warning",
            );
            return path.startsWith("/api/")
                ? NextResponse.json(
                      {
                          error: member.active
                              ? "Your role does not permit this action."
                              : "Your workspace account is disabled.",
                      },
                      { status: 403 },
                  )
                : NextResponse.redirect(
                      new URL(
                          member.active ? "/dashboard?access=denied" : "/access-disabled",
                          request.url,
                      ),
                  );
        }
        if (
            member.role === "manager" &&
            path.startsWith("/api/service-review-center/") &&
            !["GET", "HEAD"].includes(request.method) &&
            path !== "/api/service-review-center/chat"
        )
            return NextResponse.json(
                { error: "Manager Review Center is read-only." },
                { status: 403 },
            );
        return NextResponse.next();
    } catch {
        return NextResponse.json(
            { error: "Permissions could not be verified. Try again." },
            { status: 503 },
        );
    }
}
export const config = {
    matcher: [
        "/api/auth/:path*",
        "/api/payments/:path*",
        "/api/billing/:path*",
        "/dashboard/:path*",
        "/agent-builder/:path*",
        "/service-review-center/:path*",
        "/api/workspace/:path*",
        "/api/agents/:path*",
        "/api/tools/:path*",
        "/api/epace/:path*",
        "/api/eassist/:path*",
        "/api/service-review-center/:path*",
        "/api/playground/:path*",
        "/api/account/:path*",
        "/api/token-calculator/:path*",
        "/api/usage",
        "/api/metrics",
        "/api/dashboard/:path*",
        "/api/meeting-rooms/:path*",
        "/api/meetings/:path*",
        "/api/teams/:path*",
        "/api/google-meet/:path*",
    ],
};
