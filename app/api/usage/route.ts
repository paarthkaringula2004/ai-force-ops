import { getRequestSession } from "@/lib/request-session";
import { db } from "@/lib/db";
import { currencyRate } from "@/lib/currency-rate";
import { usageQuote } from "@/lib/model-usage";
import { API_COST_MULTIPLIER, PRICING_SOURCE, PRICING_VERIFIED_AT, TICKET_PRICE_INR } from "@/lib/model-pricing";
import { ticketBalance } from '@/lib/tickets';

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view usage." }, { status: 401 });
  const daysValue = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysValue) ? Math.max(1, Math.min(365, Math.floor(daysValue))) : 30;
  try {
    const fields = `id,source,model_id AS "modelId",input_tokens AS "inputTokens",output_tokens AS "outputTokens",total_tokens AS "totalTokens",cached_input_tokens AS "cachedInputTokens",cache_write_tokens AS "cacheWriteTokens",usage_kind AS "usageKind",billing,created_at AS "createdAt"`;
    const [window, recent, fx] = await Promise.all([
      db.query(`SELECT ${fields} FROM usage_events WHERE user_id=$1 AND created_at >= now() - ($2::int * interval '1 day')`, [session.user.id, days]),
      db.query(`SELECT ${fields} FROM usage_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [session.user.id]),
      currencyRate(),
    ]);
    const quote = (event: typeof recent.rows[number]) => {
      if (!event.billing) return {...usageQuote(event,fx), historicalEstimate:true};
      if (event.billing.estimatedCostUsd === null && event.billing.costBasis === "unavailable") {
        const recovered = usageQuote(event,event.billing.fx ?? fx);
        if (recovered.estimatedCostUsd !== null) return {...recovered, historicalEstimate:true, pricingRecovered:true};
      }
      return event.billing;
    };
    const events = recent.rows.map(event => ({...event, billing:quote(event)}));
    const totals = { inputTokens:0,outputTokens:0,totalTokens:0,requests:0,localReplies:0,estimatedCostUsd:0,chargeUsd:0,chargeInr:0,tickets:0,unpricedRequests:0,fxUnavailableRequests:0,estimatedRequests:0 };
    for (const event of window.rows) {
      totals.inputTokens += event.inputTokens; totals.outputTokens += event.outputTokens; totals.totalTokens += event.totalTokens;
      if(event.usageKind === "local") totals.localReplies++; else totals.requests++;
      const billing=quote(event);
      if(billing.estimatedCostUsd === null) {totals.unpricedRequests++; continue;}
      totals.estimatedCostUsd += billing.estimatedCostUsd; totals.chargeUsd += billing.chargeUsd;
      if(billing.chargeInr === null) totals.fxUnavailableRequests++; else {totals.chargeInr += billing.chargeInr; totals.tickets += billing.tickets;}
      if(!event.billing || billing.costBasis !== "standard" && billing.costBasis !== "local") totals.estimatedRequests++;
    }
    return Response.json({wallet:await ticketBalance(session.user.id),days, totals, events,pricing:{multiplier:API_COST_MULTIPLIER,ticketPriceInr:TICKET_PRICE_INR,fx,source:PRICING_SOURCE,verifiedAt:PRICING_VERIFIED_AT} });
  } catch { return Response.json({ error: "Could not load usage from PostgreSQL." }, { status: 503 }); }
}
