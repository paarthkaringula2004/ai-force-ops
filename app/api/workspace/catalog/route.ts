import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { CatalogError, createCatalogEntry, deleteDepartment } from "@/lib/staff-catalog";
export const runtime = "nodejs";
export async function POST(request: Request) {
    return mutate(request, false);
}
export async function DELETE(request: Request) {
    return mutate(request, true);
}
async function mutate(request: Request, remove: boolean) {
    const actor = (await getRequestSession(request))?.user?.id;
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    let body;
    try {
        const raw = await request.text();
        if (raw.length > 2000) throw new Error();
        body = JSON.parse(raw);
    } catch {
        return Response.json({ error: "Invalid catalog entry." }, { status: 400 });
    }
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const entry = remove
            ? await deleteDepartment(client, actor, body)
            : await createCatalogEntry(client, actor, body);
        await client.query("COMMIT");
        return Response.json(
            { saved: true, deleted: remove, entry },
            { status: remove ? 200 : 201 },
        );
    } catch (e) {
        await client.query("ROLLBACK");
        return Response.json(
            {
                error:
                    e instanceof CatalogError
                        ? e.message
                        : e instanceof Error && "status" in e
                          ? e.message
                          : "Could not change the catalog entry.",
            },
            {
                status:
                    e instanceof CatalogError
                        ? e.status
                        : e instanceof Error && "status" in e
                          ? Number(e.status)
                          : 500,
            },
        );
    } finally {
        client.release();
    }
}
