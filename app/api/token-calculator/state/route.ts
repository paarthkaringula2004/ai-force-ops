import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
import { boundedJson, InputError } from "@/lib/eassist/transport";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to load your token calculator." }, { status: 401 });
    try {
        const result = await db.query<{
            inputText: string;
            outputText: string;
            updatedAt: Date;
            model: string;
            outputBudget: number;
        }>(
            `SELECT input_text AS "inputText", output_text AS "outputText", updated_at AS "updatedAt", selected_model AS model, output_budget AS "outputBudget"
       FROM token_calculator_state WHERE user_id = $1`,
            [session.user.id],
        );
        const state = result.rows[0];
        return Response.json(
            {
                input: state?.inputText ?? "",
                output: state?.outputText ?? "",
                model: state?.model ?? "gpt-4.1-mini",
                outputBudget: state?.outputBudget ?? 512,
                updatedAt: state?.updatedAt?.toISOString() ?? null,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        return Response.json(
            { error: "Could not load token calculator data from PostgreSQL." },
            { status: 503 },
        );
    }
}

export async function PUT(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to save your token calculator." }, { status: 401 });
    try {
        requireSameOrigin(request);
        const body: unknown = await boundedJson(request);
        if (typeof body !== "object" || body === null)
            return Response.json({ error: "Invalid token calculator data." }, { status: 400 });
        const { input, output, model, outputBudget } = body as Record<string, unknown>;
        if (
            typeof input !== "string" ||
            typeof output !== "string" ||
            input.length > 50000 ||
            output.length > 50000
        ) {
            return Response.json(
                { error: "Each calculator field must be text up to 50,000 characters." },
                { status: 400 },
            );
        }
        if (
            (model !== undefined &&
                (typeof model !== "string" || !/^[a-zA-Z0-9.-]{1,200}$/.test(model))) ||
            (outputBudget !== undefined &&
                (!Number.isInteger(outputBudget) ||
                    Number(outputBudget) < 0 ||
                    Number(outputBudget) > 128000))
        )
            return Response.json(
                { error: "Invalid model or output token budget." },
                { status: 400 },
            );
        const result = await db.query<{ updatedAt: Date }>(
            `INSERT INTO token_calculator_state (user_id, input_text, output_text, updated_at, selected_model, output_budget)
       VALUES ($1, $2, $3, now(), COALESCE($4, 'gpt-4.1-mini'), COALESCE($5,512))
       ON CONFLICT (user_id) DO UPDATE SET input_text = EXCLUDED.input_text, output_text = EXCLUDED.output_text, updated_at = now(), selected_model=COALESCE($4,token_calculator_state.selected_model), output_budget=COALESCE($5,token_calculator_state.output_budget)
       RETURNING updated_at AS "updatedAt"`,
            [session.user.id, input, output, model ?? null, outputBudget ?? null],
        );
        return Response.json(
            { saved: true, updatedAt: result.rows[0].updatedAt.toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        if (error instanceof InputError || error instanceof IngestionError)
            return Response.json({ error: error.message }, { status: error.status });
        return Response.json(
            { error: "Could not save token calculator data to PostgreSQL." },
            { status: 503 },
        );
    }
}
