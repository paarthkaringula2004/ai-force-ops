import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { PaceError } from "./epace/store";
export async function ticketBalance(user: string) {
    const member = await workspaceAccess(user);
    if (member.role === "admin") return { unlimited: true, balance: null };
    await db.query("SELECT award_membership_rewards($1)", [user]);
    const held = (
        await db.query(
            "SELECT EXISTS(SELECT 1 FROM payment_orders WHERE user_id=$1 AND mode='live' AND state='refund_review') OR EXISTS(SELECT 1 FROM membership_cycles c JOIN payment_subscriptions s ON s.id=c.subscription_id WHERE s.user_id=$1 AND c.mode='live' AND c.refund_review AND NOT c.refund_resolved) AS held",
            [user],
        )
    ).rows[0]?.held;
    const row = (await db.query("SELECT refresh_ticket_wallet($1) AS balance", [user])).rows[0];
    return {
        unlimited: false,
        paymentReview: !!held,
        balance: Number(row?.balance || 0),
        dailyAllowance: member.role === "employee" ? 50 : member.role === "manager" ? 100 : null,
        timezone: "Asia/Kolkata",
    };
}
export async function requireTickets(user: string) {
    const tickets = await ticketBalance(user);
    if (!tickets.unlimited && "paymentReview" in tickets && tickets.paymentReview)
        throw new PaceError(
            "Ticket spending is paused pending payment refund review. Contact an Admin.",
            402,
        );
    if (!tickets.unlimited && Number(tickets.balance) <= 0)
        throw new PaceError(
            "No tickets remain. Staff can ask an Admin to top up their balance.",
            402,
        );
}
