import { audit } from "@/lib/eassist/store";
import { db } from "@/lib/db";
import { syncTask, syncConnection } from "@/lib/eassist/sync";
import { InputError, type PrivateConnection } from "@/lib/eassist/transport";
import { operationalStatus } from "./operational-display";
export async function verifyRecovery(c: PrivateConnection, taskId: string) {
    if (c.kind !== "semaphore" || !/^\d+$/.test(taskId))
        throw new InputError("Choose a valid recovery task.");
    const prior = (
        await db.query(
            "SELECT data FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind='tasks' AND external_id=$3",
            [c.user_id, c.id, taskId],
        )
    ).rows[0];
    if (
        !prior ||
        !/^Review Center recovery for failed task \d+$/.test(String(prior.data.message || ""))
    )
        throw new InputError("Recovery task not found.", 404);
    const task = await syncTask(c, taskId),
        status = String(task.status || "unknown"),
        terminal = ["success", "error", "failed", "stopped"].includes(status);
    return {
        ok: true,
        taskId,
        status,
        terminal,
        verified: status === "success",
        message:
            status === "success"
                ? "Verified: the recovery run completed successfully. This confirms this workflow run; other service checks remain separate."
                : terminal
                  ? "Recovery did not succeed. Review the new run’s error before trying again."
                  : `Recovery ${operationalStatus(status).toLowerCase()}. Waiting for a final result.`,
    };
}

export async function repairSource(c: PrivateConnection) {
    const started = Date.now();
    await syncConnection(c, true);
    const current = (
        await db.query(
            "SELECT c.state,c.last_error,c.checked_at,s.last_error AS import_error,s.imported_at FROM eassist_connections c LEFT JOIN service_review_sync s ON s.connection_id=c.id WHERE c.id=$1 AND c.user_id=$2",
            [c.id, c.user_id],
        )
    ).rows[0];
    const checked = !!current?.checked_at && new Date(current.checked_at).getTime() >= started;
    const recovered =
        checked &&
        current.state === "connected" &&
        !current.import_error &&
        !!current.imported_at &&
        new Date(current.imported_at).getTime() >= started;
    const message = recovered
        ? "Verified: the source is responding and its latest readings were imported."
        : checked
          ? "The check completed, but recovery is not verified. Review the source or import error in the diagnosis."
          : "A background check is already in progress. Recovery is pending; the live status will update when it finishes.";
    await audit(c.user_id, c.id, "Assistant source check", c.name, message);
    return {
        ok: true,
        verified: recovered,
        pending: !checked,
        checkedAfter: new Date(started).toISOString(),
        message,
    };
}
