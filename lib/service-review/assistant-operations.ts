import { sharedOperationsOwner } from "@/lib/eassist/organization-context";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { PaceError } from "@/lib/epace/store";
import { connection } from "@/lib/eassist/store";
import { repairSource } from "./recovery";
import { operationalStatus, recoveryAdvice } from "./operational-display";
import { db } from "@/lib/db";
import { array, object } from "@/lib/eassist/types";
import { isDailyOverview, reviewPeriod, withinPeriod, sourceDate } from "./reply-context";
import { explicitReviewAction } from "./action-intent";
import { organizationWriteAllowed } from "@/lib/organization-security";

export function safeOperationalText(value: unknown, max = 1400) {
    return String(value ?? "")
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
        .replace(/\b(?:Bearer\s+)[\w.+/=-]+/gi, "Bearer [redacted]")
        .replace(
            /((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;]+/gi,
            "$1[redacted]",
        )
        .replace(
            /\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{15,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g,
            "[redacted]",
        )
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[redacted]@")
        .replace(/([?&](?:token|key|secret|password|api_key)=)[^&\s]+/gi, "$1[redacted]")
        .slice(0, max);
}
const validTime = (value: unknown) => !!value && Number.isFinite(new Date(String(value)).getTime());
const atTime = (value: unknown) =>
    validTime(value)
        ? new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "medium",
              timeZone: "Asia/Kolkata",
          }).format(new Date(String(value))) + " IST"
        : "not recorded";
const workflowTime = (task: { eventAt: unknown; observedAt: unknown }) =>
    task.eventAt
        ? `Run ended: ${atTime(task.eventAt)}.`
        : `Status recorded: ${atTime(task.observedAt)} (run time unavailable).`;
export const isOverviewQuestion = (question: string) =>
    /^(?:please\s+)?(?:(?:is|are)\s+(?:everything|all(?:\s+systems)?|things)\s+(?:good|ok|okay|fine|healthy|working(?:\s+(?:fine|well|properly))?|running smoothly)|(?:all|everything)\s+(?:good|ok|okay|fine)|anything\s+(?:wrong|to worry about)|(?:any|are there any|do we have any)\s+(?:issues|problems|errors|failures)|(?:how(?:'s| is| are))\s+(?:everything|things|we doing)|(?:what(?:'s| is))\s+(?:going on|the overall status)|(?:give me|show me|check)\s+(?:an?\s+)?(?:overall|quick)\s+(?:health|status|summary))$/i.test(
        question.trim().replace(/[.!?]+$/, ""),
    );
const terms = (question: string) =>
    isOverviewQuestion(question) || isDailyOverview(question)
        ? []
        : question
              .toLowerCase()
              .split(/[^a-z0-9.-]+/)
              .filter(
                  (w) =>
                      w.length > 2 &&
                      !new Set([
                          "update",
                          "updates",
                          "latest",
                          "about",
                          "abot",
                          "whats",
                          "reconnect",
                          "recheck",
                          "repair",
                          "recover",
                          "healing",
                          "connection",
                          "connections",
                          "list",
                          "out",
                          "each",
                          "every",
                          "details",
                          "detailed",
                          "logs",
                          "full",
                          "report",
                          "summary",
                          "what",
                          "happened",
                          "happening",
                          "that",
                          "this",
                          "the",
                          "with",
                          "please",
                          "show",
                          "tell",
                          "give",
                          "check",
                          "health",
                          "healthy",
                          "good",
                          "okay",
                          "fine",
                          "working",
                          "properly",
                          "status",
                          "overall",
                          "entire",
                          "everything",
                          "website",
                          "project",
                          "review",
                          "center",
                          "workflow",
                          "workflows",
                          "error",
                          "errors",
                          "fix",
                          "retry",
                          "refresh",
                          "failed",
                          "failure",
                          "service",
                          "services",
                          "all",
                          "how",
                          "why",
                          "our",
                          "for",
                          "and",
                          "now",
                          "current",
                      ]).has(w),
              );
export const isOperationalQuestion = (q: string) =>
    isOverviewQuestion(q) ||
    /semaphore|prometheus|alertmanager|servicenow|workflow|health|happened|happening|uptime|availability|metrics?|incident|data sources?|connection|website|platform|inventory|forecast|lifecycle|value dashboard|executive|react|deploy|build|repair|recover|reconnect|recheck|self.heal|retry|fix|refresh|show details/i.test(
        q,
    );
export async function operationalSnapshot(user: string, question = "") {
    if (!permitted(await workspaceAccess(user), "operations"))
        throw new PaceError("Operations access is required for operational diagnostics.", 403);
    user = await sharedOperationsOwner(user);
    const canSecurity = permitted(await workspaceAccess(user), "security");
    const [
        connections,
        records,
        tasks,
        alerts,
        worker,
        securityWorker,
        scan,
        activity,
        collectors,
        events,
        sourceEvents,
        alertCounts,
    ] = await Promise.all([
        db.query(
            `SELECT c.id,c.name,c.kind,c.base_url,c.enabled,c.state,c.last_error,c.checked_at,s.last_error AS import_error,s.imported_at FROM eassist_connections c LEFT JOIN service_review_sync s ON s.connection_id=c.id WHERE c.user_id=$1 ORDER BY c.name`,
            [user],
        ),
        db.query(
            `SELECT DISTINCT ON(r.record_type,r.record_key) r.record_type,r.record_key,r.payload,r.observed_at,r.source_connection_id,c.name AS source,c.state,c.enabled,c.last_error,c.checked_at,s.last_error AS import_error,s.imported_at FROM service_review_records r LEFT JOIN eassist_connections c ON c.id=r.source_connection_id LEFT JOIN service_review_sync s ON s.connection_id=c.id WHERE r.user_id=$1 AND (r.source_connection_id IS NULL OR (c.enabled AND r.is_current)) ORDER BY r.record_type,r.record_key,r.observed_at DESC LIMIT 500`,
            [user],
        ),
        db.query(
            `SELECT t.connection_id,t.external_id,t.data,t.updated_at,c.name AS source,c.state,c.enabled,c.checked_at,p.data->>'name' AS template_name,o.data AS output FROM eassist_records t JOIN eassist_connections c ON c.id=t.connection_id AND c.user_id=t.user_id LEFT JOIN eassist_records p ON p.user_id=t.user_id AND p.connection_id=t.connection_id AND p.kind='templates' AND p.external_id=t.data->>'template_id' LEFT JOIN eassist_records o ON o.user_id=t.user_id AND o.connection_id=t.connection_id AND o.kind='output' AND o.external_id=t.external_id WHERE t.user_id=$1 AND t.kind='tasks' AND c.enabled ORDER BY t.updated_at DESC LIMIT 100`,
            [user],
        ),
        db.query(
            `SELECT summary,severity,state,detail,updated_at FROM platform_alerts WHERE ($1::text IS NOT NULL) AND ($2::boolean OR (event_key NOT LIKE 'vulnerability:%' AND event_key NOT LIKE 'security%')) ORDER BY updated_at DESC LIMIT 20`,
            [user, canSecurity],
        ),
        db.query("SELECT checked_at FROM integration_worker_health WHERE id=true"),
        canSecurity
            ? db.query("SELECT checked_at,capabilities FROM security_scan_worker WHERE id=1")
            : Promise.resolve({ rows: [] }),
        canSecurity
            ? db.query(
                  "SELECT status,phase,progress,error,completed_at FROM security_scan_jobs WHERE $1::text IS NOT NULL ORDER BY created_at DESC LIMIT 1",
                  [user],
              )
            : Promise.resolve({ rows: [] }),
        db.query(
            `SELECT action,target,detail,created_at FROM eassist_activity WHERE user_id=$1 AND ($2::boolean OR action NOT LIKE 'security%') ORDER BY created_at DESC LIMIT 10`,
            [user, canSecurity],
        ),
        canSecurity
            ? db.query(
                  "SELECT name,enabled,last_error,checked_at FROM security_tool_connections WHERE user_id=$1 ORDER BY created_at",
                  [user],
              )
            : Promise.resolve({ rows: [] }),
        db.query(
            `SELECT p.id,p.source,p.action,p.resource_id,p.status,p.summary,p.href,p.created_at,a.name AS agent_name FROM platform_events p LEFT JOIN agents a ON a.user_id=p.user_id AND a.id::text=p.resource_id WHERE $1::text IS NOT NULL ORDER BY p.created_at DESC LIMIT 100`,
            [user],
        ),
        db.query(
            `SELECT r.kind,r.data,r.updated_at,c.name,c.state,c.checked_at FROM eassist_records r JOIN eassist_connections c ON c.id=r.connection_id AND c.user_id=r.user_id WHERE r.user_id=$1 AND c.enabled AND r.kind IN ('alerts','incidents') ORDER BY r.updated_at DESC LIMIT 100`,
            [user],
        ),
        db.query(
            "SELECT max(updated_at) FILTER(WHERE state='active') AS latest_update,count(*) FILTER(WHERE state='active')::int AS active,count(*) FILTER(WHERE state='active' AND severity IN ('critical','high'))::int AS urgent FROM platform_alerts WHERE ($1::text IS NOT NULL) AND ($2::boolean OR (event_key NOT LIKE 'vulnerability:%' AND event_key NOT LIKE 'security%'))",
            [user, canSecurity],
        ),
    ]);
    const period = reviewPeriod(question),
        words = terms(question),
        score = (v: unknown) =>
            words.filter((w) => JSON.stringify(v).toLowerCase().includes(w)).length;
    const fresh = (at: unknown) => !!at && Date.now() - new Date(String(at)).getTime() < 120000;
    const cleanConnections = connections.rows.map((c) => ({
        ...c,
        last_error: safeOperationalText(c.last_error),
        import_error: safeOperationalText(c.import_error),
        stale:
            !c.enabled ||
            c.state !== "connected" ||
            !!c.import_error ||
            !fresh(c.checked_at) ||
            !fresh(c.imported_at),
    }));
    const cleanTasks = tasks.rows.map((t) => ({
        connectionId: t.connection_id,
        id: t.external_id,
        templateId: String(t.data.template_id || ""),
        name: safeOperationalText(t.template_name || t.data.name || `Task ${t.external_id}`, 160),
        source: t.source,
        status: String(t.data.status || "unknown"),
        eventAt: validTime(t.data.end) ? t.data.end : null,
        observedAt: t.updated_at,
        checkedAt: t.checked_at,
        stale: t.state !== "connected" || !fresh(t.checked_at),
        error: safeOperationalText(
            t.data.error ||
                (["error", "failed"].includes(String(t.data.status)) &&
                !/^Triggered from|^Review Center recovery/i.test(String(t.data.message || ""))
                    ? t.data.message
                    : ""),
        ),
        output: array(object(t.output).lines)
            .slice(-8)
            .map((l) => safeOperationalText(l.output, 400))
            .join("\n"),
        canRetry:
            t.enabled &&
            t.state === "connected" &&
            fresh(t.checked_at) &&
            ["error", "failed"].includes(String(t.data.status)) &&
            /^\d+$/.test(String(t.data.template_id || "")),
    }));
    for (const t of cleanTasks) {
        const failure = t.error + "\n" + t.output;
        if (
            ["error", "failed"].includes(t.status) &&
            /executable file not found|command not found|not recognized as an internal/i.test(
                failure,
            )
        ) {
            t.error =
                "Runner runtime is missing: " +
                (failure.match(/exec: "([^"]+)"/)?.[1] || "the required command") +
                ". Install/configure that runtime on the automation runner or use a compatible workflow template before retrying.";
            t.canRetry = false;
        }
        if (recoveryAdvice(failure).blocked) t.canRetry = false;
    }
    const cleanRecords = records.rows.map((r) => ({
        type: r.record_type,
        source: r.source || "External collector",
        observedAt: r.observed_at,
        checkedAt: r.checked_at,
        stale:
            !fresh(r.observed_at) ||
            (r.source_connection_id &&
                (r.state !== "connected" ||
                    !!r.import_error ||
                    !fresh(r.checked_at) ||
                    !fresh(r.imported_at))),
        facts: Object.fromEntries(
            [
                "device",
                "status",
                "description",
                "label",
                "value",
                "unit",
                "scope",
                "service",
                "availability",
                "stage",
                "count",
                "region",
                "category",
                "environment",
                "period",
                "lowerBound",
                "upperBound",
                "actual",
                "samples",
            ]
                .filter((k) => r.payload[k] !== undefined)
                .map((k) => [
                    k,
                    typeof r.payload[k] === "string"
                        ? safeOperationalText(r.payload[k], 500)
                        : r.payload[k],
                ]),
        ),
    }));
    const rank = <T>(items: T[]) =>
        items
            .map((item) => ({ item, score: score(item) }))
            .filter((v) => !words.length || v.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((v) => v.item);
    const selectedTasks = rank(cleanTasks.filter((t) => withinPeriod(t.eventAt, period))).slice(
            0,
            12,
        ),
        relatedSources = new Set(selectedTasks.map((t) => t.connectionId)),
        selectedConnections = cleanConnections.filter(
            (c) => !words.length || score(c) > 0 || relatedSources.has(c.id),
        );
    const selectedEvents = rank(
        events.rows
            .filter(
                (e) =>
                    withinPeriod(e.created_at, period) &&
                    (canSecurity ||
                        !(
                            /vulnerabilit|security|scanner/i.test(e.action) ||
                            /automated-alerts|vulnerabilit|scans/.test(e.href || "")
                        )),
            )
            .map((e) => ({
                ...e,
                name: safeOperationalText(e.agent_name || e.action, 160),
                summary: safeOperationalText(e.summary),
                href: /^\/agent-builder\/[0-9a-f-]{36}\/preview$/.test(e.href) ? e.href : "",
            })),
    ).slice(0, 10);
    const selectedSourceEvents = rank(
        sourceEvents.rows
            .map((e) => {
                const annotations = object(e.data.annotations),
                    labels = object(e.data.labels);
                const incident = e.kind === "incidents";
                return {
                    kind: e.kind,
                    number: safeOperationalText(e.data.number, 80),
                    name: safeOperationalText(
                        annotations.summary ||
                            e.data.short_description ||
                            labels.alertname ||
                            e.data.number ||
                            e.kind,
                        200,
                    ),
                    source: e.name,
                    status: safeOperationalText(
                        incident
                            ? (
                                  {
                                      1: "New",
                                      2: "In progress",
                                      3: "On hold",
                                      6: "Resolved",
                                      7: "Closed",
                                      8: "Canceled",
                                  } as Record<string, string>
                              )[String(e.data.state)] || e.data.state
                            : e.data.state ||
                                  object(e.data.status).state ||
                                  e.data.status ||
                                  "unknown",
                        80,
                    ),
                    detail: safeOperationalText(
                        annotations.description || e.data.description || "",
                    ),
                    observedAt: e.updated_at,
                    sourceUpdatedAt: sourceDate(
                        incident ? e.data.sys_updated_on : e.data.endsAt || e.data.startsAt,
                    ),
                    stale: e.state !== "connected" || !fresh(e.checked_at),
                };
            })
            .filter((e) => withinPeriod(e.sourceUpdatedAt, period)),
    ).slice(0, 10);
    return {
        canSecurity,
        alertCounts: alertCounts.rows[0],
        sourceEvents: selectedSourceEvents,
        events: selectedEvents,
        connections: selectedConnections,
        tasks: selectedTasks,
        readings: rank(cleanRecords).slice(0, 25),
        alerts: alerts.rows.map((a) => ({
            ...a,
            summary: safeOperationalText(a.summary),
            detail: safeOperationalText(a.detail),
        })),
        activity: activity.rows.map((a) => ({
            ...a,
            detail: safeOperationalText(a.detail),
            target: safeOperationalText(a.target),
        })),
        collectors: collectors.rows.map((c) => ({
            ...c,
            last_error: safeOperationalText(c.last_error),
        })),
        workers: {
            integration: {
                online: fresh(worker.rows[0]?.checked_at),
                checkedAt: worker.rows[0]?.checked_at,
            },
            security: {
                online: fresh(securityWorker.rows[0]?.checked_at),
                checkedAt: securityWorker.rows[0]?.checked_at,
            },
        },
        scan: scan.rows[0]
            ? { ...scan.rows[0], error: safeOperationalText(scan.rows[0].error) }
            : null,
        scope: words.length ? "matching" : "overview",
        totalConnections: connections.rows.length,
        attention: cleanConnections.filter((c) => c.enabled && c.stale).length,
    };
}
export async function operationalAnswer(user: string, question: string) {
    let repairNote = "";
    if (
        explicitReviewAction(question) === "refresh" &&
        !permitted(await workspaceAccess(user), "integrations")
    )
        throw new PaceError("Integration access is required to repair or refresh sources.", 403);
    if (explicitReviewAction(question) === "refresh") {
        await organizationWriteAllowed(user);
        const before = await operationalSnapshot(user, question),
            targets = before.connections.filter((c) => c.enabled).slice(0, 3);
        for (const target of targets) {
            const result = await repairSource(await connection(user, target.id));
            repairNote += `**${target.name}:** ${safeOperationalText(result.message)}\n\n`;
        }
    }
    const showLogs = /\b(?:logs?|output|debug)\b/i.test(question),
        data = await operationalSnapshot(user, question),
        evidence: Record<string, unknown>[] = [];
    const cite = (
        type: string,
        source: string,
        at: unknown,
        stale: boolean,
        facts: Record<string, unknown>,
    ) => {
        const number = evidence.length + 1;
        evidence.push({
            number,
            type,
            source,
            observedAt: at || new Date().toISOString(),
            stale,
            facts,
        });
        return `[${number}]`;
    };
    const period = reviewPeriod(question);
    if (period) {
        const done = data.tasks.filter((t) => t.status === "success").length,
            failed = data.tasks.filter((t) => ["failed", "error"].includes(t.status)).length;
        let answer = `For **${period.label} (Asia/Kolkata)**, the available recorded evidence shows:\n\n- **Workflows that ended that day:** ${done} completed, ${failed} failed (${data.tasks.length} matching runs shown).\n- **Source alerts/incidents updated that day:** ${data.sourceEvents.length} matching records shown.\n- **Website/agent events that day:** ${data.events.length} matching events shown.`;
        for (const t of data.tasks.slice(0, 4)) {
            const ref = cite("workflow", t.source, t.eventAt, t.stale, {
                device: t.name,
                status: t.status,
                error: t.error,
            });
            answer += `\n- ${t.name}: ${operationalStatus(t.status)} — ${atTime(t.eventAt)}. ${ref}`;
        }
        for (const e of data.sourceEvents.slice(0, 4)) {
            const ref = cite(e.kind, e.source, e.sourceUpdatedAt, e.stale, {
                device: e.name,
                status: e.status,
                number: e.number,
            });
            answer += `\n- ${e.number || e.name}: ${e.status}; source updated ${atTime(e.sourceUpdatedAt)}. ${ref}`;
        }
        for (const e of data.events.slice(0, 4)) {
            const ref = cite("platform-event", e.source, e.created_at, false, {
                device: e.name,
                status: e.status,
                description: e.summary,
            });
            answer += `\n- ${e.name}: ${e.status} — ${atTime(e.created_at)}. ${ref}`;
        }
        answer +=
            "\n\nCurrent connection checks are separate from that day’s activity. Importing an old run or incident today does not make it a new event. This is a bounded summary of available records (latest 100 workflows, 100 source records and 100 platform events before date filtering), not a complete audit export.";
        return {
            answer,
            evidence,
            actions: [{ kind: "operations", query: question, autoOpen: false }],
        };
    }
    if (
        data.scope === "overview" &&
        !/\b(?:detailed|details|logs|list|show all|full report|all readings)\b/i.test(question)
    ) {
        const healthy = data.connections.filter((c) => c.enabled && !c.stale),
            issues: string[] = [];
        if (data.alertCounts.active) {
            const ref = cite(
                "alerts",
                "Current account alerts",
                new Date().toISOString(),
                false,
                data.alertCounts,
            );
            issues.push(
                `**${data.alertCounts.active} open alerts**${data.alertCounts.urgent ? `, including ${data.alertCounts.urgent} high-priority alerts` : ""}, need review. Latest alert update: ${atTime(data.alertCounts.latest_update)}. ${ref}`,
            );
        }
        for (const c of data.connections.filter((c) => c.enabled && c.stale).slice(0, 3)) {
            const ref = cite("connection", c.name, c.checked_at, true, {
                device: c.name,
                error: c.last_error,
                importError: c.import_error,
                state: c.state,
            });
            issues.push(
                c.state === "error"
                    ? `**${c.name} isn't connecting.** ${/timed out|could not be reached/i.test(c.last_error) ? "The last connection check timed out." : c.last_error || "The source check failed."} Last checked: ${atTime(c.checked_at)}. ${ref}`
                    : `**${c.name} needs a fresh check.** ${c.import_error ? "Its latest readings could not be imported." : "Its saved readings are too old to confirm current health."} Last checked: ${atTime(c.checked_at)}. ${ref}`,
            );
        }
        const latestTasks = [...data.tasks]
            .sort((a, b) => Number(b.id) - Number(a.id))
            .filter(
                (t, i, all) =>
                    all.findIndex(
                        (other) =>
                            other.connectionId === t.connectionId &&
                            other.templateId === t.templateId,
                    ) === i,
            );
        for (const t of latestTasks
            .filter((t) => ["error", "failed"].includes(t.status))
            .slice(0, 2)) {
            const ref = cite("workflow", t.source, t.eventAt || t.observedAt, t.stale, {
                device: t.name,
                status: t.status,
                error: t.error,
                output: t.output,
            });
            issues.push(
                `**${t.name} failed${t.stale ? " on its last recorded run" : ""}.** ${/Runner runtime is missing/i.test(t.error) ? "Its runner doesn't have the required command installed. Configure that runtime before retrying." : t.error || "Check its error log before retrying."} ${workflowTime(t)} ${ref}`,
            );
        }
        const down = data.readings.filter(
            (r) =>
                r.type === "health" &&
                !r.stale &&
                /^(?:down|unhealthy|failed|error|critical)$/i.test(String(r.facts.status)),
        );
        for (const r of down.slice(0, 2)) {
            const ref = cite("health", r.source, r.observedAt, false, r.facts);
            issues.push(
                `**${r.facts.device} is reporting ${String(r.facts.status).toLowerCase()}.** Observed: ${atTime(r.observedAt)}. ${ref}`,
            );
        }
        if (!data.workers.integration.online)
            issues.push(
                "The background integration worker is not reporting in, so service updates may be delayed. Last heartbeat: " +
                    atTime(data.workers.integration.checkedAt) +
                    ".",
            );
        if (data.canSecurity && !data.workers.security.online)
            issues.push(
                "The security scanner worker is not reporting in, so scans may be delayed. Last heartbeat: " +
                    atTime(data.workers.security.checkedAt) +
                    ".",
            );
        if (data.scan?.status === "failed")
            issues.push(
                `The latest security scan failed. Completed: ${atTime(data.scan.completed_at)}. ${data.scan.error || "Check the scanner status."}`,
            );
        for (const c of data.collectors.filter((c) => c.enabled && c.last_error).slice(0, 2))
            issues.push(
                `**${c.name} isn't sending scan results.** ${c.last_error} Last checked: ${atTime(c.checked_at)}.`,
            );
        const waiting = latestTasks.filter((t) => t.status === "waiting_confirmation").length;
        let answer =
            !data.totalConnections && !data.readings.length
                ? "I don’t have enough service-health data to confirm everything is okay yet."
                : issues.length
                  ? healthy.length
                      ? "Some services are responding normally, but **a few things need attention**."
                      : "**A few things need attention** before I can say everything is okay."
                  : "**The monitored services look good right now.** I haven’t found an active issue in the latest checks.";
        answer += `\n\n*Summary as of ${atTime(new Date().toISOString())}.*`;
        if (healthy.length) {
            const ref = cite(
                "health-summary",
                "Current source checks",
                new Date().toISOString(),
                false,
                { device: healthy.map((c) => c.name).join(", "), status: "Connected" },
            );
            answer += `\n\n${healthy.map((c) => c.name).join(", ")} ${healthy.length === 1 ? "is" : "are"} connected and sending recent readings. Last checked: ${healthy.map((c) => `${c.name} at ${atTime(c.checked_at)}`).join("; ")}. ${ref}`;
        }
        if (data.workers.integration.online && data.canSecurity && data.workers.security.online)
            answer += " Background updates and security scans are running.";
        if (issues.length)
            answer +=
                "\n\n" +
                issues
                    .slice(0, 5)
                    .map((issue) => "- " + issue)
                    .join("\n");
        if (waiting)
            answer += `\n\n${waiting === 1 ? "One workflow is" : `${waiting} workflows are`} waiting for approval. Status recorded: ${atTime(latestTasks.find((t) => t.status === "waiting_confirmation")?.observedAt)}.`;
        answer += issues.length
            ? "\n\n**Next step:** review the issues above. Ask me about any of them, or choose **View details** for checks and recovery."
            : "\n\nI’ll keep watching the connected sources. Ask **“Show details”** if you want a closer look.";
        return {
            answer: repairNote + answer,
            evidence,
            actions: [{ kind: "operations", query: "", autoOpen: false }],
        };
    }
    const completed = data.tasks.filter((t) => t.status === "success").length,
        failed = data.tasks.filter((t) => ["error", "failed"].includes(t.status)).length,
        pending = data.tasks.filter((t) => t.status === "waiting_confirmation").length;
    let answer =
        data.scope === "overview"
            ? `Review Center has **${data.totalConnections} operational sources**, **${data.attention} needing attention or fresh checks**.\n\n`
            : "";
    answer += `*Checked as of ${atTime(new Date().toISOString())}.*\n\n`;
    if (data.tasks.length)
        answer += `**Workflow overview:** ${completed} completed, ${failed} failed, ${pending} awaiting approval in the ${data.tasks.length} recorded runs. These are historical results, not live server-health measurements.\n\n`;
    for (const c of data.connections) {
        const ref = cite("connection", c.name, c.checked_at, c.stale, {
            device: c.name,
            state: c.state,
            error: c.last_error,
            importError: c.import_error,
            lastImportedAt: c.imported_at,
        });
        answer += `**${c.name}**: ${!c.enabled ? "disabled" : c.state === "error" ? "connection failed" : c.stale ? "readings need a fresh check" : "connected; recent source and Review Center checks"}. ${ref}\n`;
        if (c.last_error) answer += `- Latest source error: ${c.last_error}\n`;
        if (c.import_error) answer += `- Review Center import error: ${c.import_error}\n`;
        answer += `- Checked: ${c.checked_at ? atTime(c.checked_at) : "not checked"}. Last successful import: ${c.imported_at ? atTime(c.imported_at) : "none"}.\n`;
        if (c.stale)
            answer +=
                "- Older “Healthy” readings do not establish current health. A fresh source check can verify recovery.\n";
        answer += "\n";
    }
    if (data.tasks.length) {
        answer += "**Workflow results**\n\n";
        for (const t of data.tasks) {
            const ref = cite("workflow", t.source, t.eventAt || t.observedAt, t.stale, {
                device: t.name,
                taskId: t.id,
                status: t.status,
                error: t.error,
                output: t.output,
            });
            answer += `- **${t.name}** / task ${t.id}: **${operationalStatus(t.status)}**${t.stale ? " (source check stale; status is last known)" : ""}. ${workflowTime(t)} ${ref}\n`;
            if (t.error)
                answer += `  Cause: ${t.error.split(". Install/configure")[0]}\n  Next step: ${recoveryAdvice(t.error).nextStep}\n`;
            if (showLogs && t.output)
                answer += `  Latest output:\n\n\`\`\`text\n${t.output.replaceAll("```", "[code fence]")}\n\`\`\`\n`;
            else if (showLogs && ["failed", "error"].includes(t.status))
                answer +=
                    "  No error output has been collected. Refresh the source to fetch its task log.\n";
        }
    }
    const isTestEvent = (item: { name: string; detail: string }) =>
        /^test alert/i.test(item.name) || /manually requested integration test/i.test(item.detail);
    const visibleSourceEvents = data.sourceEvents.filter(
        (item) =>
            /\b(?:test|inactive|history|everything|all)\b/i.test(question) ||
            (!isTestEvent(item) &&
                !["inactive", "resolved", "closed", "canceled"].includes(
                    item.status.toLowerCase(),
                )),
    );
    for (const group of [
        {
            title: "Source alerts & incidents",
            items: visibleSourceEvents.filter((item) => !isTestEvent(item)),
        },
        {
            title: "Integration tests · not service outages",
            items: visibleSourceEvents.filter(isTestEvent),
        },
    ]) {
        if (!group.items.length) continue;
        answer += `\n**${group.title}**\n\n`;
        for (const item of group.items.slice(0, showLogs ? 10 : 4)) {
            const ref = cite(
                item.kind,
                item.source,
                item.sourceUpdatedAt || item.observedAt,
                item.stale,
                {
                    device: item.name,
                    number: item.number,
                    status: item.status,
                    description: item.detail,
                },
            );
            answer += `- **${item.number || item.name}**: ${item.name} — ${operationalStatus(item.status)}${item.stale ? " (last known; source check stale)" : ""}. ${showLogs ? item.detail : ""} ${item.sourceUpdatedAt ? "Source updated: " + atTime(item.sourceUpdatedAt) : "Imported: " + atTime(item.observedAt) + " (source update time unavailable)"}. ${ref}\n`;
        }
    }
    if (data.events.length) {
        answer += "\n**Website & agent execution events**\n\n";
        for (const event of data.events) {
            const ref = cite("platform-event", event.source, event.created_at, false, {
                device: event.name,
                status: event.status,
                description: event.summary,
                resource: event.resource_id,
            });
            answer += `- **${event.name}** (${event.source}): **${event.status}** / ${event.summary}, ${atTime(event.created_at)}. ${ref}\n`;
        }
    }
    const visibleReadings = /\b(?:details|list|metrics?|readings|all)\b/i.test(question)
        ? data.readings.slice(0, 12)
        : data.readings.filter((r) => r.type === "health").slice(0, 3);
    if (visibleReadings.length) {
        answer += "\n**Measured service health**\n\n";
        for (const r of visibleReadings) {
            const f = r.facts,
                ref = cite(r.type, r.source, r.observedAt, !!r.stale, f);
            answer += `- ${f.device || f.label || f.service || f.stage || f.environment || f.category || r.type}: ${f.status ?? (f.value !== undefined ? `${f.value} ${f.unit || ""}` : f.availability !== undefined ? `${f.availability}%` : (f.count ?? `${f.lowerBound ?? ""}–${f.upperBound ?? ""}`))}${r.stale ? " — **stale / last known**" : ""}${showLogs && f.description ? " / " + f.description : ""}. Observed: ${atTime(r.observedAt)}. ${ref}\n`;
        }
    }
    if (data.scope === "overview") {
        answer += `\nIntegration worker: **${data.workers.integration.online ? "connected" : "offline / heartbeat stale"}**. Security worker: **${!data.canSecurity ? "access not granted" : data.workers.security.online ? "connected" : "offline / heartbeat stale"}**.\n\n`;
        if (data.scan)
            answer += `Latest security cycle: **${data.scan.status}** / ${data.scan.phase} (${data.scan.progress}%).${data.scan.error ? " Error: " + data.scan.error : ""}\n\n`;
        if (data.activity.length) {
            answer += "**Recent operational activity**\n";
            for (const event of data.activity.slice(0, 5))
                answer += `- ${safeOperationalText(event.action)}: ${safeOperationalText(event.target)} / ${event.detail}, ${atTime(event.created_at)}.\n`;
            answer += "\n";
        }
        answer += `**${data.alerts.filter((a) => a.state === "active").length} active alerts** in the latest ${data.alerts.length} recorded alerts.\n`;
        for (const a of data.alerts.slice(0, 5))
            answer += `- ${a.summary}: ${a.severity}, ${a.state}. Updated: ${atTime(a.updated_at)}.\n`;
        for (const c of data.collectors)
            answer += `- Scanner API ${c.name}: ${!c.enabled ? "paused" : c.last_error ? "collection failed: " + c.last_error : "enabled"}, checked ${c.checked_at ? atTime(c.checked_at) : "not yet"}.\n`;
    }
    if (
        !data.connections.length &&
        !data.tasks.length &&
        !data.readings.length &&
        !data.events.length &&
        !data.sourceEvents.length &&
        data.scope === "matching"
    )
        answer +=
            "I couldn’t find that service or workflow in your connected sources. Try its name, or ask “Is everything okay?” for an overall check.\n";
    else
        answer +=
            "\n**Coverage:** connected sources and recorded workflow runs. Unmonitored services are not included. Choose **View details** for diagnosis and recovery; logs stay collapsed until requested.";
    return {
        answer: repairNote + answer,
        evidence,
        actions: [{ kind: "operations", query: question, autoOpen: false }],
    };
}
