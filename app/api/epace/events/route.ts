import { getRequestSession } from "@/lib/request-session";
import { snapshot } from "@/lib/epace/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const s = await getRequestSession(request);
  if (!s?.user) return new Response("Sign in required", { status: 401 });
  const pid = new URL(request.url).searchParams.get("project");
  let timer: ReturnType<typeof setTimeout> | undefined,
    closed = false,
    last = "";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const stop = () => {
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", stop, { once: true });
      const poll = async () => {
        if (closed) return;
        try {
          const data = await snapshot(s.user.id, pid);
          const key = JSON.stringify({ ...data, checkedAt: "" });
          if (key !== last) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
            last = key;
          } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          if (!closed)
            controller.enqueue(
              encoder.encode("event: unavailable\ndata: {}\n\n"),
            );
        }
        if (!closed) timer = setTimeout(poll, 3000);
      };
      void poll();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
