import { getRequestSession } from "@/lib/request-session";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { protectOpenAiRequest } from "@/config/Arcjet";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { runStudioAgent, approveStudioTool, resumeStudioFlow, type StudioMessage } from "@/lib/agent-studio-runtime";
import { startPlatformRun, finishPlatformRun } from "@/lib/eassist/platform";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to run this agent." }, { status: 401 });
  if (!permitted(await workspaceAccess(session.user.id), "agent_studio")) return Response.json({ error: "Agent Studio access required." }, { status: 403 });
  try { requireSameOrigin(request); } catch { return Response.json({ error: "Invalid origin." }, { status: 403 }); }
  const blocked = await protectOpenAiRequest(request); if (blocked) return blocked;
  const { agentId } = await context.params; let runId: string | undefined;
  try {
    const body = await boundedJson(request) as Record<string, unknown>;
    runId = await startPlatformRun(session.user.id, "reactflow", agentId);
    if(typeof body.flowApprovalToken==='string') {
      if(!['approve','reject'].includes(String(body.decision))) throw new InputError('Choose approve or reject.');
      const result=await resumeStudioFlow(session.user.id,agentId,body.flowApprovalToken,body.decision as 'approve'|'reject');
      await finishPlatformRun(session.user.id,runId,true);
      return Response.json(result);
    }
    if (typeof body.approvalToken === "string") {
      const result = await approveStudioTool(session.user.id, agentId, body.approvalToken);
      await finishPlatformRun(session.user.id, runId, true);
      return Response.json({ reply: `**${result.name}** ${"httpStatus" in result ? `returned HTTP ${result.httpStatus}` : "received a source response; review the result for completion or delivery status"}.\n\n\`\`\`json\n${JSON.stringify(result.result, null, 2).slice(0,16000)}\n\`\`\``, trace: [], approvals: [] });
    }
    const messages = Array.isArray(body.messages) ? body.messages.slice(-50) : [];
    if (!messages.length || messages.at(-1)?.role !== "user" || messages.some(m => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content || m.content.length > 12000)) throw new InputError("Enter a user message of up to 12,000 characters.");
    const result = await runStudioAgent(session.user.id, agentId, messages.map(message => ({ role: message.role, content: message.content })) as StudioMessage[]);
    await finishPlatformRun(session.user.id, runId, true);
    return Response.json(result);
  } catch (error) {
    if (runId) await finishPlatformRun(session.user.id, runId, false, error).catch(() => {});
    return Response.json({ error: error instanceof InputError ? error.message : "This agent run failed. Check the model and connections, then retry." }, { status: error instanceof InputError ? error.status : 502 });
  }
}
