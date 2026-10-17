import { paymentActor, paymentFailure, paymentJson } from "@/lib/payment-http";
import { createPaymentOrder, reconcilePayment, recoverPayment } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
    try {
        const user = await paymentActor(request, true),
            b = await paymentJson(request);
        if (b.action && !["check", "recover", "create"].includes(String(b.action)))
            return Response.json({ error: "Unsupported payment action." }, { status: 400 });
        return Response.json(
            b.action === "check"
                ? await reconcilePayment(user, b.id)
                : b.action === "recover"
                  ? await recoverPayment(user, b)
                  : await createPaymentOrder(user, b),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return paymentFailure(error);
    }
}
