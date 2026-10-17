import { paymentBody, paymentFailure } from "@/lib/payment-http";
import { paymentWebhook } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
    try {
        return Response.json(
            await paymentWebhook(
                await paymentBody(request, 65536),
                request.headers.get("x-razorpay-signature") || "",
                request.headers.get("x-razorpay-event-id") || "",
            ),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return paymentFailure(error);
    }
}
