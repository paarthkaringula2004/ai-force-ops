import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { getRequestSession } from "@/lib/organization-session";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
import { InputError } from "@/lib/eassist/transport";
import { boundedJson } from "@/lib/epace/runtime";
import { recoveryAdvice } from "@/lib/service-review/operational-display";
import { verifyRecovery, repairSource } from "@/lib/service-review/recovery";
import { operationalSnapshot } from "@/lib/service-review/assistant-operations";
import { connection, audit } from "@/lib/eassist/store";
import { syncTask } from "@/lib/eassist/sync";
import { action } from "@/lib/eassist/actions";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: Request) {
    const user = (await getRequestSession(request))?.user?.id;
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        return Response.json(
            await operationalSnapshot(
                user,
                new URL(request.url).searchParams.get("query")?.slice(0, 4000) || "",
            ),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        return Response.json({ error: "Operational diagnostics unavailable." }, { status: 503 });
    }
}
export async function POST(request: Request) {
    const user = (await getRequestSession(request))?.user?.id;
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        if (!permitted(await workspaceAccess(user), "integrations"))
            return Response.json(
                { error: "Integration access is required for recovery actions." },
                { status: 403 },
            );
        requireSameOrigin(request);
        const body = await boundedJson(request, 8000),
            c = await connection(user, String(body.connectionId || ""));
        if (!c.enabled) throw new InputError("This source is disabled.");
        if (body.action === "refresh") return Response.json(await repairSource(c));
        if (body.action === "verify-workflow")
            return Response.json(await verifyRecovery(c, String(body.taskId || "")));
        if (body.action !== "retry-workflow" || body.confirmed !== true)
            throw new InputError("Confirm the specific workflow before retrying.");
        if (
            c.kind !== "semaphore" ||
            !/^[0-9a-f-]{36}$/i.test(String(body.requestKey || "")) ||
            !/^\d+$/.test(String(body.taskId || ""))
        )
            throw new InputError("Choose a valid automation task.");
        const prior = (
            await db.query(
                "SELECT data FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind='tasks' AND external_id=$3",
                [user, c.id, body.taskId],
            )
        ).rows[0];
        if (!prior) throw new InputError("Workflow not found.", 404);
        const task = await syncTask(c, String(body.taskId));
        if (!["error", "failed"].includes(String(task.status)))
            throw new InputError(
                "This task is not currently failed. Refresh its status before acting.",
                409,
            );
        const output = (
            await db.query(
                "SELECT data FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind='output' AND external_id=$3",
                [user, c.id, body.taskId],
            )
        ).rows[0]?.data;
        if (recoveryAdvice(String(task.error || "") + " " + JSON.stringify(output || {})).blocked)
            throw new InputError(
                "A retry cannot fix this configuration or access problem. Resolve the recorded cause before retrying.",
                409,
            );
        const templateId = String(task.template_id || "");
        if (!/^\d+$/.test(templateId))
            throw new InputError("This task has no rerunnable template.");
        const template = (
            await db.query(
                "SELECT 1 FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind='templates' AND external_id=$3",
                [user, c.id, templateId],
            )
        ).rowCount;
        if (!template)
            throw new InputError("The workflow template is not available. Refresh its source.");
        const approval = await action(user, {
            action: "task.authorize",
            connectionId: c.id,
            id: templateId,
        });
        const result = await action(user, {
            action: "task.run",
            connectionId: c.id,
            id: templateId,
            approvalId: approval.approvalId,
            requestKey: body.requestKey,
            message: `Review Center recovery for failed task ${body.taskId}`,
        });
        await audit(
            user,
            c.id,
            "Assistant recovery launched",
            String(result.id),
            `Recovery for failed task ${body.taskId}; awaiting verification.`,
        );
        return Response.json({
            ok: true,
            connectionId: c.id,
            message: `Recovery workflow launched as task ${result.id}. Its result must be checked before reporting the error fixed.`,
            taskId: result.id,
        });
    } catch (e) {
        const known = e instanceof InputError || e instanceof IngestionError;
        return Response.json(
            {
                error: known
                    ? e.message
                    : "Recovery could not be completed. Check source availability and task history before retrying.",
            },
            { status: known ? e.status : 503 },
        );
    }
}
