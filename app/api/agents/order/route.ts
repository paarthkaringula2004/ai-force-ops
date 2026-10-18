import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { validAgentOrder } from "@/lib/agent-card-order";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";

export async function PUT(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
    if (!permitted(await workspaceAccess(session.user.id), "agent_studio"))
        return Response.json({ error: "Agent Studio access required." }, { status: 403 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid order." }, { status: 400 });
    }
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `agent-order:${session.user.id}`,
        ]);
        const owned = await client.query<{ id: string }>(
            "SELECT id FROM agents WHERE admin_library_access($1,user_id) AND deleted_at IS NULL FOR UPDATE",
            [session.user.id],
        );
        if (
            !validAgentOrder(
                body?.ids,
                owned.rows.map((row) => row.id),
            )
        ) {
            await client.query("ROLLBACK");
            return Response.json(
                { error: "Your agent list changed. Refresh before rearranging again." },
                { status: 409 },
            );
        }
        const saved = await client.query(
            "INSERT INTO agent_card_orders(user_id,agent_ids) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET agent_ids=EXCLUDED.agent_ids,updated_at=now() RETURNING updated_at",
            [session.user.id, JSON.stringify(body.ids)],
        );
        await client.query("COMMIT");
        return Response.json({ saved: true, updatedAt: saved.rows[0].updated_at });
    } catch {
        await client.query("ROLLBACK");
        return Response.json(
            { error: "Could not save the rearrangement. Try again." },
            { status: 503 },
        );
    } finally {
        client.release();
    }
}
