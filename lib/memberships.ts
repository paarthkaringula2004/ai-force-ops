import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { organizationWriteAllowed } from "./organization-security";
import { unseal } from "./eassist/transport";
import { razorpay, PaymentError, type PaymentConfig } from "./payment-provider";
import { MEMBERSHIP_PLANS, type MembershipPlan } from "./membership-plans";

type Subscription = {
    id: string;
    user_id: string;
    configuration_id: string;
    plan: MembershipPlan;
    provider_plan_id: string;
    provider_id: string | null;
    checkout_url: string | null;
    status: string;
    mode: "test" | "live";
    total_cycles: number;
    cancel_requested: boolean;
};
const validId = (v: unknown): v is string =>
    typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
async function config(id: string) {
    const c = (
        await db.query<PaymentConfig>("SELECT * FROM payment_configurations WHERE id=$1", [id])
    ).rows[0];
    if (!c) throw new PaymentError("Membership configuration unavailable.", 503);
    return c;
}
async function access(user: string) {
    const m = await workspaceAccess(user);
    if (!m.active)
        throw new PaymentError("Membership billing is unavailable to this account.", 403);
    return m;
}
export async function validateMembershipPlans(c: PaymentConfig, bindings: unknown) {
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings))
        throw new PaymentError("Supply membership Plan IDs as an object.");
    const result: Record<string, string> = {};
    for (const key of Object.keys(MEMBERSHIP_PLANS) as MembershipPlan[]) {
        const id = (bindings as Record<string, unknown>)[key];
        if (id == null || id === "") continue;
        if (typeof id !== "string" || !/^plan_[A-Za-z0-9]{1,100}$/.test(id))
            throw new PaymentError("Enter a valid Razorpay Plan ID for " + key + ".");
        const p = await razorpay(c, "/plans/" + id),
            expected = MEMBERSHIP_PLANS[key],
            item = p.item as Record<string, unknown> | undefined;
        if (
            p.id !== id ||
            item?.amount !== expected.price * 100 ||
            item?.currency !== "INR" ||
            !(
                (p.period === "daily" && p.interval === expected.days) ||
                (expected.days === 7 && p.period === "weekly" && p.interval === 1)
            )
        )
            throw new PaymentError(
                `${expected.name}: Razorpay plan must charge INR ${expected.price} every ${expected.days} days. No plan was saved.`,
            );
        result[key] = id;
    }
    return result;
}
export async function membershipState(user: string) {
    await access(user);
    const rows = (
        await db.query(
            "SELECT id,plan,mode,status,total_cycles,provider_id,cancel_requested,created_at FROM payment_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
            [user],
        )
    ).rows;
    const cycles = (
        await db.query(
            "SELECT c.id,c.subscription_id,c.mode,c.starts_at,c.ends_at,c.instant,c.daily,c.days,c.awarded_days,c.refund_review FROM membership_cycles c JOIN payment_subscriptions s ON s.id=c.subscription_id WHERE s.user_id=$1 ORDER BY c.starts_at DESC LIMIT 30",
            [user],
        )
    ).rows;
    return { subscriptions: rows, cycles };
}
function checkoutUrl(value: unknown) {
    if (typeof value !== "string")
        throw new PaymentError("Razorpay did not return a membership checkout link.", 502);
    let u: URL;
    try {
        u = new URL(value);
    } catch {
        throw new PaymentError("Invalid membership checkout link.", 502);
    }
    if (u.protocol !== "https:" || u.hostname !== "rzp.io" || u.username || u.password)
        throw new PaymentError("Untrusted membership checkout link.", 502);
    return u.href;
}
export async function createMembership(user: string, b: Record<string, unknown>) {
    const m = await access(user);
    if (!["user", "admin"].includes(m.role))
        throw new PaymentError(
            "Staff tickets are allocated by the organization; new membership purchases are not available.",
            403,
        );
    await organizationWriteAllowed(user);
    if (
        !validId(b.requestId) ||
        typeof b.plan !== "string" ||
        !Object.hasOwn(MEMBERSHIP_PLANS, b.plan) ||
        !Number.isInteger(b.cycles) ||
        Number(b.cycles) < 1 ||
        Number(b.cycles) > 120 ||
        b.acceptRecurring !== true
    )
        throw new PaymentError(
            "Choose a plan, 1–120 billing cycles, and explicitly accept recurring charges.",
        );
    let c = (
        await db.query<PaymentConfig>(
            "SELECT c.* FROM payment_settings s JOIN payment_configurations c ON c.id=s.configuration_id WHERE s.id=true",
        )
    ).rows[0];
    if (!c?.enabled || !c.verified_at || !c.membership_plans?.[b.plan])
        throw new PaymentError("This membership plan is not configured and enabled.", 409);
    if (m.role === "admin" && c.mode === "live")
        throw new PaymentError(
            "Admin tickets are unlimited. Use a User account to purchase membership.",
        );
    const client = await db.connect();
    let local: Subscription;
    try {
        await client.query("BEGIN");
        const current = (
            await client.query(
                "SELECT role,active FROM workspace_members WHERE user_id=$1 FOR UPDATE",
                [user],
            )
        ).rows[0];
        if (!current?.active || !["user", "admin"].includes(current.role))
            throw new PaymentError("Membership billing unavailable.", 403);
        await organizationWriteAllowed(user, client);
        const saved = (
            await client.query<PaymentConfig>(
                "SELECT c.* FROM payment_settings s JOIN payment_configurations c ON c.id=s.configuration_id WHERE s.id=true FOR SHARE OF s,c",
            )
        ).rows[0];
        if (!saved || saved.id !== c.id || !saved.enabled)
            throw new PaymentError("Membership integration changed. Refresh.", 409);
        c = saved;
        const prior = (
            await client.query<Subscription>("SELECT * FROM payment_subscriptions WHERE id=$1", [
                b.requestId,
            ])
        ).rows[0];
        if (prior) {
            if (prior.user_id !== user || prior.plan !== b.plan || prior.total_cycles !== b.cycles)
                throw new PaymentError("This request belongs to another membership attempt.", 409);
            throw new PaymentError(
                "This attempt already exists. Check membership history before retrying.",
                409,
            );
        }
        if (
            (
                await client.query(
                    "SELECT 1 FROM payment_subscriptions WHERE user_id=$1 AND mode=$2 AND status NOT IN('cancelled','completed','expired') LIMIT 1",
                    [user, c.mode],
                )
            ).rowCount
        )
            throw new PaymentError(
                "An active or unresolved membership already exists. Check or cancel it before creating another.",
                409,
            );
        if (
            Number(
                (
                    await client.query(
                        "SELECT count(*) FROM payment_subscriptions WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
                        [user],
                    )
                ).rows[0].count,
            ) >= 10
        )
            throw new PaymentError("Too many membership attempts. Try again later.", 429);
        local = (
            await client.query<Subscription>(
                "INSERT INTO payment_subscriptions(id,user_id,configuration_id,plan,provider_plan_id,mode,total_cycles) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
                [b.requestId, user, c.id, b.plan, c.membership_plans![b.plan], c.mode, b.cycles],
            )
        ).rows[0];
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
    try {
        const remote = await razorpay(c, "/subscriptions", "POST", {
            plan_id: local.provider_plan_id,
            total_count: local.total_cycles,
            quantity: 1,
            customer_notify: true,
            notes: { workspace_membership_id: local.id },
        });
        if (
            typeof remote.id !== "string" ||
            !/^sub_[A-Za-z0-9]+$/.test(remote.id) ||
            remote.plan_id !== local.provider_plan_id
        )
            throw new PaymentError("Unexpected membership response.", 502);
        const url = checkoutUrl(remote.short_url);
        await db.query(
            "UPDATE payment_subscriptions SET provider_id=$2,checkout_url=$3,status='created',updated_at=now() WHERE id=$1",
            [local.id, remote.id, url],
        );
        return { id: local.id, url, mode: c.mode };
    } catch (e) {
        await db.query(
            "UPDATE payment_subscriptions SET status='unknown',updated_at=now() WHERE id=$1",
            [local.id],
        );
        throw e;
    }
}
async function settleInvoice(s: Subscription, c: PaymentConfig, invoice: Record<string, unknown>) {
    const plan = MEMBERSHIP_PLANS[s.plan];
    if (
        invoice.subscription_id !== s.provider_id ||
        typeof invoice.id !== "string" ||
        !/^inv_[A-Za-z0-9]+$/.test(invoice.id) ||
        typeof invoice.payment_id !== "string" ||
        !/^pay_[A-Za-z0-9]+$/.test(invoice.payment_id) ||
        invoice.status !== "paid" ||
        invoice.amount_paid !== plan.price * 100 ||
        invoice.currency !== "INR"
    )
        throw new PaymentError("Membership invoice does not match the paid plan.", 409);
    const existing = (
        await db.query(
            "SELECT subscription_id,provider_payment_id FROM membership_cycles WHERE provider_invoice_id=$1",
            [invoice.id],
        )
    ).rows[0];
    if (existing) {
        if (
            existing.subscription_id !== s.id ||
            existing.provider_payment_id !== invoice.payment_id
        )
            throw new PaymentError("Conflicting membership invoice.", 409);
        return;
    }
    const p = await razorpay(c, "/payments/" + invoice.payment_id);
    if (
        p.id !== invoice.payment_id ||
        p.invoice_id !== invoice.id ||
        p.amount !== plan.price * 100 ||
        p.currency !== "INR" ||
        !Number.isInteger(p.created_at) ||
        Number(p.created_at) < 1 ||
        Number(p.created_at) > Date.now() / 1000 + 300
    )
        throw new PaymentError("Membership payment does not match its invoice.", 409);
    if (Number(p.amount_refunded || 0) > 0 || p.status === "refunded") {
        await db.query(
            "UPDATE membership_cycles SET refund_review=true,refunded_amount=GREATEST(refunded_amount,$2) WHERE provider_payment_id=$1",
            [p.id, Number(p.amount_refunded || 0)],
        );
        return;
    }
    if (p.status !== "captured" || p.captured !== true)
        throw new PaymentError("Membership payment is not captured.", 409);
    const start = new Date(Number(p.created_at) * 1000),
        end = new Date(start.getTime() + plan.days * 86400000),
        client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT user_id FROM ticket_wallets WHERE user_id=$1 FOR UPDATE", [
            s.user_id,
        ]);
        const row = (
            await client.query(
                "INSERT INTO membership_cycles(id,subscription_id,provider_payment_id,provider_invoice_id,mode,starts_at,ends_at,days,instant,daily) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id",
                [
                    randomUUID(),
                    s.id,
                    p.id,
                    invoice.id,
                    s.mode,
                    start,
                    end,
                    plan.days,
                    plan.instant,
                    plan.daily,
                ],
            )
        ).rows[0];
        if (row && s.mode === "live") {
            const wallet = await client.query(
                "UPDATE ticket_wallets SET balance=balance+$2,paid_balance=paid_balance+$2,updated_at=now() WHERE user_id=$1",
                [s.user_id, plan.instant],
            );
            if (wallet.rowCount !== 1)
                throw new PaymentError("Membership wallet unavailable.", 503);
            await client.query(
                "INSERT INTO ticket_ledger(id,user_id,amount,kind,membership_cycle_id) VALUES($1,$2,$3,'membership',$4)",
                [randomUUID(), s.user_id, plan.instant, row.id],
            );
            await client.query("SELECT award_membership_rewards($1)", [s.user_id]);
        }
        if (row)
            await client.query(
                "INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'membership.payment_verified',$3::jsonb)",
                [
                    randomUUID(),
                    s.user_id,
                    JSON.stringify({ subscriptionId: s.id, mode: s.mode, invoiceId: invoice.id }),
                ],
            );
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}
async function sync(s: Subscription, c: PaymentConfig) {
    if (!s.provider_id)
        throw new PaymentError(
            "Provider subscription creation is unconfirmed. Review Razorpay before retrying.",
            409,
        );
    const remote = await razorpay(c, "/subscriptions/" + s.provider_id);
    if (
        remote.id !== s.provider_id ||
        remote.plan_id !== s.provider_plan_id ||
        remote.quantity !== 1 ||
        ![
            "created",
            "authenticated",
            "active",
            "pending",
            "halted",
            "cancelled",
            "completed",
            "expired",
        ].includes(String(remote.status))
    )
        throw new PaymentError("Unexpected provider subscription.", 502);
    await db.query("UPDATE payment_subscriptions SET status=$2,updated_at=now() WHERE id=$1", [
        s.id,
        remote.status,
    ]);
    for (const skip of [0, 100]) {
        const invoices = await razorpay(
            c,
            `/invoices?subscription_id=${s.provider_id}&count=100&skip=${skip}`,
        );
        if (!Array.isArray(invoices.items))
            throw new PaymentError("Invalid membership invoice collection.", 502);
        for (const invoice of invoices.items) {
            if (invoice?.status === "paid") await settleInvoice(s, c, invoice);
        }
        if (invoices.items.length < 100) break;
    }
    return { id: s.id, status: remote.status };
}
export async function checkMembership(user: string, id: unknown) {
    await access(user);
    if (!validId(id)) throw new PaymentError("Choose a membership.");
    const s = (
        await db.query<Subscription>(
            "SELECT * FROM payment_subscriptions WHERE id=$1 AND user_id=$2",
            [id, user],
        )
    ).rows[0];
    if (!s) throw new PaymentError("Membership not found.", 404);
    return sync(s, await config(s.configuration_id));
}
export async function recoverMembership(user: string, b: Record<string, unknown>) {
    await access(user);
    await organizationWriteAllowed(user);
    if (
        !validId(b.id) ||
        typeof b.providerId !== "string" ||
        !/^sub_[A-Za-z0-9]{1,100}$/.test(b.providerId)
    )
        throw new PaymentError("Enter the subscription ID shown in Razorpay.");
    const s = (
        await db.query<Subscription>(
            "SELECT * FROM payment_subscriptions WHERE id=$1 AND user_id=$2",
            [b.id, user],
        )
    ).rows[0];
    if (!s || s.status !== "unknown" || s.provider_id)
        throw new PaymentError("This membership does not need recovery.", 409);
    const c = await config(s.configuration_id),
        p = await razorpay(c, "/subscriptions/" + b.providerId),
        notes = p.notes as Record<string, unknown> | undefined;
    if (
        p.id !== b.providerId ||
        p.plan_id !== s.provider_plan_id ||
        p.total_count !== s.total_cycles ||
        p.quantity !== 1 ||
        notes?.workspace_membership_id !== s.id
    )
        throw new PaymentError("The provider subscription does not match this attempt.", 409);
    const updated = await db.query(
        "UPDATE payment_subscriptions SET provider_id=$2,status='created',updated_at=now() WHERE id=$1 AND provider_id IS NULL AND status='unknown'",
        [s.id, b.providerId],
    );
    if (updated.rowCount !== 1) throw new PaymentError("Membership changed. Refresh.", 409);
    return sync({ ...s, provider_id: b.providerId }, c);
}
export async function cancelMembership(user: string, b: Record<string, unknown>) {
    await access(user);
    await organizationWriteAllowed(user);
    if (!validId(b.id) || b.confirm !== true)
        throw new PaymentError("Confirm cancellation of this membership.");
    const s = (
        await db.query<Subscription>(
            "SELECT * FROM payment_subscriptions WHERE id=$1 AND user_id=$2",
            [b.id, user],
        )
    ).rows[0];
    if (!s?.provider_id)
        throw new PaymentError(
            "Membership unavailable. Review unresolved attempts in Razorpay.",
            409,
        );
    const c = await config(s.configuration_id),
        before = await sync(s, c);
    if (["cancelled", "completed", "expired"].includes(String(before.status)) || s.cancel_requested)
        return { id: s.id, status: before.status };
    const result = await razorpay(c, "/subscriptions/" + s.provider_id + "/cancel", "POST", {
        cancel_at_cycle_end: before.status === "active" ? 1 : 0,
    });
    if (result.id !== s.provider_id || !["active", "cancelled"].includes(String(result.status)))
        throw new PaymentError(
            "Cancellation is not confirmed. Check membership before retrying.",
            502,
        );
    await db.query(
        "UPDATE payment_subscriptions SET cancel_requested=true,status=$2,updated_at=now() WHERE id=$1",
        [s.id, result.status],
    );
    await db.query(
        "INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'membership.cancellation_requested',$3::jsonb)",
        [randomUUID(), user, JSON.stringify({ subscriptionId: s.id, mode: s.mode })],
    );
    return { id: s.id, status: result.status };
}
export async function membershipWebhook(
    raw: string,
    signature: string,
    b: Record<string, unknown>,
) {
    const payload = b.payload as Record<string, { entity?: Record<string, unknown> }> | undefined;
    const provider = payload?.subscription?.entity?.id;
    if (typeof provider !== "string" || !/^sub_[A-Za-z0-9]+$/.test(provider))
        throw new PaymentError("Missing membership subscription.");
    const s = (
        await db.query<Subscription>("SELECT * FROM payment_subscriptions WHERE provider_id=$1", [
            provider,
        ])
    ).rows[0];
    if (!s) throw new PaymentError("Membership not found.", 404);
    const c = await config(s.configuration_id),
        expected = createHmac("sha256", unseal(c.webhook_cipher)).update(raw).digest();
    if (
        !/^[a-f0-9]{64}$/i.test(signature) ||
        !timingSafeEqual(expected, Buffer.from(signature, "hex"))
    )
        throw new PaymentError("Invalid membership webhook signature.");
    // Reconcile invoice IDs from the authenticated provider, never credit webhook amounts.
    const result = await sync(s, c);
    await db.query("UPDATE payment_configurations SET webhook_verified_at=now() WHERE id=$1", [
        c.id,
    ]);
    return result;
}
export async function membershipRefund(raw: string, signature: string, payment: string) {
    const cycle = (
        await db.query(
            "SELECT c.id,s.configuration_id,s.mode,s.plan FROM membership_cycles c JOIN payment_subscriptions s ON s.id=c.subscription_id WHERE c.provider_payment_id=$1",
            [payment],
        )
    ).rows[0];
    if (!cycle)
        throw new PaymentError(
            "Refund payment is not recorded locally. Review it in Razorpay.",
            404,
        );
    const c = await config(cycle.configuration_id),
        expected = createHmac("sha256", unseal(c.webhook_cipher)).update(raw).digest();
    if (
        !/^[a-f0-9]{64}$/i.test(signature) ||
        !timingSafeEqual(expected, Buffer.from(signature, "hex"))
    )
        throw new PaymentError("Invalid refund signature.");
    const p = await razorpay(c, "/payments/" + payment);
    if (
        p.id !== payment ||
        p.currency !== "INR" ||
        p.amount !== MEMBERSHIP_PLANS[cycle.plan as MembershipPlan].price * 100 ||
        !Number.isInteger(p.amount_refunded) ||
        Number(p.amount_refunded) <= 0 ||
        Number(p.amount_refunded) > Number(p.amount)
    )
        throw new PaymentError("Membership refund is not confirmed.", 409);
    await db.query(
        "UPDATE membership_cycles SET refund_review=true,refund_resolved=(GREATEST(refunded_amount,$2)<=resolved_refund_amount),refunded_amount=GREATEST(refunded_amount,$2) WHERE id=$1",
        [cycle.id, Number(p.amount_refunded)],
    );
    return { review: true };
}
