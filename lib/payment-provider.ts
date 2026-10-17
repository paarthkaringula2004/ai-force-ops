import { unseal } from "./eassist/transport";
export class PaymentError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}
export type PaymentConfig = {
    id: string;
    mode: "test" | "live";
    key_id: string;
    key_cipher: string;
    webhook_cipher: string;
    public_origin: string;
    business_name: string;
    enabled: boolean;
    verified_at: string | null;
    webhook_verified_at?: string | null;
    membership_plans?: Record<string, string>;
    merchant_policies?: Record<string, string>;
    live_acknowledged_at?: string | null;
};
export async function razorpay(
    config: PaymentConfig,
    path: string,
    method = "GET",
    body?: unknown,
): Promise<Record<string, unknown>> {
    if (!(
        (method === "POST" &&
            (path === "/orders" ||
                path === "/subscriptions" ||
                /^\/subscriptions\/sub_[A-Za-z0-9]+\/cancel$/.test(path))) ||
        (method === "GET" &&
            /^\/(?:orders(?:\/order_[A-Za-z0-9]+(?:\/payments)?)?|payments\/pay_[A-Za-z0-9]+|plans\/plan_[A-Za-z0-9]+|subscriptions\/sub_[A-Za-z0-9]+|invoices\/inv_[A-Za-z0-9]+)(?:\?count=1)?$/.test(
                path,
            )) ||
        (method === "GET" &&
            /^\/invoices\?subscription_id=sub_[A-Za-z0-9]+&count=100&skip=(?:0|100)$/.test(path))
    ))
        throw new PaymentError("Unsupported payment operation.");
    let response: Response;
    try {
        response = await fetch("https://api.razorpay.com/v1" + path, {
            method,
            headers: {
                Authorization:
                    "Basic " +
                    Buffer.from(config.key_id + ":" + unseal(config.key_cipher)).toString("base64"),
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw new PaymentError(
            "Razorpay did not respond. Check payment history before starting another attempt.",
            503,
        );
    }
    if (!response.ok)
        throw new PaymentError(
            response.status === 401
                ? "Razorpay rejected the API credentials. Check the selected mode and keys."
                : "Razorpay could not complete this request. Check your Razorpay Dashboard.",
            response.status === 401 ? 400 : 502,
        );
    try {
        const reader = response.body?.getReader();
        if (!reader) throw Error();
        let size = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1024 * 1024) {
                await reader.cancel();
                throw Error();
            }
            chunks.push(value);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
        return parsed;
    } catch {
        throw new PaymentError(
            "Razorpay returned an invalid or oversized response. No payment was confirmed.",
            502,
        );
    }
}
