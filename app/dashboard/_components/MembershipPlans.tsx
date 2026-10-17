"use client";
import { useState } from "react";
import { MEMBERSHIP_PLANS, type MembershipPlan } from "@/lib/membership-plans";
import { Check, Coins, CreditCard, Gift, Timer } from "lucide-react";

// Restore the original membership catalog and presentation independently of
// one-time ticket checkout. Plan selection is a preview, never an activation.
export default function MembershipPlans({
    available = [],
    enabled = false,
    busy = false,
    onPurchase,
}: {
    available?: string[];
    enabled?: boolean;
    busy?: boolean;
    onPurchase?: (plan: MembershipPlan, cycles: number) => void;
}) {
    const [cycles, setCycles] = useState(12),
        [accepted, setAccepted] = useState(false);
    const [membership, setMembership] = useState<"monthly" | "weekly" | "lite">("monthly");
    const plans = MEMBERSHIP_PLANS;
    const selected = plans[membership];
    return (
        <section aria-label="Membership plans">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[10px] font-medium text-[#8992a2]">Membership rewards</p>
                    <h2 className="mt-1 text-[18px] font-semibold text-[#283144]">
                        Choose your membership
                    </h2>
                </div>
                <span className="text-[10px] text-[#8992a2]">Rewards begin after activation</span>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(230px,.65fr)]">
                <article className="rounded-2xl border border-[#dedbff] bg-white p-5 shadow-[0_6px_24px_rgba(25,39,70,.045)] sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="flex size-11 items-center justify-center rounded-xl bg-[#efedff] text-[#6255e8]">
                                <Gift className="size-5" />
                            </span>
                            <div>
                                <p className="text-[9px] font-medium text-[#8992a2]">
                                    AIForce.Ops membership
                                </p>
                                <h3 className="mt-1 text-[16px] font-semibold capitalize text-[#283144]">
                                    {selected.name}
                                </h3>
                            </div>
                        </div>
                        <span className="rounded-full bg-[#f3f4f7] px-2.5 py-1 text-[9px] font-medium text-[#6d7787]">
                            {selected.days} days
                        </span>
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-[#eceef2] bg-[#fafbfc] p-4">
                            <p className="text-[9px] font-medium text-[#8992a2]">Instant reward</p>
                            <p className="mt-2 flex items-center gap-2 text-[22px] font-semibold text-[#283144]">
                                <Coins className="size-5 text-[#6255e8]" />
                                {selected.instant.toLocaleString()}{" "}
                                <span className="text-[9px] font-medium text-[#8992a2]">TOKEN</span>
                            </p>
                        </div>
                        <div className="rounded-xl border border-[#eceef2] bg-[#fafbfc] p-4">
                            <p className="text-[9px] font-medium text-[#8992a2]">Daily reward</p>
                            <p className="mt-2 flex items-center gap-2 text-[22px] font-semibold text-[#283144]">
                                <Coins className="size-5 text-[#6255e8]" />
                                {selected.daily}{" "}
                                <span className="text-[9px] font-medium text-[#8992a2]">
                                    TOKEN / DAY
                                </span>
                            </p>
                        </div>
                    </div>
                    <p className="mt-3 text-center text-[10px] text-[#798394]">
                        Daily rewards for {selected.days} days · Up to{" "}
                        <b className="text-[#303846]">
                            {(selected.instant + selected.daily * selected.days).toLocaleString()}{" "}
                            TOKEN
                        </b>{" "}
                        total
                    </p>
                    <div className="mt-4 space-y-3 text-xs text-[#667184]">
                        <label className="flex flex-wrap items-center gap-2">
                            Number of billing cycles
                            <input
                                aria-label="Number of billing cycles"
                                className="w-20 rounded-lg border border-[#dfe2e9] p-2"
                                type="number"
                                min={1}
                                max={120}
                                value={cycles}
                                onChange={(e) => {
                                    setCycles(
                                        Math.max(1, Math.min(120, Number(e.target.value) || 1)),
                                    );
                                    setAccepted(false);
                                }}
                            />
                        </label>
                        <p>
                            ₹{selected.price}.00 every {selected.days} days, up to {cycles} charges.
                            Cancel renewal from membership history. Daily rewards are earned after
                            each full 24 hours of the paid period.
                        </p>
                        <label className="flex items-start gap-2">
                            <input
                                type="checkbox"
                                checked={accepted}
                                onChange={(e) => setAccepted(e.target.checked)}
                            />
                            <span>
                                I accept these recurring charges and the selected billing period.
                            </span>
                        </label>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eceef2] pt-4">
                        <span className="flex items-center gap-1.5 text-[9px] font-medium text-[#6d7787]">
                            <Check className="size-4 text-[#6255e8]" />
                            Recurring membership
                        </span>
                        <button
                            type="button"
                            disabled={
                                !enabled || !available.includes(membership) || !accepted || busy
                            }
                            onClick={() => onPurchase?.(membership, cycles)}
                            title={
                                !enabled || !available.includes(membership)
                                    ? "Membership checkout is not configured"
                                    : "Accept recurring charges before continuing"
                            }
                            className="min-w-40 rounded-lg bg-[#6255e8] px-8 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            ₹{selected.price}.00
                        </button>
                    </div>
                </article>
                <div className="space-y-3">
                    {(["lite", "weekly", "monthly"] as const).map((key) => {
                        const plan = plans[key];
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={membership === key}
                                onClick={() => {
                                    setMembership(key);
                                    setAccepted(false);
                                }}
                                className={`w-full rounded-xl border p-4 text-left transition ${membership === key ? "border-[#c9c4ff] bg-[#f4f2ff]" : "border-[#e7e9ef] bg-white hover:border-[#d9d5ff]"}`}
                            >
                                <div className="flex items-center gap-3">
                                    <span
                                        className={`flex size-9 items-center justify-center rounded-lg ${membership === key ? "bg-white text-[#6255e8]" : "bg-[#f3f4f7] text-[#737d8d]"}`}
                                    >
                                        <Gift className="size-4" />
                                    </span>
                                    <span
                                        className={`text-[10px] font-semibold capitalize ${membership === key ? "text-[#5347d6]" : "text-[#414b5c]"}`}
                                    >
                                        {plan.name}
                                    </span>
                                    <span
                                        className={`ml-auto text-[9px] font-medium ${membership === key ? "text-[#6255e8]" : "text-[#9299a6]"}`}
                                    >
                                        {membership === key ? "Selected" : "View"}
                                    </span>
                                </div>
                                <p className="mt-3 text-[10px] text-[#798394]">
                                    {plan.instant.toLocaleString()} TOKEN now + {plan.daily} TOKEN
                                    daily · {plan.days} days
                                </p>
                                <p className="mt-2 text-[13px] font-semibold text-[#303846]">
                                    ₹{plan.price}.00
                                </p>
                            </button>
                        );
                    })}
                </div>
            </div>
            <section className="mt-5 rounded-2xl border border-[#e7e9ef] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-[10px] font-semibold tracking-[.08em] text-[#424c5d]">
                        <Timer className="size-4 text-[#6255e8]" />
                        DAILY REWARDS
                    </h3>
                    <span className="text-[9px] text-[#8992a2]">
                        {selected.days}-day membership calendar
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-10">
                    {Array.from({ length: selected.days }, (_, day) => (
                        <div
                            key={day}
                            className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#eceef2] bg-[#fafbfc] p-1"
                        >
                            <span className="text-[8px] text-[#8992a2]">Day {day + 1}</span>
                            <Coins className="size-4 text-[#6255e8]" />
                            <span className="text-[9px] font-semibold text-[#424c5d]">
                                {selected.daily}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#e7e9ef] bg-white p-3.5">
                <CreditCard className="mt-0.5 size-4 shrink-0 text-[#6255e8]" />
                <p className="text-[10px] leading-5 text-[#798394]">
                    <b className="text-[#424c5d]">
                        {enabled && available.includes(membership)
                            ? "Review your membership before continuing."
                            : "Membership checkout is not configured for this plan."}
                    </b>{" "}
                    Selecting a plan does not charge you. Activation and rewards require a verified
                    captured payment. Refunds stop future rewards for that paid cycle and may
                    require a ticket adjustment.
                </p>
            </div>
        </section>
    );
}
