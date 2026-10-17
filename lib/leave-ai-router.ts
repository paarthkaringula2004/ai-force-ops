import OpenAI from "openai";
import { db } from "./db";
import { employeeReply } from "./employee-playground";
import { localLeaveDate } from "./leave-policy";
import {
    leaveIntentTool,
    leaveAiInstructions,
    parseLeaveAiIntent,
    type LeaveAiContext,
} from "./leave-ai-intent";
import { supportsPlaygroundModel, playgroundModelCatalog } from "./playground-models";
import { recordModelUsage } from "./model-usage";
import { tokenDetails } from "./model-pricing";
import { startPlatformRun, finishPlatformRun } from "./eassist/platform";
import { recentChat } from "./chat-efficiency";
import type { WorkspaceAccess } from "./workspace-permissions";

export async function employeeLeaveAiReply(
    user: string,
    name: string,
    member: WorkspaceAccess,
    selectedModel: string,
    messages: { role: "user" | "assistant"; content: string }[],
) {
    if (
        !member.active ||
        !["employee", "manager"].includes(member.role) ||
        !process.env.OPENAI_API_KEY
    )
        return null;
    const text = messages.at(-1)!.content.trim();
    // Navigation and explicit button protocols do not need a language-model call.
    if (
        /^(?:hi|hello|hey|thanks|thank you|about me|my profile|my requests|employee services|about AIForce\.Ops|team requests|employee overview|new chat|confirm leave|cancel request|edit request|resume my request|save for later)[!. ]*$/i.test(
            text,
        )
    )
        return null;
    const action = (
        await db.query(
            "SELECT 1 FROM workspace_chat_actions WHERE user_id=$1 AND expires_at>now()",
            [user],
        )
    ).rowCount;
    if (action) return null;
    const active = (
        await db.query(
            "SELECT draft,updated_at::text AS version FROM employee_playground_drafts WHERE user_id=$1",
            [user],
        )
    ).rows[0];
    if (active && active.draft.kind !== "leave") return null;
    if (
        !active &&
        /\b(?:laptop|equipment|accessor|onboard|access|support|expense|reimbursement|travel|attendance|payroll|benefit|resign|referr|transfer|training|certification|document|flexible|remote work|work from home|meeting room)\w*/i.test(
            text,
        ) &&
        !/\b(?:leave|holiday|vacation|time off)\b/i.test(text)
    )
        return null;
    const saved = (
        await db.query(
            "SELECT request_number,details,status FROM employee_service_requests WHERE user_id=$1 AND kind='leave' AND status IN ('approved','fulfilled','pending_approval') ORDER BY created_at DESC,updated_at DESC LIMIT 5",
            [user],
        )
    ).rows;
    const context: LeaveAiContext = {
        today: localLeaveDate(),
        active: active
            ? {
                  id: active.draft.id,
                  type: active.draft.fields.type,
                  dates: active.draft.fields.dates,
                  reason: active.draft.fields.reason,
              }
            : null,
        recent: saved.map((r) => ({
            number: r.request_number,
            type: String(r.details.type || ""),
            dates: String(r.details.dates || ""),
            reason: String(r.details.reason || ""),
            status: r.status,
        })),
    };
    const model =
        process.env.OPENAI_EMPLOYEE_ROUTER_MODEL?.trim() || selectedModel || "gpt-4.1-mini";
    if (!supportsPlaygroundModel(model))
        throw new Error("Choose a supported employee interpreter model.");
    const catalog = await playgroundModelCatalog();
    if (!catalog.entries.some((e) => e.id === model && e.usable))
        throw new Error("The employee interpreter model is unavailable. Refresh the Models list.");
    const run = await startPlatformRun(user, "agent-studio", "");
    try {
        const response = await new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 60000,
            maxRetries: 0,
        }).responses.create({
            model,
            store: false,
            instructions: leaveAiInstructions(context),
            input: recentChat(messages, 24000),
            tools: [leaveIntentTool],
            tool_choice: { type: "function", name: "interpret_leave_request" },
            parallel_tool_calls: false,
            max_output_tokens: 4000,
            ...(/^gpt-4(?:\.1|o)(?:-|$)/.test(model) ? { temperature: 0 } : {}),
        });
        const u = response.usage;
        if (u)
            await recordModelUsage(user, "playground", {
                modelId: response.model,
                inputTokens: u.input_tokens,
                outputTokens: u.output_tokens,
                totalTokens: u.total_tokens,
                ...tokenDetails(u.input_tokens_details),
                serviceTier: response.service_tier,
            });
        const usage = u
            ? {
                  inputTokens: u.input_tokens,
                  outputTokens: u.output_tokens,
                  totalTokens: u.total_tokens,
              }
            : null;
        const calls = response.output.filter((item) => item.type === "function_call");
        if (
            response.status !== "completed" ||
            calls.length !== 1 ||
            calls[0].name !== "interpret_leave_request"
        )
            throw new Error(
                "The leave interpreter could not finish. Nothing was submitted. Please try again.",
            );
        const intent = parseLeaveAiIntent(calls[0].arguments);
        if (intent.mode === "other") {
            await finishPlatformRun(user, run, true, { code: "employee_other_intent" });
            return { continueToModel: true as const, usage };
        }
        const result = await employeeReply(user, name, text, member, {
            intent,
            expectedDraftId: active?.draft.id ?? null,
            expectedVersion: active?.version ?? null,
        });
        await finishPlatformRun(user, run, true, { code: "employee_leave_intent" });
        return {
            ...result,
            usage,
            interpreterModel: response.model,
            continueToModel: false as const,
        };
    } catch (error) {
        await finishPlatformRun(user, run, false, error).catch(() => {});
        throw error;
    }
}
