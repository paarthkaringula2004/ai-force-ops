import { db } from "./db";
import { InputError } from "./eassist/transport";

// Checked against current membership on every read and acknowledgement.
const scope = `viewer.active AND r.user_id<>viewer.user_id AND (
 viewer.role='admin' OR (viewer.role='manager' AND owner.manager_id=viewer.user_id
 AND r.kind<>'ticket_topup' AND NOT(r.kind='leave' AND owner.role='manager')))`;
const sources = `employee_service_requests r JOIN workspace_members owner ON owner.user_id=r.user_id
 JOIN workspace_members viewer ON viewer.user_id=$1 JOIN "user" u ON u.id=r.user_id`;
export async function requestNotificationSnapshot(user: string) {
    const member = (
        await db.query("SELECT role,active FROM workspace_members WHERE user_id=$1", [user])
    ).rows[0];
    if (!member?.active || !["admin", "manager"].includes(member.role))
        throw new InputError("Request review access required.", 403);
    return (
        await db.query(
            `WITH eligible AS (
  SELECT r.id,r.request_number AS "requestNumber",r.kind,r.status,r.created_at AS "createdAt",r.updated_at,u.name AS "senderName"
  FROM ${sources} WHERE ${scope}
 ), unread AS (SELECT e.* FROM eligible e WHERE e.status='pending_approval'
  AND NOT EXISTS(SELECT 1 FROM request_notification_receipts seen WHERE seen.user_id=$1 AND seen.request_id=e.id)
 ), first_page AS (SELECT * FROM unread ORDER BY "createdAt",id LIMIT 20)
 SELECT (extract(epoch FROM clock_timestamp())*1000000)::bigint::text AS cursor, (SELECT count(*)::int FROM unread) AS "unreadCount",
 (SELECT max(updated_at)::text FROM eligible) AS revision,
 COALESCE(jsonb_agg(jsonb_build_object('id',id,'requestNumber',"requestNumber",'kind',kind,'createdAt',"createdAt",'senderName',"senderName") ORDER BY "createdAt",id),'[]'::jsonb) AS notifications FROM first_page`,
            [user],
        )
    ).rows[0];
}
export async function dismissRequestNotification(user: string, id: unknown) {
    if (
        typeof id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
    )
        throw new InputError("Invalid notification.");
    const result = await db.query(
        `INSERT INTO request_notification_receipts(user_id,request_id)
 SELECT $1,r.id FROM ${sources} WHERE ${scope} AND r.id=$2
 ON CONFLICT(user_id,request_id) DO UPDATE SET dismissed_at=now() RETURNING request_id`,
        [user, id],
    );
    if (!result.rowCount) throw new InputError("This request is no longer available to you.", 403);
}
