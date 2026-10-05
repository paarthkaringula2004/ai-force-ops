import { getRequestSession } from "@/lib/request-session";
import { project, record } from "@/lib/epace/store";
import { scaffold } from "@/lib/epace/scaffold";
import { failure } from "../route";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const s = await getRequestSession(request);
  if (!s?.user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const u = new URL(request.url),
      p = await project(s.user.id, u.searchParams.get("project") || ""),
      r = await record(
        s.user.id,
        p.id,
        u.searchParams.get("id") || "",
        "component",
      );
    const zip = await scaffold(p, r);
    const name =
      String(r.data.name)
        .replace(/[^a-z0-9-]/gi, "-")
        .slice(0, 80) || "service";
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}-starter.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
