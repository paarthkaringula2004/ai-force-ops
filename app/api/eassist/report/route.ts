import { getRequestSession } from "@/lib/request-session";
import { trustedOrigin } from "@/lib/epace/origin";
import { boundedJson } from "@/lib/epace/runtime";
import { componentForPath, recordPlatformError } from "@/lib/eassist/platform";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!trustedOrigin(request))
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const body = await boundedJson(request, 2048);
    if (
      typeof body.path !== "string" ||
      body.path.length > 250 ||
      !body.path.startsWith("/") ||
      body.path.startsWith("//")
    )
      return Response.json(
        { error: "Invalid workspace path." },
        { status: 400 },
      );
    await recordPlatformError(
      session.user.id,
      componentForPath(body.path),
      "browser",
    );
    return Response.json(
      { recorded: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Signal could not be recorded." },
      { status: 503 },
    );
  }
}
