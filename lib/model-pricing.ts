import catalog from "./openai-pricing.json";
type Rate = {
    input: number;
    cached: number | null;
    cacheWrite: number | null;
    output: number;
    longInput: number | null;
    longCached: number | null;
    longCacheWrite: number | null;
    longOutput: number | null;
};
const rates: Record<string, Rate> = catalog.models;
export const PRICING_SOURCE = catalog.source;
export const PRICING_VERIFIED_AT = catalog.verifiedAt;
export const API_COST_MULTIPLIER = 2;

export const TICKET_PRICE_INR = 0.8;
export const TICKET_PACKS = [100, 250, 500, 1000, 2000, 5000].map((tickets) => ({
    price: tickets * TICKET_PRICE_INR,
    tickets,
}));

export function modelRates(model: string) {
    const rate = rates[model] ?? rates[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
    return rate ? { input: rate.input, output: rate.output } : null;
}
export function compareModelBudgets(a: string, b: string): number {
    // Astra is last by explicit product preference, even if another model costs more.
    const astra = Number(/astra/.test(a)) - Number(/astra/.test(b));
    if (astra) return astra;
    const left = modelRates(a),
        right = modelRates(b);
    const price = (rate: ReturnType<typeof modelRates>) =>
        rate ? rate.input + rate.output : Number.POSITIVE_INFINITY;
    return price(left) - price(right) || a.localeCompare(b, "en", { numeric: true });
}
export type UsageCostInput = {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number | null;
    cacheWriteTokens?: number | null;
    usageKind?: string;
    serviceTier?: string | null;
};
export function tokenDetails(details: unknown) {
    const values = (
        Array.isArray(details) ? details : details && typeof details === "object" ? [details] : []
    ) as Record<string, unknown>[];
    const sum = (key: string) =>
        values.length && values.every((value) => typeof value[key] === "number")
            ? values.reduce((total, value) => total + Number(value[key]), 0)
            : null;
    return { cachedInputTokens: sum("cached_tokens"), cacheWriteTokens: sum("cache_write_tokens") };
}
export function modelCost(event: UsageCostInput) {
    if (event.usageKind === "local") return { estimatedCostUsd: 0, costBasis: "local" };
    const model = event.modelId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    const rate = rates[event.modelId] ?? rates[model];
    if (event.serviceTier && !["default", "standard", "auto"].includes(event.serviceTier))
        return { estimatedCostUsd: null, costBasis: "unsupported-tier" };
    if (!rate) return { estimatedCostUsd: null, costBasis: "unavailable" };
    if (rate.cacheWrite !== null && event.cacheWriteTokens == null)
        return { estimatedCostUsd: null, costBasis: "cache-writes-unknown" };
    const cached = Math.min(event.inputTokens, Math.max(0, event.cachedInputTokens ?? 0));
    const long = event.inputTokens > 272000 && rate.longInput !== null;
    const input = long ? rate.longInput! : rate.input;
    const cachedRate = (long ? rate.longCached : rate.cached) ?? input;
    const output = long ? rate.longOutput! : rate.output;
    const writes = Math.min(event.inputTokens - cached, Math.max(0, event.cacheWriteTokens ?? 0));
    const writeRate = (long ? rate.longCacheWrite : rate.cacheWrite) ?? input;
    const estimatedCostUsd =
        ((event.inputTokens - cached - writes) * input +
            cached * cachedRate +
            writes * writeRate +
            event.outputTokens * output) /
        1_000_000;
    return {
        estimatedCostUsd,
        costBasis: event.cachedInputTokens == null ? "cache-unknown" : "standard",
    };
}
