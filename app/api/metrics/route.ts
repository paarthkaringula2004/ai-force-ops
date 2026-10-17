import { db } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const components = [
    "agent-studio",
    "reactflow",
    "published-agent",
    "epace",
    "eassist",
    "semaphore",
    "review-center",
];
export async function GET() {
    let database = 0;
    const metrics = [
        "# HELP eassist_app_up Whether the HTTP application is responding.",
        "# TYPE eassist_app_up gauge",
        "eassist_app_up 1",
        "# HELP eassist_process_uptime_seconds Application process uptime.",
        "# TYPE eassist_process_uptime_seconds gauge",
        `eassist_process_uptime_seconds ${process.uptime()}`,
    ];
    try {
        const [events, alerts, inventory, worker, integrations, deliveries] = await Promise.all([
            db.query(
                "SELECT source,status,count(*)::int AS count FROM platform_events GROUP BY source,status",
            ),
            db.query(
                "SELECT source,count(*)::int AS count FROM platform_alerts WHERE state='active' GROUP BY source",
            ),
            db.query(
                "SELECT (SELECT count(*) FROM agents WHERE deleted_at IS NULL)::int AS agents,(SELECT count(*) FROM agent_workflows)::int AS workflows,(SELECT count(*) FROM epace_projects)::int AS projects,(SELECT count(*) FROM published_agents WHERE active)::int AS published",
            ),
            db.query(
                "SELECT extract(epoch from checked_at)::float AS checked FROM integration_worker_health WHERE id=true",
            ),
            db.query(
                "SELECT kind,state,count(*)::int AS count FROM eassist_connections WHERE enabled GROUP BY kind,state",
            ),
            db.query(
                "SELECT count(*)::int AS count FROM platform_alert_deliveries WHERE state='error'",
            ),
        ]);
        database = 1;
        metrics.push(
            "# HELP aiforce_operations_events Number of retained operation events, with 30 day retention.",
            "# TYPE aiforce_operations_events gauge",
            "# HELP aiforce_active_alerts Active website alerts by component.",
            "# TYPE aiforce_active_alerts gauge",
            "# HELP aiforce_pending_executions Executions still pending in the durable event store.",
            "# TYPE aiforce_pending_executions gauge",
        );
        for (const component of components) {
            for (const status of [
                "success",
                "error",
                "blocked",
                "pending",
                "warning",
                "resolved",
                "deleted",
                "connected",
                "unverified",
            ]) {
                metrics.push(
                    `aiforce_operations_events{component="${component}",result="${status}"} ${events.rows.find((r) => r.source === component && r.status === status)?.count || 0}`,
                );
            }
            metrics.push(
                `aiforce_active_alerts{component="${component}"} ${alerts.rows.find((r) => r.source === component)?.count || 0}`,
            );
            metrics.push(
                `aiforce_pending_executions{component="${component}"} ${events.rows.find((r) => r.source === component && r.status === "pending")?.count || 0}`,
            );
        }
        for (const resource of ["agents", "workflows", "projects", "published"]) {
            metrics.push(
                `# TYPE aiforce_${resource} gauge`,
                `aiforce_${resource} ${inventory.rows[0][resource]}`,
            );
        }
        metrics.push(
            "# TYPE aiforce_worker_last_contact_seconds gauge",
            `aiforce_worker_last_contact_seconds ${worker.rows[0]?.checked || 0}`,
            "# TYPE aiforce_alertmanager_delivery_failures gauge",
            `aiforce_alertmanager_delivery_failures ${deliveries.rows[0]?.count || 0}`,
            "# TYPE aiforce_integrations gauge",
        );
        for (const kind of ["prometheus", "alertmanager", "semaphore", "servicenow"])
            for (const state of ["connected", "error", "unverified"])
                metrics.push(
                    `aiforce_integrations{kind="${kind}",state="${state}"} ${integrations.rows.find((r) => r.kind === kind && r.state === state)?.count || 0}`,
                );
    } catch {}
    metrics.push(
        "# HELP eassist_database_up Whether the operations data tables are reachable.",
        "# TYPE eassist_database_up gauge",
        `eassist_database_up ${database}`,
    );
    return new Response(metrics.join("\n") + "\n", {
        headers: {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
