export type CurrencyRate = { usdInr: number; date: string; source: string };

export async function currencyRate(): Promise<CurrencyRate | null> {
    const configured = Number(process.env.USD_INR_RATE ?? 96.48);
    return Number.isFinite(configured) && configured > 0
        ? { usdInr: configured, date: "configured", source: "Configured USD/INR rate" }
        : null;
}
