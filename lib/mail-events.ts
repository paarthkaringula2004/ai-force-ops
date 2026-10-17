import type { PoolClient } from "pg";
import { mailConfigured, queueMail } from "./mail";
import { leaveMail } from "./mail-templates";
export async function queueLeaveEvent(client: PoolClient, id: string) {
    if (!mailConfigured()) return;
    const row = (
        await client.query(
            `SELECT r.*,u.name,u.email,m.manager_id,m.role AS requester_role,decider.name AS reviewer FROM employee_service_requests r JOIN "user" u ON u.id=r.user_id JOIN workspace_members m ON m.user_id=r.user_id LEFT JOIN "user" decider ON decider.id=r.decided_by WHERE r.id=$1 AND r.kind='leave'`,
            [id],
        )
    ).rows[0];
    if (!row) return;
    const status =
        (
            {
                pending_approval: "Pending approval",
                approved: "Approved",
                rejected: "Rejected",
                cancelled: "Cancelled",
                fulfilled: "Fulfilled",
            } as Record<string, string>
        )[row.status] || row.status;
    const data = {
        name: row.name,
        number: row.request_number,
        status,
        dates: String(row.details.dates || "See request details"),
        reviewer: row.reviewer || undefined,
        subject: row.details.leaveMailSubject,
        body: row.details.leaveMailBody,
        paidDays: row.details.paidDays,
        unpaidDays: row.details.unpaidDays,
    };
    const version = new Date(row.updated_at).toISOString();
    await queueMail(
        "leave",
        row.email,
        leaveMail({ ...data, review: false }),
        `leave:${id}:${version}:owner`,
        { client, actor: row.decided_by || row.user_id },
    );
    if (row.status === "pending_approval") {
        const recipients = (
            await client.query(
                `SELECT u.email FROM workspace_members m JOIN "user" u ON u.id=m.user_id WHERE m.active AND m.user_id<>$1 AND (($3<>'manager' AND m.role='manager' AND m.user_id=$2) OR (m.role='admin' AND ($3='manager' OR NOT EXISTS(SELECT 1 FROM workspace_members WHERE user_id=$2 AND role='manager' AND active))))`,
                [row.user_id, row.manager_id, row.requester_role],
            )
        ).rows;
        for (const recipient of recipients)
            await queueMail(
                "leave",
                recipient.email,
                leaveMail({ ...data, review: true }),
                `leave:${id}:${version}:review:${recipient.email.toLowerCase()}`,
                { client, actor: row.user_id },
            );
    }
}
