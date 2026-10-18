import { db } from "../db";
import { adminLibrarySettingsOwner } from "../admin-library";
import { workspaceAccess } from "../workspace-access";
import { InputError } from "../eassist/transport";
import { providerById } from "./catalog";

export const integrationShareRoles = ["manager", "employee", "user", "admin"] as const;
export async function integrationAccess(user: string) {
    const member = await workspaceAccess(user);
    if (!member.active) throw new InputError("Your account is inactive.", 403);
    const admin = member.role === "admin";
    const grants = (
        await db.query(
            `SELECT s.provider,d.definition,s.user_id AS owner_id,owner.role AS owner_role,s.source_owner_id FROM integration_role_shares s
 JOIN workspace_members owner ON owner.user_id=s.user_id AND owner.active AND owner.role IN ('admin','manager')
 LEFT JOIN integration_definitions d ON d.user_id=COALESCE(s.source_owner_id,s.user_id) AND d.id=s.provider
 LEFT JOIN workspace_members original ON original.user_id=s.source_owner_id
 LEFT JOIN integration_role_shares original_share ON original_share.user_id=s.source_owner_id AND original_share.provider=s.provider
 WHERE $1=ANY(s.shared_roles) AND d.deleted_at IS NULL AND (
  (owner.role='admin' AND s.source_owner_id IS NULL) OR
  (owner.role='manager' AND s.provider<>'*' AND (
   (s.source_owner_id IS NULL AND d.definition IS NOT NULL) OR
   (s.source_owner_id IS NOT NULL AND $1<>'admin' AND original.active AND original.role='admin' AND original_share.source_owner_id IS NULL AND 'manager'=ANY(original_share.shared_roles))
  ))
 ) ORDER BY s.updated_at DESC,s.user_id`,
            [member.role],
        )
    ).rows;
    const own = (
        await db.query(
            "SELECT id FROM integration_definitions WHERE admin_library_access($1,user_id) AND definition IS NOT NULL",
            [user],
        )
    ).rows.map((r) => r.id as string);
    return {
        admin,
        manager: member.role === "manager",
        canCreate: admin || grants.some((g) => g.provider === "*" && g.owner_role === "admin"),
        own,
        grants,
    };
}
export function integrationShareOptions(
    access: Awaited<ReturnType<typeof integrationAccess>>,
    provider: string,
): readonly string[] {
    if (provider === "*") return access.admin ? ["manager", "employee", "user"] : [];
    if (
        (access.own.includes(provider) && (access.admin || access.manager)) ||
        (access.admin && providerById(provider))
    )
        return integrationShareRoles;
    if (
        access.manager &&
        access.grants.some(
            (g) => g.provider === provider && g.owner_role === "admin" && !g.source_owner_id,
        )
    )
        return ["manager", "employee", "user"];
    return [];
}
export async function requireIntegrationAccess(user: string, provider?: string) {
    const access = await integrationAccess(user);
    if (
        provider &&
        !access.admin &&
        !access.own.includes(provider) &&
        !access.grants.some((g) => g.provider === provider)
    ) {
        throw new InputError("This integration has not been shared with your role.", 403);
    }
    return access;
}
export async function requireIntegrationCreate(user: string) {
    const access = await integrationAccess(user);
    if (!access.canCreate)
        throw new InputError("An Admin must grant your role permission to add integrations.", 403);
}
export async function integrationShares(user: string) {
    user = await adminLibrarySettingsOwner(user);
    return (
        await db.query(
            "SELECT provider,shared_roles FROM integration_role_shares WHERE user_id=$1",
            [user],
        )
    ).rows;
}
export async function saveIntegrationShare(user: string, provider: string, roles: unknown) {
    const access = await integrationAccess(user);
    if (!access.admin && !access.manager)
        throw new InputError("Only Admins and Managers can share integrations.", 403);
    const allowed = integrationShareOptions(access, provider);
    if (!allowed.length)
        throw new InputError(
            provider === "*"
                ? "Only Admins can grant integration creation access."
                : "You can share your own integrations or integrations shared directly by an Admin.",
            403,
        );
    if (
        !Array.isArray(roles) ||
        roles.some((r) => !allowed.includes(r)) ||
        roles.length > allowed.length
    )
        throw new InputError(
            "Choose only the permitted recipient roles. Admin tools cannot be shared back to Admins.",
        );
    const source =
        access.manager && !access.own.includes(provider)
            ? access.grants.find(
                  (g) => g.provider === provider && g.owner_role === "admin" && !g.source_owner_id,
              )?.owner_id
            : null;
    await db.query(
        `INSERT INTO integration_role_shares(user_id,provider,shared_roles,source_owner_id) VALUES($1,$2,$3,$4)
 ON CONFLICT(user_id,provider) DO UPDATE SET shared_roles=excluded.shared_roles,source_owner_id=excluded.source_owner_id,updated_at=now()`,
        [await adminLibrarySettingsOwner(user), provider, [...new Set(roles)], source || null],
    );
}
