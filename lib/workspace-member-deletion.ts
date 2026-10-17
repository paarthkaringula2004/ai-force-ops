import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { permitted } from "./workspace-permissions";
import { MemberUpdateError } from "./workspace-members";
import { organizationWriteAllowed } from "./organization-security";

export async function deleteMemberInTransaction(
    client: PoolClient,
    actor: string,
    input: { userId: string; confirmation: string; updatedAt: string },
) {
    await organizationWriteAllowed(actor, client);
    if (
        !input ||
        typeof input.userId !== "string" ||
        typeof input.confirmation !== "string" ||
        typeof input.updatedAt !== "string"
    )
        throw new MemberUpdateError("Confirm the exact account email.", 400);
    await client.query("SELECT pg_advisory_xact_lock(8470220029)");
    const acting = (
        await client.query("SELECT * FROM workspace_members WHERE user_id=$1 FOR UPDATE", [actor])
    ).rows[0];
    if (!acting || !permitted(acting, "admin"))
        throw new MemberUpdateError("Active Admin access required.", 403);
    if (actor === input.userId)
        throw new MemberUpdateError("You cannot delete your own account.", 409);
    const target = (
        await client.query(
            'SELECT m.*,u.email FROM workspace_members m JOIN "user" u ON u.id=m.user_id WHERE m.user_id=$1 FOR UPDATE OF m,u',
            [input.userId],
        )
    ).rows[0];
    if (!target) throw new MemberUpdateError("Account not found.", 404);
    if (input.confirmation !== target.email)
        throw new MemberUpdateError("Type the exact account email to confirm deletion.", 400);
    if (input.updatedAt !== new Date(target.updated_at).toISOString())
        throw new MemberUpdateError("The account changed. Refresh and review it again.", 409);
    if (
        target.role === "admin" &&
        target.active &&
        !(
            await client.query(
                "SELECT 1 FROM workspace_members WHERE role='admin' AND active AND user_id<>$1",
                [input.userId],
            )
        ).rowCount
    )
        throw new MemberUpdateError("Keep at least one active Admin.", 409);
    if (
        (
            await client.query("SELECT 1 FROM organization_workspace WHERE owner_id=$1", [
                input.userId,
            ])
        ).rowCount
    )
        throw new MemberUpdateError(
            "Transfer the shared integration owner to another Admin before deleting this account.",
            409,
        );
    if (
        (
            await client.query(
                "SELECT 1 FROM mail_outbox WHERE (actor_id=$1 OR lower(recipient)=lower($2)) AND status='sending' AND lease_until>now()",
                [input.userId, target.email],
            )
        ).rowCount
    )
        throw new MemberUpdateError(
            "An email is being delivered for this account. Try again after delivery completes.",
            409,
        );
    if (
        (
            await client.query(
                "SELECT 1 FROM payment_orders WHERE user_id=$1 UNION ALL SELECT 1 FROM payment_subscriptions WHERE user_id=$1 LIMIT 1",
                [input.userId],
            )
        ).rowCount
    )
        throw new MemberUpdateError(
            "This account has payment records. Retain it until payment and financial-retention review is complete.",
            409,
        );
    // Explicit cleanup for records that deliberately do not cascade from the login.
    await client.query("DELETE FROM mail_outbox WHERE actor_id=$1 OR lower(recipient)=lower($2)", [
        input.userId,
        target.email,
    ]);
    await client.query("DELETE FROM organization_security_events WHERE actor_id=$1", [
        input.userId,
    ]);
    await client.query("DELETE FROM organization_request_windows WHERE subject=$1", [input.userId]);
    await client.query("DELETE FROM workspace_audit WHERE actor_id=$1 OR target_id=$1", [
        input.userId,
    ]);
    await client.query(
        "DELETE FROM verification WHERE identifier=$1 OR identifier=ANY($2::text[]) OR starts_with(identifier,'change-email-otp-'||$1||'-') OR (value=$3 AND starts_with(identifier,'reset-password:'))",
        [
            target.email,
            [
                "email-verification-otp-" + target.email,
                "sign-in-otp-" + target.email,
                "forget-password-otp-" + target.email,
            ],
            input.userId,
        ],
    );
    await client.query(
        "DELETE FROM workspace_chat_actions WHERE draft->'update'->>'userId'=$1 OR draft->>'email'=$2 OR draft->'decision'->>'id' IN (SELECT id::text FROM employee_service_requests WHERE user_id=$1)",
        [input.userId, target.email],
    );
    // FK cascades remove sessions, credentials, agents, tools, knowledge, requests,
    // tickets, ePACE/eAssist records and review/security data. Other people's
    // reporting-manager and reviewer references become NULL, not deleted accounts.
    await client.query('DELETE FROM "user" WHERE id=$1', [input.userId]);
    await client.query(
        "INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'member.deleted',$3::jsonb)",
        [randomUUID(), actor, JSON.stringify({ deletedRole: target.role, dataRemoved: true })],
    );
    return {
        deleted: true,
        notice: "Account and its stored application data permanently deleted.",
    };
}
