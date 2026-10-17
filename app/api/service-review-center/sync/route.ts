import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/organization-session";
import { syncUser } from "@/lib/eassist/sync";
export const runtime = "nodejs";
export async function POST(request: Request) {
    try {
        requireSameOrigin(request);
    } catch (e) {
        return Response.json(
            { error: (e as Error).message },
            { status: e instanceof IngestionError ? e.status : 403 },
        );
    }
    const user = (await getRequestSession(request))?.user?.id;
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!permitted(await workspaceAccess(user), "integrations"))
        return Response.json(
            { error: "Integration access is required to refresh sources." },
            { status: 403 },
        );
    await syncUser(user);
    const result = await db.query(
        `SELECT c.name,c.state,c.last_error,s.last_error AS import_error,s.imported_at FROM eassist_connections c LEFT JOIN service_review_sync s ON s.connection_id=c.id WHERE c.user_id=$1 AND c.enabled=true`,
        [user],
    );
    const failed = result.rows.filter((r) => r.state === "error" || r.import_error);
    return Response.json({
        sources: result.rows.length,
        failed: failed.length,
        message: failed.length
            ? "Some sources need attention. Check Data sources."
            : result.rows.length
              ? "Source checks completed. Readings update automatically."
              : "Connect a source in eAssist to start collecting readings.",
    });
}
