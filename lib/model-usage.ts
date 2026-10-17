import { randomUUID } from "node:crypto";
import { db } from "./db";
import { currencyRate, type CurrencyRate } from "./currency-rate";
import {
    modelCost,
    API_COST_MULTIPLIER,
    TICKET_PRICE_INR,
    PRICING_SOURCE,
    PRICING_VERIFIED_AT,
    type UsageCostInput,
} from "./model-pricing";

export function usageQuote(event: UsageCostInput, fx: CurrencyRate | null) {
    const cost = modelCost(event);
    const chargeUsd =
        cost.estimatedCostUsd === null ? null : cost.estimatedCostUsd * API_COST_MULTIPLIER;
    const chargeInr = chargeUsd === 0 ? 0 : chargeUsd !== null && fx ? chargeUsd * fx.usdInr : null;
    return {
        ...cost,
        chargeUsd,
        chargeInr,
        tickets: chargeInr === null ? null : chargeInr / TICKET_PRICE_INR,
        multiplier: API_COST_MULTIPLIER,
        ticketPriceInr: TICKET_PRICE_INR,
        fx,
        pricingVerifiedAt: PRICING_VERIFIED_AT,
        pricingSource: PRICING_SOURCE,
        serviceTier: event.serviceTier ?? "default",
    };
}

export async function recordModelUsage(
    user: string,
    source: string,
    event: UsageCostInput & { totalTokens?: number },
) {
    const billing = usageQuote(event, event.usageKind === "local" ? null : await currencyRate());
    const client = await db.connect(),
        id = randomUUID();
    try {
        await client.query("BEGIN");
        await client.query("SELECT refresh_ticket_wallet($1)", [user]);
        await client.query("SELECT award_membership_rewards($1)", [user]);
        await client.query(
            "INSERT INTO usage_events(id,user_id,source,model_id,input_tokens,output_tokens,total_tokens,cached_input_tokens,cache_write_tokens,usage_kind,billing) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
            [
                id,
                user,
                source,
                event.modelId,
                event.inputTokens,
                event.outputTokens,
                event.totalTokens ?? event.inputTokens + event.outputTokens,
                event.cachedInputTokens ?? null,
                event.cacheWriteTokens ?? null,
                event.usageKind ?? "provider",
                JSON.stringify(billing),
            ],
        );
        const member = (
            await client.query("SELECT role FROM workspace_members WHERE user_id=$1", [user])
        ).rows[0];
        if (member?.role !== "admin" && billing.tickets !== null && billing.tickets > 0) {
            const tickets = Math.ceil(billing.tickets);
            await client.query(
                "UPDATE ticket_wallets SET paid_balance=LEAST(paid_balance,GREATEST(balance-$2,0)),balance=balance-$2,updated_at=now() WHERE user_id=$1",
                [user, tickets],
            );
            await client.query(
                "INSERT INTO ticket_ledger(id,user_id,amount,kind,usage_id) VALUES($1,$2,$3,'usage',$4)",
                [randomUUID(), user, -tickets, id],
            );
        }
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}
