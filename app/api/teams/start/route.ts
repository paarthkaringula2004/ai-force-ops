import { getRequestSession } from "@/lib/request-session";
import { beginTeamsSignIn } from "@/lib/teams-meetings";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { InputError } from "@/lib/eassist/transport";
export const runtime = "nodejs";
export async function POST(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    try {
        const result = await beginTeamsSignIn(session.user.id);
        const secure = new URL(request.url).protocol === "https:";
        return new Response(null, {
            status: 303,
            headers: {
                Location: result.url,
                "Cache-Control": "no-store",
                "Set-Cookie": `aiforce-teams-state=${result.state}; Path=/api/teams; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`,
            },
        });
    } catch (error) {
        return Response.json(
            {
                error:
                    error instanceof InputError ? error.message : "Could not start Teams sign-in.",
            },
            { status: error instanceof InputError ? error.status : 503 },
        );
    }
}
