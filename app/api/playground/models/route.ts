import { playgroundModelCatalog } from "@/lib/playground-models";
import { protectOpenAiRequest } from "@/config/Arcjet";
import { getRequestSession } from "@/lib/request-session";
import { configuredAdminRouterModel } from "@/lib/admin-router-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to load OpenAI models." }, { status: 401 });
    const blocked = await protectOpenAiRequest(request);
    if (blocked) return blocked;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return Response.json(
            { error: "OPENAI_API_KEY is not configured on the server." },
            { status: 503 },
        );
    }

    try {
        const { entries, checkedAt } = await playgroundModelCatalog();
        return Response.json(
            {
                models: entries.filter((item) => item.usable).map((item) => item.id),
                entries,
                checkedAt,
                provider: "OpenAI",
                adminRouterModel: configuredAdminRouterModel(),
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        return Response.json(
            {
                error: "Could not load model IDs from OpenAI. Check the server API key and connection.",
            },
            { status: 502 },
        );
    }
}
