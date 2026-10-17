import { getRequestSession } from "@/lib/request-session";
import { snapshot } from "@/lib/epace/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return new Response("Sign in required", { status: 401 });
    const pid = new URL(request.url).searchParams.get("project");
    let timer: ReturnType<typeof setTimeout> | undefined,
        lifetime: ReturnType<typeof setTimeout> | undefined,
        closed = false,
        last = "";
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream({
        start(controller) {
            const stop = () => {
                if (closed) return;
                closed = true;
                if (timer) clearTimeout(timer);
                if (lifetime) clearTimeout(lifetime);
                request.signal.removeEventListener("abort", stop);
                try {
                    controller.close();
                } catch {}
            };
            cleanup = stop;
            request.signal.addEventListener("abort", stop, { once: true });
            lifetime = setTimeout(stop, 50000);
            const poll = async () => {
                if (closed) return;
                try {
                    const current = await getRequestSession(request);
                    if (!current?.user || current.user.id !== session.user.id) {
                        stop();
                        return;
                    }
                    const data = await snapshot(session.user.id, pid);
                    if (closed) return;
                    const key = JSON.stringify({ ...data, checkedAt: "" });
                    if (key !== last) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                        last = key;
                    } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
                } catch {
                    if (!closed)
                        try {
                            controller.enqueue(encoder.encode("event: unavailable\ndata: {}\n\n"));
                        } catch {
                            stop();
                        }
                }
                if (!closed) timer = setTimeout(poll, 3000);
            };
            if (request.signal.aborted) stop();
            else void poll();
        },
        cancel() {
            cleanup();
        },
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "private, no-store, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}
