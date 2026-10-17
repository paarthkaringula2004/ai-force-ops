import { paymentBody } from "@/lib/payment-http";
import { paymentCallback } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
    try {
        const form = new URLSearchParams(await paymentBody(request));
        const result = await paymentCallback(Object.fromEntries(form));
        return Response.redirect(result.origin + "/dashboard/payments?payment=" + result.id, 303);
    } catch {
        return new Response(
            '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Payment verification</title><body><main><h1>Payment has not been verified yet</h1><p>No tickets were added by this callback. Return to Payments and choose Check payment. A captured payment can also be confirmed by the Razorpay webhook.</p><a href="/dashboard/payments">Return to Payments</a></main></body></html>',
            {
                status: 400,
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-store",
                    "Content-Security-Policy":
                        "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
                    "X-Content-Type-Options": "nosniff",
                },
            },
        );
    }
}
