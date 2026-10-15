import { db } from '@/lib/db';
import type { WorkspaceAccess } from './workspace-permissions';
export async function workspaceAccess(user: string): Promise<WorkspaceAccess> {
 const row = (await db.query(`SELECT m.*, u.name AS manager_name,verifier.name AS employment_verified_by_name FROM workspace_members m LEFT JOIN "user" u ON u.id=m.manager_id LEFT JOIN "user" verifier ON verifier.id=m.employment_verified_by WHERE m.user_id=$1`, [user])).rows[0];
 if(!row) throw new Error('Workspace membership unavailable. Apply migrations.');
 return row;
}
