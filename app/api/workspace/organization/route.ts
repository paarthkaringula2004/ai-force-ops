import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { workspaceAccess } from "@/lib/workspace-access";
import { securityPolicy } from "@/lib/eassist/security";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
export const runtime = "nodejs";
export async function GET(request: Request) {
    const actor = (await getRequestSession(request))?.user?.id;
    if (!actor || (await workspaceAccess(actor)).role !== "admin")
        return Response.json({ error: "Admin access required." }, { status: 403 });
    const [settings, events, jobs] = await Promise.all([
        db.query("SELECT * FROM organization_workspace WHERE id=true"),
        db.query(
            'SELECT e.*,u.name FROM organization_security_events e LEFT JOIN "user" u ON u.id=e.actor_id ORDER BY e.created_at DESC LIMIT 100',
        ),
        db.query("SELECT * FROM organization_vacancies ORDER BY title"),
    ]);
    return Response.json(
        {
            settings: settings.rows[0],
            events: events.rows,
            jobs: jobs.rows,
            policy: await securityPolicy(actor),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
export async function PATCH(request: Request) {
    const actor = (await getRequestSession(request))?.user?.id;
    if (!actor || (await workspaceAccess(actor)).role !== "admin")
        return Response.json({ error: "Admin access required." }, { status: 403 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const raw = await request.text();
    if (raw.length > 10000) return Response.json({ error: "Request too large." }, { status: 413 });
    let b;
    try {
        b = JSON.parse(raw);
    } catch {
        return Response.json({ error: "Invalid update." }, { status: 400 });
    }
    const c = await db.connect();
    try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(8470220029)");
        if (
            !(
                await c.query(
                    "SELECT 1 FROM workspace_members WHERE user_id=$1 AND role='admin' AND active",
                    [actor],
                )
            ).rowCount
        ) {
            await c.query("ROLLBACK");
            return Response.json({ error: "Admin access required." }, { status: 403 });
        }
        if (b.action === "settings") {
            if (
                typeof b.ownerId !== "string" ||
                !Number.isInteger(b.requestsPerMinute) ||
                b.requestsPerMinute < 30 ||
                b.requestsPerMinute > 600 ||
                !(
                    await c.query(
                        "SELECT 1 FROM workspace_members WHERE user_id=$1 AND role='admin' AND active",
                        [b.ownerId],
                    )
                ).rowCount
            )
                throw new Error(
                    "Select an active Admin integration owner and a limit of 30–600 requests per minute.",
                );
            await c.query(
                "UPDATE organization_workspace SET owner_id=$1,requests_per_minute=$2,updated_at=now() WHERE id=true",
                [b.ownerId, b.requestsPerMinute],
            );
        } else if (b.action === "vacancy") {
            if (
                typeof b.title !== "string" ||
                !b.title.trim() ||
                b.title.length > 160 ||
                typeof b.description !== "string" ||
                b.description.length > 2000 ||
                typeof b.applicationUrl !== "string" ||
                b.applicationUrl.length > 1000 ||
                typeof b.active !== "boolean"
            )
                throw new Error("Enter a vacancy title, description, application link and status.");
            const url = new URL(b.applicationUrl);
            if (url.protocol !== "https:") throw new Error("Application links must use HTTPS.");
            await c.query(
                `INSERT INTO organization_vacancies(id,title,department,location,application_url,description,active) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,department=excluded.department,location=excluded.location,application_url=excluded.application_url,description=excluded.description,active=excluded.active,updated_at=now()`,
                [
                    b.id || randomUUID(),
                    b.title.trim(),
                    String(b.department || "").slice(0, 160),
                    String(b.location || "").slice(0, 160),
                    b.applicationUrl,
                    b.description,
                    b.active,
                ],
            );
        } else throw new Error("Unknown organization action.");
        await c.query(
            "INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,$3,$4::jsonb)",
            [
                randomUUID(),
                actor,
                "organization." + b.action,
                JSON.stringify({
                    owner: b.ownerId,
                    limit: b.requestsPerMinute,
                    title: b.title,
                    active: b.active,
                }),
            ],
        );
        await c.query("COMMIT");
        return Response.json({ saved: true });
    } catch (e) {
        await c.query("ROLLBACK");
        return Response.json(
            { error: e instanceof Error ? e.message : "Could not update the organization." },
            { status: 400 },
        );
    } finally {
        c.release();
    }
}
