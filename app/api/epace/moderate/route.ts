import { boundedJson, admitProviderRequest } from "@/lib/epace/runtime";
import { trustedOrigin } from "@/lib/epace/origin";
import { getRequestSession } from "@/lib/request-session";
import { protectOpenAiRequest } from "@/config/Arcjet";
import { project, put, text, audit, PaceError } from "@/lib/epace/store";
import { moderate } from "@/lib/epace/engine";
import { failure } from "../route";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const s = await getRequestSession(request);
  if (!s?.user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!trustedOrigin(request))
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  const blocked = await protectOpenAiRequest(request);
  if (blocked) return blocked;
  try {
    if (Number(request.headers.get("content-length")) > 30000)
      throw new PaceError("Text too large.", 413);
    const b = await boundedJson(request, 30000),
      p = await project(s.user.id, b.projectId),
      input = text(b.text, 12000, true);
    const stage = b.stage ?? "input";
    if (stage !== "input" && stage !== "output")
      throw new PaceError("Choose the input or output policy.", 400);
    await admitProviderRequest(s.user.id);
    const result = await moderate(
      s.user.id,
      p,
      input,
      stage,
      AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    );
    const runId = await put(s.user.id, p.id, "run", {
      name: `Safety test · ${stage}`,
      threadId: "",
      input,
      output: result.blocked ? "Blocked" : "Passed",
      model: "omni-moderation-latest",
      status: result.blocked ? "blocked" : "success",
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      latency: result.latency,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      streamed: false,
      sources: [],
      spans: [],
      moderation: [result],
      tags: ["safety-test"],
      settings: p.settings,
    });
    if (result.blocked)
      await put(s.user.id, p.id, "alert", {
        name: `Content safety alert · ${stage} test`,
        runId,
        metrics: {},
        thresholds: p.settings.thresholds,
        input,
        output: "Blocked",
        context: [],
        delivery: "In-app",
        resolved: false,
      });
    await audit(s.user.id, p.id, `Completed ${stage} safety test`, runId);
    return Response.json(result);
  } catch (e) {
    return failure(e);
  }
}
