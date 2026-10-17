export const optionalPermissions = [
    "agent_studio",
    "knowledge",
    "integrations",
    "operations",
    "security",
] as const;
export type Permission =
    (typeof optionalPermissions)[number] | "team" | "admin" | "employee" | "signed_in" | "billing";
export type WorkspaceAccess = {
    user_id: string;
    role: "user" | "employee" | "manager" | "admin";
    manager_id: string | null;
    department: string;
    department_code?: number | null;
    qualification_code?: string;
    job_title_id?: number | null;
    employee_id: string;
    permissions: string[];
    active: boolean;
    admin_id?: string | null;
    manager_name?: string | null;
    ticket_balance?: number | null;
    employment_verified_at?: string | null;
    employment_verified_by_name?: string | null;
};
export function permitted(member: WorkspaceAccess, permission: Permission) {
    if (!member.active) return false;
    if (permission === "signed_in") return true;
    if (permission === "employee") return member.role !== "user";
    if (member.role === "admin") return true;
    if (permission === "integrations") return false;
    // Every active role can manage its own billing history and cancel renewals.
    if (permission === "billing") return true;
    if (permission === "knowledge")
        return (
            member.role === "manager" ||
            (member.role === "employee" && Boolean(member.employment_verified_at))
        );
    if (permission === "operations") return member.role === "manager";
    if (permission === "team") return member.role === "manager";
    return permission === "agent_studio";
}
export function requiredPermission(path: string): Permission {
    if (
        path.startsWith("/api/google-meet/") ||
        path.startsWith("/api/teams/") ||
        path === "/api/meetings"
    )
        return "signed_in";
    if (path === "/dashboard/meeting-rooms" || path.startsWith("/api/meeting-rooms"))
        return "signed_in";
    if (path === "/api/eassist/report") return "signed_in";
    if (path === "/api/payments/configuration") return "admin";
    if (
        path === "/dashboard/payments" ||
        path.startsWith("/api/payments") ||
        path.startsWith("/api/billing")
    )
        return "billing";
    if (
        path.startsWith("/api/workspace/admin") ||
        path === "/dashboard/administration" ||
        path === "/dashboard/my-customization" ||
        path.startsWith("/api/metrics")
    )
        return "admin";
    if (path === "/dashboard/team-requests") return "team";
    if (path === "/api/workspace/tickets") return "signed_in";
    if (
        path === "/api/workspace/access" ||
        path.startsWith("/api/playground") ||
        path === "/dashboard" ||
        path === "/dashboard/settings" ||
        path.startsWith("/api/account/profile") ||
        path.startsWith("/api/account/sessions") ||
        path === "/api/dashboard/updates"
    )
        return "signed_in";
    if (
        path.startsWith("/api/workspace/") ||
        path.startsWith("/api/playground/") ||
        path === "/api/playground" ||
        path === "/dashboard" ||
        path === "/dashboard/my-requests" ||
        path === "/dashboard/settings" ||
        path.startsWith("/api/account/profile") ||
        path.startsWith("/api/account/sessions") ||
        path === "/api/health" ||
        path === "/api/dashboard/updates"
    )
        return "employee";
    if (path.startsWith("/api/epace") || path.startsWith("/service-review-center/epace"))
        return "knowledge";
    if (path.startsWith("/api/eassist") || path.startsWith("/service-review-center/eassist"))
        return "integrations";
    if (path === "/api/service-review-center/token" || path === "/api/service-review-center/sync")
        return "integrations";
    if (/\/(vulnerabilit|scans|security)/.test(path)) return "security";
    if (path.startsWith("/service-review-center") || path.startsWith("/api/service-review-center"))
        return "operations";
    if (
        path.startsWith("/dashboard") ||
        path.startsWith("/agent-builder") ||
        path.startsWith("/api/agents") ||
        path.startsWith("/api/tools") ||
        path.startsWith("/api/token-calculator") ||
        path === "/api/usage" ||
        path === "/api/account/export"
    )
        return "agent_studio";
    return "admin";
}
