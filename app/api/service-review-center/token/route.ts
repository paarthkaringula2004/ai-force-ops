import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/organization-session";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
export const runtime = "nodejs";

function failure(error: unknown) {
    return Response.json(
        {
            error:
                error instanceof IngestionError
                    ? error.message
                    : "Collector settings are unavailable. Check the database.",
        },
        { status: error instanceof IngestionError ? error.status : 503 },
    );
}
export async function GET(request: Request) {
    try {
        const id = (await getRequestSession(request))?.user?.id;
        if (!id) return Response.json({ error: "Sign in required." }, { status: 401 });
        const result = await db.query(
            'SELECT created_at AS "createdAt", expires_at AS "expiresAt", last_used_at AS "lastUsedAt" FROM service_review_tokens WHERE user_id=$1',
            [id],
        );
        return Response.json(
            { token: result.rows[0] || null },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        requireSameOrigin(request);
        const id = (await getRequestSession(request))?.user?.id;
        if (!id) return Response.json({ error: "Sign in required." }, { status: 401 });
        const token = randomBytes(32).toString("base64url");
        const result = await db.query(
            `INSERT INTO service_review_tokens(user_id,token_hash) VALUES($1,$2)
   ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=now(),expires_at=now()+interval '90 days',last_used_at=NULL
   RETURNING expires_at AS "expiresAt"`,
            [id, createHash("sha256").update(token).digest("hex")],
        );
        return Response.json(
            { token, expiresAt: result.rows[0].expiresAt },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function DELETE(request: Request) {
    try {
        requireSameOrigin(request);
        const id = (await getRequestSession(request))?.user?.id;
        if (!id) return Response.json({ error: "Sign in required." }, { status: 401 });
        await db.query("DELETE FROM service_review_tokens WHERE user_id=$1", [id]);
        return Response.json({ revoked: true });
    } catch (error) {
        return failure(error);
    }
}
