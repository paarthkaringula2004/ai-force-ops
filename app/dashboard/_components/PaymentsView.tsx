"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
    Coins,
    Gift,
    PlugZap,
    RefreshCw,
    Settings2,
    ShieldCheck,
    ExternalLink,
    LoaderCircle,
} from "lucide-react";
import ThemedSelect from "@/components/themed-select";
import MembershipPlans from "./MembershipPlans";
import PaymentRefundReview from "./PaymentRefundReview";
import { MEMBERSHIP_PLANS, type MembershipPlan } from "@/lib/membership-plans";
import { TICKET_PACKS } from "@/lib/model-pricing";
type Integration = {
    id?: string;
    mode: "test" | "live";
    enabled: boolean;
    verifiedAt: string | null;
    keyId?: string;
    publicOrigin?: string;
    businessName?: string;
    hasKeySecret?: boolean;
    hasWebhookSecret?: boolean;
    webhookVerifiedAt?: string | null;
    membershipPlans?: Record<string, string>;
    merchantPolicies?: Record<string, string>;
    liveAcknowledgedAt?: string | null;
};
type Order = {
    id: string;
    tickets: number;
    amount: number;
    mode: string;
    state: string;
    created_at: string;
    provider_order_id: string | null;
    checked_at?: string | null;
    refunded_amount?: number;
};
type Subscription = {
    id: string;
    plan: MembershipPlan;
    mode: string;
    status: string;
    total_cycles: number;
    provider_id: string | null;
    cancel_requested: boolean;
};
type Cycle = {
    id: string;
    subscription_id: string;
    starts_at: string;
    ends_at: string;
    instant: number;
    daily: number;
    awarded_days: number;
    mode: string;
    refund_review: boolean;
};
type State = {
    canPurchase: boolean;
    merchantPolicies: Record<string, string>;
    memberships: { subscriptions: Subscription[]; cycles: Cycle[] };
    availableMemberships: string[];
    readiness?: {
        apiVerified: boolean;
        webhookObserved: boolean;
        liveEnabled: boolean;
        membershipBilling: boolean;
    };
    canConfigure: boolean;
    unlimited: boolean;
    integration: Integration | null;
    orders: Order[];
    wallet: { unlimited: boolean; balance: number | null };
};
type Checkout = { id: string; mode: string; action: string; fields: Record<string, string> };
const card = "rounded-2xl border border-[#e7e9ef] bg-white p-5 shadow-sm";
const input =
    "h-11 w-full rounded-xl border border-[#dfe2e9] bg-white px-3 text-sm outline-none focus:border-[#6255e8] focus:ring-2 focus:ring-[#6255e8]/15";
const button =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#6255e8] px-4 text-sm font-semibold text-white hover:bg-[#5146d2] disabled:cursor-not-allowed disabled:opacity-50";
const status = (order: Order) =>
    order.state === "refund_review"
        ? "Refund received — Admin review required"
        : order.state === "refunded"
          ? "Refund recorded"
          : order.state === "failed"
            ? "Payment failed — no tickets credited"
            : order.state === "paid"
              ? "Tickets credited"
              : order.state === "test_paid"
                ? "Test completed — no tickets credited"
                : order.state === "unknown"
                  ? "Order creation unconfirmed"
                  : order.state === "creating"
                    ? "Creating order"
                    : "Awaiting captured payment";
export default function PaymentsView() {
    const [data, setData] = useState<State | null>(null),
        [section, setSection] = useState<"topup" | "membership" | "integration">("topup"),
        [loading, setLoading] = useState(true),
        [busy, setBusy] = useState(""),
        [error, setError] = useState(""),
        [notice, setNotice] = useState(""),
        [checkout, setCheckout] = useState<Checkout | null>(null);
    const [recovery, setRecovery] = useState<Record<string, string>>({});
    const [contact, setContact] = useState(""),
        [membershipCheckout, setMembershipCheckout] = useState<{
            url: string;
            mode: string;
        } | null>(null),
        [cancelId, setCancelId] = useState<string | null>(null);
    const [form, setForm] = useState({
        mode: "test",
        keyId: "",
        keySecret: "",
        webhookSecret: "",
        publicOrigin: "",
        businessName: "AIForce.Ops",
        enabled: false,
        membershipPlans: { monthly: "", weekly: "", lite: "" },
        merchantPolicies: { termsUrl: "", privacyUrl: "", refundUrl: "", supportEmail: "" },
        liveAcknowledged: false,
    });
    function apply(value: State) {
        setData(value);
        const c = value.integration;
        setForm({
            mode: c?.mode || "test",
            keyId: c?.keyId || "",
            keySecret: "",
            webhookSecret: "",
            publicOrigin: c?.publicOrigin || window.location.origin,
            businessName: c?.businessName || "AIForce.Ops",
            enabled: c?.enabled || false,
            membershipPlans: {
                monthly: c?.membershipPlans?.monthly || "",
                weekly: c?.membershipPlans?.weekly || "",
                lite: c?.membershipPlans?.lite || "",
            },
            merchantPolicies: {
                termsUrl: c?.merchantPolicies?.termsUrl || "",
                privacyUrl: c?.merchantPolicies?.privacyUrl || "",
                refundUrl: c?.merchantPolicies?.refundUrl || "",
                supportEmail: c?.merchantPolicies?.supportEmail || "",
            },
            liveAcknowledged: false,
        });
    }
    async function refresh() {
        try {
            const r = await fetch("/api/payments", { cache: "no-store" }),
                d = await r.json();
            if (!r.ok) throw Error(d.error);
            apply(d);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load payments.");
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/payments", { cache: "no-store", signal: controller.signal })
            .then(async (r) => {
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                if (!controller.signal.aborted) apply(d);
            })
            .catch((e) => {
                if (!controller.signal.aborted)
                    setError(e instanceof Error ? e.message : "Could not load payments.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, []);
    async function post(path: string, body: unknown) {
        const r = await fetch(path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }),
            d = await r.json();
        if (!r.ok) throw Error(d.error || "Payment request failed.");
        return d;
    }
    async function save(e: FormEvent) {
        e.preventDefault();
        setCheckout(null);
        setMembershipCheckout(null);
        setBusy("save");
        setError("");
        setNotice("");
        try {
            await post("/api/payments/configuration", {
                ...form,
                revision: data?.integration?.id || null,
            });
            setNotice(
                "API credentials verified and integration saved. Add the webhook URL and selected events in Razorpay to complete delivery setup.",
            );
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save the integration.");
        } finally {
            setBusy("");
        }
    }
    async function pause() {
        setCheckout(null);
        setMembershipCheckout(null);
        setBusy("pause");
        try {
            await post("/api/payments/configuration", {
                action: "pause",
                revision: data?.integration?.id || null,
            });
            setNotice(
                "New checkouts are paused. Existing captured payments can still be verified.",
            );
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not pause checkout.");
        } finally {
            setBusy("");
        }
    }
    async function buy(tickets: number) {
        setCheckout(null);
        setNotice("");
        setBusy(String(tickets));
        setError("");
        try {
            const result = await post("/api/payments/orders", {
                tickets,
                contact,
                requestId: crypto.randomUUID(),
            });
            await refresh();
            setCheckout(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not prepare checkout.");
            await refresh();
        } finally {
            setBusy("");
        }
    }
    async function check(id: string) {
        setBusy(id);
        setError("");
        try {
            const result = await post("/api/payments/orders", { action: "check", id });
            setNotice(
                result.state === "paid"
                    ? "Captured payment verified; tickets credited."
                    : result.state === "refund_review"
                      ? "Refund confirmed. An Admin must reconcile the ticket adjustment."
                      : result.state === "refunded"
                        ? "Refund recorded; no new tickets credited."
                        : result.state === "failed"
                          ? "The payment failed. No tickets were added."
                          : result.state === "test_paid"
                            ? "Test payment verified. No spendable tickets were added."
                            : "No captured payment has been confirmed yet. You can check again later.",
            );
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Payment could not be verified.");
        } finally {
            setBusy("");
        }
    }
    async function subscribe(plan: MembershipPlan, cycles: number) {
        setBusy("membership");
        setError("");
        setNotice("");
        setMembershipCheckout(null);
        try {
            const result = await post("/api/payments/memberships", {
                plan,
                cycles,
                acceptRecurring: true,
                requestId: crypto.randomUUID(),
            });
            await refresh();
            setMembershipCheckout(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not prepare membership.");
            await refresh();
        } finally {
            setBusy("");
        }
    }
    async function membershipAction(id: string, action: "check" | "cancel") {
        setBusy(id);
        setError("");
        try {
            await post("/api/payments/memberships", { id, action, confirm: action === "cancel" });
            setNotice(
                action === "cancel"
                    ? "Cancellation request confirmed. Any paid-cycle rewards remain available until that cycle ends unless refunded."
                    : "Membership reconciled with Razorpay. Test payments do not grant spendable rewards.",
            );
            setCancelId(null);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Membership action failed.");
        } finally {
            setBusy("");
        }
    }
    async function recover(id: string, membership = false) {
        setBusy(id);
        setError("");
        try {
            await post(membership ? "/api/payments/memberships" : "/api/payments/orders", {
                action: "recover",
                id,
                providerId: recovery[id] || "",
            });
            setNotice(
                "Provider reference verified and recovered. Review the updated payment status.",
            );
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Recovery failed.");
        } finally {
            setBusy("");
        }
    }
    const integration = data?.integration,
        ready = !!integration?.enabled && !!integration.verifiedAt;
    const base = form.publicOrigin.replace(/\/$/, "");
    return (
        <div className="min-h-full bg-[#f7f8fb] text-[#202631]">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7e9ef] bg-white px-6 py-6">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#6255e8]">
                        Plans & balance
                    </p>
                    <h1 className="mt-1 text-3xl font-semibold">Payments</h1>
                    <p className="mt-2 text-sm text-slate-500">
                        100 tickets = ₹80 · 1 ticket = ₹0.80.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {data?.canConfigure && (
                        <button
                            className={button}
                            onClick={() => {
                                setSection("integration");
                                setCheckout(null);
                                setMembershipCheckout(null);
                            }}
                        >
                            <Settings2 size={17} />
                            Payment integration
                        </button>
                    )}
                    <div className="rounded-xl border bg-[#fafbfc] px-4 py-2">
                        <p className="text-xs text-slate-500">Ticket balance</p>
                        <p className="font-semibold">
                            {data?.wallet.unlimited
                                ? "Unlimited"
                                : (data?.wallet.balance?.toLocaleString() ?? "—")}{" "}
                            <span className="text-xs text-[#6255e8]">TICKETS</span>
                        </p>
                    </div>
                </div>
            </header>
            <div className="mx-auto grid max-w-[1500px] md:grid-cols-[220px_minmax(0,1fr)]">
                <aside className="border-r border-[#e7e9ef] bg-white p-4">
                    <p className="px-3 py-3 text-xs tracking-widest text-slate-400">
                        PAYMENT OPTIONS
                    </p>
                    {[
                        { id: "topup" as const, label: "Tickets top-up", Icon: Coins },
                        { id: "membership" as const, label: "Membership", Icon: Gift },
                        ...(data?.canConfigure
                            ? [{ id: "integration" as const, label: "Integration", Icon: PlugZap }]
                            : []),
                    ].map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => {
                                setSection(id);
                                setCheckout(null);
                                setMembershipCheckout(null);
                                setNotice("");
                            }}
                            className={`mb-2 flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold ${section === id ? "border-[#dedbff] bg-[#efedff] text-[#6255e8]" : "border-transparent text-slate-600 hover:bg-slate-50"}`}
                        >
                            <Icon size={19} />
                            {label}
                        </button>
                    ))}
                    <p className="mt-7 border-t pt-4 text-xs leading-6 text-slate-500">
                        {!integration
                            ? "Not configured. An Admin can connect Razorpay when the account and API keys are ready."
                            : !ready
                              ? "Checkout paused. Configure and enable the integration to accept new payments."
                              : integration.mode === "test"
                                ? "Test mode. No real money or spendable ticket credit."
                                : "Razorpay checkout enabled. Tickets are added after capture is verified."}
                    </p>
                </aside>
                <main className="min-w-0 space-y-5 p-5 lg:p-8">
                    {error && (
                        <p
                            role="alert"
                            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
                        >
                            {error}
                        </p>
                    )}
                    {notice && (
                        <p
                            role="status"
                            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                        >
                            {notice}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold">
                            {section === "integration"
                                ? "Payment integration"
                                : section === "membership"
                                  ? "Membership"
                                  : "Ticket top-up"}
                        </h2>
                        <button
                            className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm"
                            disabled={loading || !!busy}
                            onClick={() => {
                                setCheckout(null);
                                setMembershipCheckout(null);
                                setError("");
                                setLoading(true);
                                void refresh();
                            }}
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                            Refresh
                        </button>
                    </div>
                    {loading && !data ? (
                        <p role="status">Loading payment configuration…</p>
                    ) : section === "integration" && data?.canConfigure ? (
                        <section className={card}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold">
                                        Razorpay · Hosted checkout
                                    </h3>
                                    <p className="mt-1 text-sm leading-6 text-slate-500">
                                        Add your details once your Razorpay account is ready.
                                        Secrets stay encrypted on the server.
                                    </p>
                                </div>
                                <span className="rounded-full bg-[#efedff] px-3 py-1 text-xs text-[#6255e8]">
                                    {!integration
                                        ? "Not configured"
                                        : ready
                                          ? `${integration.mode === "test" ? "Test" : "Live"} · API verified`
                                          : "Paused"}
                                </span>
                            </div>
                            <form onSubmit={save} className="mt-6 space-y-5">
                                <div className="grid gap-5 lg:grid-cols-2">
                                    <label className="space-y-2 text-sm">
                                        Mode
                                        <ThemedSelect
                                            className={input}
                                            value={form.mode}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    mode: e.target.value,
                                                    liveAcknowledged: false,
                                                    keyId: "",
                                                    keySecret: "",
                                                    webhookSecret: "",
                                                    enabled: false,
                                                    membershipPlans: {
                                                        monthly: "",
                                                        weekly: "",
                                                        lite: "",
                                                    },
                                                })
                                            }
                                        >
                                            <option value="test">Test — simulated payments</option>
                                            <option value="live">Live — real payments</option>
                                        </ThemedSelect>
                                    </label>
                                    <label className="space-y-2 text-sm">
                                        Business name
                                        <input
                                            className={input}
                                            required
                                            maxLength={100}
                                            value={form.businessName}
                                            onChange={(e) =>
                                                setForm({ ...form, businessName: e.target.value })
                                            }
                                        />
                                    </label>
                                    <label className="space-y-2 text-sm">
                                        Key ID
                                        <input
                                            className={input}
                                            required
                                            autoComplete="off"
                                            placeholder={`rzp_${form.mode}_…`}
                                            value={form.keyId}
                                            onChange={(e) =>
                                                setForm({ ...form, keyId: e.target.value })
                                            }
                                        />
                                    </label>
                                    <label className="space-y-2 text-sm">
                                        Key Secret
                                        <input
                                            className={input}
                                            type="password"
                                            autoComplete="new-password"
                                            required={
                                                !integration?.hasKeySecret ||
                                                form.keyId !== integration?.keyId
                                            }
                                            value={form.keySecret}
                                            placeholder={
                                                integration?.hasKeySecret
                                                    ? "Leave blank to keep saved secret"
                                                    : "From Razorpay → API Keys"
                                            }
                                            onChange={(e) =>
                                                setForm({ ...form, keySecret: e.target.value })
                                            }
                                        />
                                    </label>
                                    <label className="space-y-2 text-sm">
                                        Webhook secret
                                        <input
                                            className={input}
                                            type="password"
                                            autoComplete="new-password"
                                            minLength={16}
                                            required={
                                                !integration?.hasWebhookSecret ||
                                                form.keyId !== integration?.keyId
                                            }
                                            value={form.webhookSecret}
                                            placeholder={
                                                integration?.hasWebhookSecret
                                                    ? "Leave blank to keep saved secret"
                                                    : "Use the same secret in Razorpay webhooks"
                                            }
                                            onChange={(e) =>
                                                setForm({ ...form, webhookSecret: e.target.value })
                                            }
                                        />
                                    </label>
                                    <label className="space-y-2 text-sm">
                                        Application origin
                                        <input
                                            className={input}
                                            type="url"
                                            required
                                            placeholder="https://app.example.com"
                                            value={form.publicOrigin}
                                            onChange={(e) =>
                                                setForm({ ...form, publicOrigin: e.target.value })
                                            }
                                        />
                                    </label>
                                </div>
                                <fieldset className="rounded-xl border border-[#e7e9ef] p-4">
                                    <legend className="px-2 text-sm font-semibold">
                                        Membership Plan IDs · optional per plan
                                    </legend>
                                    <p className="mb-3 text-xs leading-6 text-slate-500">
                                        Create Razorpay plans matching these prices and exact
                                        periods. Use daily / interval 30 for Monthly and daily /
                                        interval 7 or weekly / interval 1 for Weekly plans. Saving
                                        verifies price, INR currency and period. Subscribe to
                                        subscription.authenticated, subscription.activated,
                                        subscription.charged, subscription.pending,
                                        subscription.halted, subscription.cancelled,
                                        subscription.completed and subscription.updated.
                                    </p>
                                    <div className="grid gap-3 lg:grid-cols-3">
                                        {(["monthly", "weekly", "lite"] as const).map((key) => (
                                            <label key={key} className="text-xs">
                                                {MEMBERSHIP_PLANS[key].name} · ₹
                                                {MEMBERSHIP_PLANS[key].price}
                                                <input
                                                    className={input + " mt-2"}
                                                    placeholder="plan_…"
                                                    value={form.membershipPlans[key]}
                                                    onChange={(e) =>
                                                        setForm({
                                                            ...form,
                                                            membershipPlans: {
                                                                ...form.membershipPlans,
                                                                [key]: e.target.value,
                                                            },
                                                        })
                                                    }
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                <p className="text-xs leading-6 text-slate-500">
                                    Live mode requires your public HTTPS application address.
                                    Localhost can be used for Test callbacks in your browser;
                                    webhooks require a publicly reachable HTTPS address. Set
                                    automatic payment capture in Razorpay.
                                </p>
                                <div className="grid gap-4 rounded-xl border border-[#e7e9ef] bg-[#fafaff] p-4 lg:grid-cols-2">
                                    <div>
                                        <p className="text-xs font-semibold text-[#6255e8]">
                                            Callback URL · generated
                                        </p>
                                        <code className="mt-2 block break-all text-xs">
                                            {base || "https://your-app.example"}
                                            /api/payments/callback
                                        </code>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-[#6255e8]">
                                            Webhook URL · copy to Razorpay
                                        </p>
                                        <code className="mt-2 block break-all text-xs">
                                            {base || "https://your-app.example"}
                                            /api/payments/webhook
                                        </code>
                                    </div>
                                    <p className="text-xs text-slate-600 lg:col-span-2">
                                        Subscribe to <strong>payment.captured</strong> and{" "}
                                        <strong>order.paid</strong>, <strong>payment.failed</strong>
                                        , <strong>refund.processed</strong>, and the subscription
                                        events listed below, using the webhook secret above. The
                                        webhook and callback are different endpoints.
                                    </p>
                                </div>
                                <fieldset className="rounded-xl border border-[#e7e9ef] p-4">
                                    <legend className="px-2 text-sm font-semibold">
                                        Organization payment policies
                                    </legend>
                                    <p className="mb-3 text-xs text-slate-500">
                                        Required before enabling Live payments. These links are
                                        displayed to customers.
                                    </p>
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        {(
                                            [
                                                {
                                                    key: "supportEmail",
                                                    label: "Payment support email",
                                                    type: "email",
                                                },
                                                {
                                                    key: "termsUrl",
                                                    label: "Terms URL",
                                                    type: "url",
                                                },
                                                {
                                                    key: "privacyUrl",
                                                    label: "Privacy URL",
                                                    type: "url",
                                                },
                                                {
                                                    key: "refundUrl",
                                                    label: "Refund policy URL",
                                                    type: "url",
                                                },
                                            ] as const
                                        ).map(({ key, label, type }) => (
                                            <label className="text-sm" key={key}>
                                                {label}
                                                <input
                                                    className={input + " mt-2"}
                                                    type={type}
                                                    required={form.mode === "live" && form.enabled}
                                                    value={form.merchantPolicies[key]}
                                                    onChange={(e) =>
                                                        setForm({
                                                            ...form,
                                                            merchantPolicies: {
                                                                ...form.merchantPolicies,
                                                                [key]: e.target.value,
                                                            },
                                                        })
                                                    }
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                {form.mode === "live" && (
                                    <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                                        <input
                                            type="checkbox"
                                            checked={form.liveAcknowledged}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    liveAcknowledged: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            I have completed Razorpay activation and tested
                                            checkout, signed webhook delivery, rewards, cancellation
                                            and refunds for this deployment. I have reviewed our
                                            payment policies before enabling Live payments.
                                        </span>
                                    </label>
                                )}
                                <label className="flex items-center gap-3 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={form.enabled}
                                        onChange={(e) =>
                                            setForm({ ...form, enabled: e.target.checked })
                                        }
                                    />
                                    Enable new {form.mode === "test" ? "Test" : "Live"} checkouts
                                </label>
                                {form.mode === "live" && (
                                    <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                                        Live checkout accepts real money. Complete Razorpay
                                        activation, confirm automatic capture and configure the
                                        webhook before enabling it. Memberships require matching
                                        Plan IDs below. Refunds are initiated in Razorpay and
                                        reconciled through Organization refund review.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-3">
                                    <button className={button} disabled={!!busy}>
                                        {busy === "save" ? (
                                            <LoaderCircle size={16} className="animate-spin" />
                                        ) : (
                                            <ShieldCheck size={16} />
                                        )}
                                        Save & verify API
                                    </button>
                                    {integration?.enabled && (
                                        <button
                                            className="rounded-xl border px-4 text-sm"
                                            type="button"
                                            disabled={!!busy}
                                            onClick={() => void pause()}
                                        >
                                            Pause checkout
                                        </button>
                                    )}
                                    <a
                                        className="inline-flex items-center gap-2 px-2 text-sm text-[#6255e8]"
                                        href="https://dashboard.razorpay.com/"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Razorpay Dashboard
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            </form>
                        </section>
                    ) : section === "membership" ? (
                        <MembershipPlans
                            available={data?.availableMemberships}
                            enabled={
                                ready &&
                                !!data?.canPurchase &&
                                !(data?.unlimited && integration?.mode === "live")
                            }
                            busy={!!busy}
                            onPurchase={(plan, cycles) => void subscribe(plan, cycles)}
                        />
                    ) : (
                        <>
                            {integration?.mode === "test" && ready && (
                                <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                                    Test checkout: simulated payments do not add spendable tickets.
                                </p>
                            )}
                            {ready && (
                                <div className={card}>
                                    <label className="block max-w-md text-sm font-medium">
                                        Phone number with country code
                                        <input
                                            className={input + " mt-2"}
                                            type="tel"
                                            autoComplete="tel"
                                            value={contact}
                                            placeholder="+91 9876543210"
                                            onChange={(e) => setContact(e.target.value)}
                                        />
                                    </label>
                                    <p className="mt-2 text-xs leading-6 text-slate-500">
                                        Razorpay requires your contact number and account email for
                                        checkout. They are passed to Razorpay when you continue. We
                                        do not save this phone number.
                                    </p>
                                </div>
                            )}
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {TICKET_PACKS.map((pack) => (
                                    <article className={card} key={pack.tickets}>
                                        <div className="flex items-center justify-center gap-2 border-b pb-4 font-semibold">
                                            <Coins size={17} className="text-[#6255e8]" />
                                            {pack.tickets.toLocaleString()}{" "}
                                            <span className="text-xs font-normal text-slate-400">
                                                TICKETS
                                            </span>
                                        </div>
                                        <div className="mx-auto my-5 flex size-16 items-center justify-center rounded-2xl bg-[#f3f2ff] text-[#6255e8]">
                                            <Coins size={30} />
                                        </div>
                                        <button
                                            className={button + " w-full"}
                                            disabled={
                                                !ready ||
                                                !data?.canPurchase ||
                                                !!busy ||
                                                (!!data?.unlimited && integration?.mode === "live")
                                            }
                                            onClick={() => void buy(pack.tickets)}
                                        >
                                            {busy === String(pack.tickets) ? (
                                                <LoaderCircle size={16} className="animate-spin" />
                                            ) : null}
                                            {new Intl.NumberFormat("en-IN", {
                                                style: "currency",
                                                currency: "INR",
                                            }).format(pack.price)}
                                        </button>
                                        <p className="mt-3 text-center text-xs text-slate-400">
                                            {!data?.canPurchase
                                                ? "Staff tickets are allocated by your organization"
                                                : !ready
                                                  ? "Checkout unavailable"
                                                  : data?.unlimited && integration?.mode === "live"
                                                    ? "Admin tickets are unlimited"
                                                    : integration?.mode === "test"
                                                      ? "Prepare test checkout"
                                                      : "Continue with Razorpay"}
                                        </p>
                                    </article>
                                ))}
                            </div>
                        </>
                    )}
                    {data?.canConfigure && section === "integration" && (
                        <section className={card}>
                            <h3 className="font-semibold">Payment readiness</h3>
                            <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                <li>
                                    API credentials:{" "}
                                    {data.readiness?.apiVerified ? "Verified" : "Not configured"}
                                </li>
                                <li>
                                    Signed webhook delivery:{" "}
                                    {data.readiness?.webhookObserved
                                        ? "Observed for this configuration"
                                        : "Not observed yet — validate with your Razorpay account"}
                                </li>
                                <li>
                                    Membership plan mappings:{" "}
                                    {data.readiness?.membershipBilling
                                        ? "All three verified"
                                        : "Not all plans configured"}
                                </li>
                                <li>
                                    Refunds: initiated in Razorpay, verified and reconciled by Admin
                                    here
                                </li>
                                <li>
                                    Live acceptance: requires provider Test checkout, webhook
                                    delivery, renewal, cancellation and refund tests on your
                                    deployed HTTPS app
                                </li>
                            </ul>
                        </section>
                    )}
                    {data?.canConfigure && section === "integration" && <PaymentRefundReview />}
                    {membershipCheckout && (
                        <section className={card}>
                            <h3 className="font-semibold">
                                Membership checkout ready · {membershipCheckout.mode}
                            </h3>
                            <p className="my-3 text-sm text-slate-500">
                                Continue to Razorpay to authorize the selected recurring charges.
                                Returning here alone does not activate rewards.{" "}
                                {membershipCheckout.mode === "test"
                                    ? "Test mode never grants spendable rewards."
                                    : ""}
                            </p>
                            <a className={button} href={membershipCheckout.url} rel="noreferrer">
                                Continue to Razorpay
                                <ExternalLink size={15} />
                            </a>
                        </section>
                    )}
                    {section === "membership" && !!data?.memberships.subscriptions.length && (
                        <section className={card}>
                            <h3 className="font-semibold">Your memberships</h3>
                            <div className="mt-3 space-y-4">
                                {data.memberships.subscriptions.map((sub) => (
                                    <div
                                        key={sub.id}
                                        className="rounded-xl border border-[#e7e9ef] p-4 text-sm"
                                    >
                                        <p className="font-semibold">
                                            {MEMBERSHIP_PLANS[sub.plan].name} · {sub.mode} ·{" "}
                                            {sub.status}
                                        </p>
                                        <p className="mt-1 break-all text-xs text-slate-500">
                                            {sub.provider_id || "Provider creation not confirmed"} ·
                                            up to {sub.total_cycles} charges{" "}
                                            {sub.cancel_requested ? "· cancellation requested" : ""}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-4">
                                            <button
                                                disabled={!!busy || !sub.provider_id}
                                                className="text-[#6255e8] disabled:opacity-40"
                                                onClick={() =>
                                                    void membershipAction(sub.id, "check")
                                                }
                                            >
                                                Check membership
                                            </button>
                                            {!sub.cancel_requested &&
                                                !["cancelled", "completed", "expired"].includes(
                                                    sub.status,
                                                ) && (
                                                    <button
                                                        disabled={!!busy || !sub.provider_id}
                                                        className="text-rose-700 disabled:opacity-40"
                                                        onClick={() => setCancelId(sub.id)}
                                                    >
                                                        Cancel renewal
                                                    </button>
                                                )}
                                        </div>
                                        {sub.status === "unknown" && !sub.provider_id && (
                                            <div className="mt-3 space-y-2">
                                                <label className="text-xs">
                                                    Recover matching Razorpay subscription ID
                                                    <input
                                                        aria-label="Recover subscription ID"
                                                        className={input}
                                                        placeholder="sub_…"
                                                        value={recovery[sub.id] || ""}
                                                        onChange={(e) =>
                                                            setRecovery({
                                                                ...recovery,
                                                                [sub.id]: e.target.value,
                                                            })
                                                        }
                                                    />
                                                </label>
                                                <button
                                                    disabled={!!busy}
                                                    onClick={() => void recover(sub.id, true)}
                                                >
                                                    Verify and recover
                                                </button>
                                            </div>
                                        )}
                                        {cancelId === sub.id && (
                                            <div className="mt-3 rounded-lg bg-amber-50 p-3">
                                                <p>
                                                    Stop future renewal charges? Paid-cycle rewards
                                                    remain until expiry unless refunded.
                                                    Cancellation does not issue a refund.
                                                </p>
                                                <div className="mt-2 flex gap-4">
                                                    <button
                                                        disabled={!!busy}
                                                        onClick={() =>
                                                            void membershipAction(sub.id, "cancel")
                                                        }
                                                    >
                                                        Confirm cancellation
                                                    </button>
                                                    <button
                                                        disabled={!!busy}
                                                        onClick={() => setCancelId(null)}
                                                    >
                                                        Keep membership
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {data.memberships.cycles
                                            .filter((c) => c.subscription_id === sub.id)
                                            .map((c) => (
                                                <p
                                                    key={c.id}
                                                    className="mt-3 text-xs leading-6 text-slate-500"
                                                >
                                                    {c.mode === "test"
                                                        ? "Test cycle — zero spendable rewards"
                                                        : `${c.instant} instant tickets · ${c.awarded_days} daily rewards posted`}
                                                    . Paid period:{" "}
                                                    {new Date(c.starts_at).toLocaleString()} –{" "}
                                                    {new Date(c.ends_at).toLocaleString()}
                                                    {c.refund_review
                                                        ? " · Refunded cycle; future rewards stopped"
                                                        : ""}
                                                </p>
                                            ))}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                    {data?.merchantPolicies.supportEmail && (
                        <section
                            className="flex flex-wrap items-center gap-4 text-xs text-[#6255e8]"
                            aria-label="Payment policies"
                        >
                            <a href={"mailto:" + data.merchantPolicies.supportEmail}>
                                Payment support
                            </a>
                            {[
                                ["termsUrl", "Terms"],
                                ["privacyUrl", "Privacy"],
                                ["refundUrl", "Refund policy"],
                            ].map(
                                ([key, label]) =>
                                    data.merchantPolicies[key] && (
                                        <a
                                            key={key}
                                            href={data.merchantPolicies[key]}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {label}
                                            <ExternalLink className="ml-1 inline" size={11} />
                                        </a>
                                    ),
                            )}
                        </section>
                    )}
                    {checkout && (
                        <section className={card + " border-[#c9c4ff]"}>
                            <h3 className="font-semibold">Your checkout is ready</h3>
                            <p className="mt-2 text-sm text-slate-500">
                                {checkout.mode === "test"
                                    ? "Test mode — no real payment or spendable tickets."
                                    : "Razorpay collects your payment details. Credit follows verified capture."}
                            </p>
                            <form
                                method="POST"
                                action={checkout.action}
                                className="mt-4 flex flex-wrap gap-3"
                            >
                                {Object.entries(checkout.fields).map(([key, value]) => (
                                    <input key={key} type="hidden" name={key} value={value} />
                                ))}
                                <button className={button}>
                                    Continue to Razorpay
                                    <ExternalLink size={15} />
                                </button>
                                <button
                                    className="rounded-xl border px-4 text-sm"
                                    type="button"
                                    onClick={() => setCheckout(null)}
                                >
                                    Stay here
                                </button>
                            </form>
                        </section>
                    )}
                    {!!data?.orders.length && (
                        <section className={card}>
                            <h3 className="font-semibold">Your recent payment attempts</h3>
                            <p className="mt-1 text-xs text-slate-500">
                                Only verified capture can credit tickets. Closing or returning from
                                checkout does not prove payment.
                            </p>
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b text-xs text-slate-400">
                                            <th className="py-3">Pack</th>
                                            <th>Amount</th>
                                            <th>Mode / status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.orders.map((order) => (
                                            <tr key={order.id} className="border-b last:border-0">
                                                <td className="py-4">
                                                    {order.tickets.toLocaleString()} tickets
                                                    <p className="mt-1 text-xs text-slate-400">
                                                        {new Date(
                                                            order.created_at,
                                                        ).toLocaleString()}
                                                    </p>
                                                    <details className="mt-1 text-xs text-slate-400">
                                                        <summary>Reference</summary>
                                                        <span className="break-all">
                                                            {order.id}
                                                        </span>
                                                    </details>
                                                </td>
                                                <td>
                                                    ₹{(order.amount / 100).toLocaleString("en-IN")}
                                                </td>
                                                <td>
                                                    <span className="capitalize">{order.mode}</span>{" "}
                                                    · {status(order)}
                                                    {order.checked_at && (
                                                        <p className="mt-1 text-xs text-slate-400">
                                                            Checked{" "}
                                                            {new Date(
                                                                order.checked_at,
                                                            ).toLocaleString()}
                                                        </p>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        className="text-[#6255e8] disabled:opacity-40"
                                                        disabled={
                                                            !!busy || !order.provider_order_id
                                                        }
                                                        onClick={() => void check(order.id)}
                                                    >
                                                        Check payment
                                                    </button>
                                                    {order.state === "unknown" &&
                                                        !order.provider_order_id && (
                                                            <div className="mt-2">
                                                                <input
                                                                    aria-label="Recover order ID"
                                                                    className={input}
                                                                    placeholder="order_… from Razorpay"
                                                                    value={recovery[order.id] || ""}
                                                                    onChange={(e) =>
                                                                        setRecovery({
                                                                            ...recovery,
                                                                            [order.id]:
                                                                                e.target.value,
                                                                        })
                                                                    }
                                                                />
                                                                <button
                                                                    disabled={!!busy}
                                                                    className="mt-2 text-[#6255e8]"
                                                                    onClick={() =>
                                                                        void recover(order.id)
                                                                    }
                                                                >
                                                                    Verify and recover
                                                                </button>
                                                            </div>
                                                        )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
}
