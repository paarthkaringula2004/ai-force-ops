import { getRequestSession } from "./request-session";
import { workspaceAccess } from "./workspace-access";
import { requireSameOrigin } from "./service-review/ingestion";
import { PaymentError } from "./payment-provider";
export async function paymentActor(request: Request, write = false, adminOnly = false) {
    const id = (await getRequestSession(request))?.user?.id;
    if (!id) throw new PaymentError("Sign in required.", 401);
    const m = await workspaceAccess(id);
    if (
        !m.active ||
        !(adminOnly
            ? m.role === "admin"
            : ["admin", "user", "employee", "manager"].includes(m.role))
    )
        throw new PaymentError("Your role does not permit this payment action.", 403);
    if (write) requireSameOrigin(request);
    return id;
}
export async function paymentBody(request: Request, limit = 16000) {
    const reader = request.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder();
    let result = "",
        size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
            await reader.cancel();
            throw new PaymentError("Payment request is too large.", 413);
        }
        result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
}
export async function paymentJson(request: Request) {
    try {
        const b = JSON.parse(await paymentBody(request));
        if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
        return b as Record<string, unknown>;
    } catch (error) {
        if (error instanceof PaymentError) throw error;
        throw new PaymentError("Send a valid payment request.");
    }
}
export function paymentFailure(error: unknown) {
    const code =
        error && typeof error === "object" && "status" in error ? Number(error.status) : 503;
    const status = Number.isInteger(code) && code >= 400 && code <= 599 ? code : 503;
    return Response.json(
        {
            error:
                error instanceof Error && "status" in error
                    ? error.message
                    : "Payment service is unavailable. No ticket credit was applied.",
        },
        { status, headers: { "Cache-Control": "no-store" } },
    );
}
