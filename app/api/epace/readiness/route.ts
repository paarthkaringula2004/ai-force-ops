import { getRequestSession } from "@/lib/request-session";
import { db } from "@/lib/db";
import { project, PaceError, audit } from "@/lib/epace/store";
import { runtimePolicy, boundedJson, admitProviderRequest } from "@/lib/epace/runtime";
import { provider, moderate, accountUsage } from "@/lib/epace/engine";
import { trustedOrigin } from "@/lib/epace/origin";
import type { Readiness } from "@/lib/epace/types";
import { failure } from "../route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        const p = await project(
            session.user.id,
            new URL(request.url).searchParams.get("project") || "",
        );
        const policy = runtimePolicy();
        const [coverage, maintenance, worker, usage, probe] = await Promise.all([
            db.query(
                "SELECT count(*)::int AS passages,count(embedding)::int AS embedded FROM epace_chunks WHERE user_id=$1 AND project_id=$2",
                [session.user.id, p.id],
            ),
            db.query("SELECT checked_at,last_error FROM epace_maintenance_health WHERE id=true"),
            db.query("SELECT checked_at FROM integration_worker_health WHERE id=true"),
            db.query(
                "SELECT COALESCE(sum(total_tokens),0)::bigint AS tokens FROM usage_events WHERE user_id=$1 AND source='epace' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
                [session.user.id],
            ),
            db.query(
                "SELECT action,created_at FROM epace_audit WHERE user_id=$1 AND project_id=$2 AND action=ANY($3::text[]) ORDER BY created_at DESC LIMIT 1",
                [
                    session.user.id,
                    p.id,
                    [
                        `Verified provider access: ${p.settings.model} / ${p.settings.evaluationModel || p.settings.model}`,
                        `Provider access failed: ${p.settings.model} / ${p.settings.evaluationModel || p.settings.model}`,
                    ],
                ],
            ),
        ]);
        const fresh = (date: unknown, ms: number) =>
            !!date && Date.now() - new Date(String(date)).getTime() < ms;
        const clean = maintenance.rows[0],
            workerDate = worker.rows[0]?.checked_at,
            chunks = coverage.rows[0];
        const check = (id: string, name: string, ok: boolean, detail: string) => ({
            id,
            name,
            state: ok ? ("passed" as const) : ("attention" as const),
            detail,
            source:
                id === "probe"
                    ? ("OpenAI API" as const)
                    : [
                            "database",
                            "model",
                            "evidence",
                            "evaluation",
                            "worker",
                            "retention",
                        ].includes(id)
                      ? ("PostgreSQL" as const)
                      : ("Server configuration" as const),
        });
        const result: Readiness = {
            checkedAt: new Date().toISOString(),
            policy,
            todayTokens: Number(usage.rows[0].tokens),
            checks: [
                check(
                    "database",
                    "Private project storage",
                    true,
                    "PostgreSQL responded. Project ownership and account isolation are checked on the server.",
                ),
                check(
                    "provider",
                    "AI provider configured",
                    !!process.env.OPENAI_API_KEY,
                    process.env.OPENAI_API_KEY
                        ? "A server-side API key is configured. Use Test provider to check this project's selected models."
                        : "Add a server-side OpenAI API key.",
                ),
                check(
                    "probe",
                    "Selected models tested",
                    fresh(probe.rows[0]?.created_at, 86400000) &&
                        probe.rows[0]?.action.startsWith("Verified provider access:"),
                    probe.rows[0]
                        ? `${probe.rows[0].action.startsWith("Verified provider access:") ? "Last successful provider test" : "Last provider test failed"}: ${new Date(probe.rows[0].created_at).toISOString()}. Recheck after changing deployment or provider access.`
                        : "No successful provider test for the selected models in the last 24 hours.",
                ),
                check(
                    "model",
                    "Runtime model selected",
                    !!p.settings.model,
                    p.settings.model || "Choose an available model in Developer settings.",
                ),
                check(
                    "safety",
                    "Input and output safety",
                    p.settings.contentSafety && policy.requireSafety && policy.blockFlagged,
                    `Project safety checks: ${p.settings.contentSafety ? "enabled" : "disabled"}. Server requires safety: ${policy.requireSafety ? "yes" : "no"}. Provider-flagged content blocked: ${policy.blockFlagged ? "yes" : "no"}.`,
                ),
                check(
                    "evidence",
                    "Knowledge coverage",
                    chunks.passages > 0 && p.settings.requireEvidence,
                    `${chunks.passages} stored passages. ${chunks.embedded} have embeddings. Evidence requirement is ${p.settings.requireEvidence ? "enabled" : "disabled"}. Document accuracy still requires review by your team.`,
                ),
                check(
                    "evaluation",
                    "Quality review",
                    p.settings.sampling > 0,
                    `Sampling: ${Math.round(p.settings.sampling * 100)}%. AI scores are advisory; human review is needed for important decisions.`,
                ),
                check(
                    "worker",
                    "Background collector",
                    fresh(workerDate, 180000),
                    workerDate
                        ? `Last worker contact: ${new Date(workerDate).toISOString()}.`
                        : "Deploy the background worker to keep collection and cleanup running when browsers are closed.",
                ),
                check(
                    "retention",
                    "Unattended retention cleanup",
                    !!clean && !clean.last_error && fresh(clean.checked_at, 7200000),
                    clean?.checked_at
                        ? `Last cleanup: ${new Date(clean.checked_at).toISOString()}.${clean.last_error ? " " + clean.last_error : ""}`
                        : "No successful unattended cleanup recorded.",
                ),
                check(
                    "registration",
                    "Controlled account registration",
                    process.env.AUTH_DISABLE_SIGNUP === "true",
                    process.env.AUTH_DISABLE_SIGNUP === "true"
                        ? "Public registration is disabled in the authentication configuration."
                        : "Public registration is enabled. Create approved accounts first, then disable public registration for a private company deployment.",
                ),
                check(
                    "origin",
                    "Production website address",
                    /^https:\/\//.test(process.env.BETTER_AUTH_URL || ""),
                    `Configured authentication address: ${process.env.BETTER_AUTH_URL || "not set"}. ${/^https:\/\//.test(process.env.BETTER_AUTH_URL || "") ? "HTTPS is configured; deployed reachability still needs verification." : "This is not a deployed HTTPS website address."}`,
                ),
            ],
            manual: [
                {
                    name: "Deployment and recovery",
                    detail: "Deploy the new code and migrations, run a separate always-on worker, enable database backups and verify a restore. Local checks do not verify your Render deployment.",
                },
                {
                    name: "Provider account and costs",
                    detail: "Fund and approve the provider account, select supported models and set provider spending limits. Application token allowances can overshoot during in-flight requests and are not a billing cap.",
                },
                {
                    name: "Approved knowledge and acceptance",
                    detail: "Upload approved documents, test representative questions and prompt injection attempts, review citations and set quality thresholds with your team.",
                },
                {
                    name: "Company security requirements",
                    detail: "This release isolates individual accounts. Shared organization roles, company SSO/MFA, immutable audit exports and external alert delivery still need implementation if your company requires them.",
                },
                {
                    name: "Data policy and capacity",
                    detail: "Approve provider data processing, document access and retention. Run security and load testing for your expected users. Current project capacity is 2,000 passages and snapshots show the newest 5,000 records.",
                },
            ],
        };
        return Response.json(result, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!trustedOrigin(request))
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    let testedProject: { id: string; model: string; evaluationModel: string } | undefined;
    try {
        const b = await boundedJson(request, 1000),
            p = await project(session.user.id, b.projectId);
        if (!p.settings.model) throw new PaceError("Select a model in Developer settings first.");
        await admitProviderRequest(session.user.id);
        testedProject = {
            id: p.id,
            model: p.settings.model,
            evaluationModel: p.settings.evaluationModel || p.settings.model,
        };
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90000)]);
        const models = [
            ...new Set([p.settings.model, p.settings.evaluationModel || p.settings.model]),
        ];
        for (const model of models) {
            const r = await provider().responses.create(
                {
                    model,
                    store: false,
                    input: 'Return {"ok":true} to acknowledge that this diagnostic request reached the model.',
                    max_output_tokens: 128,
                    text: {
                        format: {
                            type: "json_schema",
                            name: "provider_check",
                            strict: true,
                            schema: {
                                type: "object",
                                properties: { ok: { type: "boolean" } },
                                required: ["ok"],
                                additionalProperties: false,
                            },
                        },
                    },
                },
                { signal },
            );
            await accountUsage(
                session.user.id,
                r.model,
                r.usage?.input_tokens,
                r.usage?.output_tokens,
            );
            if (r.status !== "completed" || JSON.parse(r.output_text).ok !== true)
                throw new PaceError(
                    "The selected model did not complete the structured response test.",
                    502,
                );
        }
        for (const stage of ["input", "output"])
            await moderate(
                session.user.id,
                p,
                "This is a harmless ePACE deployment check.",
                stage,
                signal,
            );
        if (p.settings.retrieval !== "Keyword") {
            const r = await provider().embeddings.create(
                { model: "text-embedding-3-small", input: "ePACE diagnostic" },
                { signal },
            );
            await accountUsage(session.user.id, r.model, r.usage.total_tokens);
        }
        await audit(
            session.user.id,
            p.id,
            `Verified provider access: ${p.settings.model} / ${p.settings.evaluationModel || p.settings.model}`,
        );
        const checked = await GET(
            new Request(new URL(`/api/epace/readiness?project=${p.id}`, request.url), {
                headers: request.headers,
                signal: request.signal,
            }),
        );
        if (!checked.ok) return checked;
        return Response.json(
            {
                readiness: await checked.json(),
                message:
                    "Real model requests and input/output moderation passed. Every database and configuration check has also been refreshed. Items needing attention remain visible.",
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    } catch (error) {
        if (testedProject)
            await audit(
                session.user.id,
                testedProject.id,
                `Provider access failed: ${testedProject.model} / ${testedProject.evaluationModel}`,
            ).catch(() => {});
        if (error instanceof PaceError) return failure(error);
        return Response.json(
            {
                error: "Provider check failed. Check model support for structured responses, API credits and network access.",
            },
            { status: 502 },
        );
    }
}
