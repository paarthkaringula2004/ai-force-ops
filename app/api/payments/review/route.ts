import { paymentActor, paymentFailure, paymentJson } from "@/lib/payment-http";
import { refundQueue, resolveRefund } from "@/lib/payment-review";
export const runtime = "nodejs";
export async function GET(request: Request) {
    try {
        return Response.json(
            { reviews: await refundQueue(await paymentActor(request, false, true)) },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (e) {
        return paymentFailure(e);
    }
}
export async function POST(request: Request) {
    try {
        return Response.json(
            await resolveRefund(
                await paymentActor(request, true, true),
                await paymentJson(request),
            ),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (e) {
        return paymentFailure(e);
    }
}
