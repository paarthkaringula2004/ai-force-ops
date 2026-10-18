import { db } from "./db";

// Resolve storage ownership without changing who is signed in. Personal reads,
// usage, audit events and confirmation tokens continue to use the acting user.
export async function agentLibraryOwner(actor: string, agentId: string) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(agentId)) return actor;
    const result = await db.query<{ user_id: string }>(
        "SELECT user_id FROM agents WHERE id=$2 AND admin_library_access($1,user_id)",
        [actor, agentId],
    );
    return result.rows[0]?.user_id || actor;
}

export async function toolLibraryOwner(actor: string, toolId: string) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(toolId)) return actor;
    const result = await db.query<{ user_id: string }>(
        "SELECT user_id FROM tools WHERE id=$2 AND admin_library_access($1,user_id)",
        [actor, toolId],
    );
    return result.rows[0]?.user_id || actor;
}

export async function adminLibrarySettingsOwner(actor: string) {
    const result = await db.query<{ owner_id: string }>(
        `SELECT o.owner_id FROM organization_workspace o
         JOIN workspace_members caller ON caller.user_id=$1 AND caller.active AND caller.role='admin'
         JOIN workspace_members owner ON owner.user_id=o.owner_id AND owner.role='admin'
         WHERE o.id=true`, [actor],
    );
    return result.rows[0]?.owner_id || actor;
}
