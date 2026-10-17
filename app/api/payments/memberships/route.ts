import { paymentActor, paymentFailure, paymentJson } from "@/lib/payment-http";
import {
    createMembership,
    checkMembership,
    cancelMembership,
    recoverMembership,
} from "@/lib/memberships";
export const runtime = "nodejs";
export async function POST(request: Request) {
    try {
        const user = await paymentActor(request, true),
            b = await paymentJson(request);
        if (b.action && !["check", "cancel", "recover", "create"].includes(String(b.action)))
            return Response.json({ error: "Unsupported membership action." }, { status: 400 });
        return Response.json(
            b.action === "check"
                ? await checkMembership(user, b.id)
                : b.action === "cancel"
                  ? await cancelMembership(user, b)
                  : b.action === "recover"
                    ? await recoverMembership(user, b)
                    : await createMembership(user, b),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (e) {
        return paymentFailure(e);
    }
}
