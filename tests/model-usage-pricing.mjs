import "dotenv/config";
import assert from "node:assert/strict";
import { fixtureAccount, cleanupFixture } from "./helpers/account.mjs";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
    resolve(specifier, context, next) {
        let p;
        if (specifier.startsWith("@/")) p = resolve(root, specifier.slice(2));
        else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts"))
            p = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
        if (p) {
            if (!extname(p) && existsSync(p + ".ts")) p += ".ts";
            if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true };
        }
        return next(specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith("/lib/openai-pricing.json"))
            return {
                format: "module",
                source: "export default " + readFileSync(fileURLToPath(url), "utf8"),
                shortCircuit: true,
            };
        if (url.endsWith(".ts"))
            return {
                format: "module",
                source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
                    compilerOptions: {
                        module: ts.ModuleKind.ESNext,
                        target: ts.ScriptTarget.ES2022,
                    },
                }).outputText,
                shortCircuit: true,
            };
        return next(url, context);
    },
});
const { supportsPlaygroundModel, compareModelIds } = await import("../lib/playground-models.ts");
assert.equal(supportsPlaygroundModel("gpt-4.1-nano"), true);
assert.equal(supportsPlaygroundModel("gpt-image-1"), false);
assert.equal(supportsPlaygroundModel("gpt-6.1-sol"), true);
assert.equal(supportsPlaygroundModel("false-gpt-model"), false);
assert.deepEqual(
    ["gpt-6.1-sol", "gpt-5", "gpt-4.1", "gpt-4", "o3", "o1", "chat-latest"].sort(compareModelIds),
    ["gpt-4", "gpt-4.1", "gpt-5", "gpt-6.1-sol", "o1", "o3", "chat-latest"],
);
const { playgroundOutcome, playgroundError } = await import("../lib/playground-response.ts");
assert.equal(playgroundOutcome({ status: "completed", output_text: "Answer" }).reply, "Answer");
assert.match(
    playgroundOutcome(
        {
            status: "incomplete",
            output_text: "Partial answer",
            incomplete_details: { reason: "max_output_tokens" },
        },
        300,
    ).warning,
    /300-token/,
);
assert.match(
    playgroundOutcome(
        {
            status: "incomplete",
            output_text: "",
            incomplete_details: { reason: "max_output_tokens" },
        },
        300,
    ).error,
    /before an answer/,
);
assert.match(
    playgroundError({ status: 429, code: "insufficient_quota" }),
    /credit or spending limit/,
);
assert.match(playgroundError({ status: 403 }), /denied access/);
const { modelCost, tokenDetails, TICKET_PACKS, compareModelBudgets } =
    await import("../lib/model-pricing.ts");
const { usageQuote, recordModelUsage } = await import("../lib/model-usage.ts");
const { playgroundInstructions } = await import("../lib/project-context.ts");
const { recentChat, isStandaloneGreeting } = await import("../lib/chat-efficiency.ts");
const { db } = await import("../lib/db.ts");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
assert.deepEqual(
    ["gpt-6-astra", "gpt-4.1", "gpt-4.1-nano", "gpt-4.1-mini", "gpt-5-pro"].sort(
        compareModelBudgets,
    ),
    ["gpt-4.1-nano", "gpt-4.1-mini", "gpt-4.1", "gpt-5-pro", "gpt-6-astra"],
);
near(
    modelCost({
        modelId: "gpt-4-turbo",
        inputTokens: 628,
        outputTokens: 16,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
    }).estimatedCostUsd,
    0.00676,
);
near(
    modelCost({ modelId: "gpt-4.1-nano", inputTokens: 38, outputTokens: 10, cachedInputTokens: 0 })
        .estimatedCostUsd,
    0.0000078,
);
const q = usageQuote(
    { modelId: "gpt-4.1-nano", inputTokens: 38, outputTokens: 10, cachedInputTokens: 0 },
    { usdInr: 100, date: "test", source: "test" },
);
near(q.chargeUsd, 0.0000156);
near(q.chargeInr, 0.00156);
near(q.tickets, 0.00195);
near(
    modelCost({
        modelId: "gpt-4.1-nano-2025-04-14",
        inputTokens: 1000,
        outputTokens: 100,
        cachedInputTokens: 800,
    }).estimatedCostUsd,
    0.00008,
);
near(
    modelCost({
        modelId: "gpt-6.1-sol",
        inputTokens: 1000,
        outputTokens: 100,
        cachedInputTokens: 500,
        cacheWriteTokens: 100,
    }).estimatedCostUsd,
    0.0021,
);
near(
    modelCost({ modelId: "gpt-5.5", inputTokens: 300000, outputTokens: 100, cachedInputTokens: 0 })
        .estimatedCostUsd,
    3.0045,
);
assert.equal(
    modelCost({ modelId: "unknown-model", inputTokens: 100, outputTokens: 5 }).estimatedCostUsd,
    null,
);
assert.equal(
    modelCost({
        modelId: "gpt-6.1-sol",
        inputTokens: 1000,
        outputTokens: 100,
        cachedInputTokens: 0,
    }).estimatedCostUsd,
    null,
);
assert.equal(
    modelCost({
        modelId: "gpt-4.1-nano",
        inputTokens: 100,
        outputTokens: 10,
        serviceTier: "priority",
    }).estimatedCostUsd,
    null,
);
assert.equal(
    modelCost({ modelId: "gpt-4.1-nano", inputTokens: 38, outputTokens: 10 }).costBasis,
    "cache-unknown",
);
assert.deepEqual(
    tokenDetails([
        { cached_tokens: 80, cache_write_tokens: 10 },
        { cached_tokens: 20, cache_write_tokens: 5 },
    ]),
    { cachedInputTokens: 100, cacheWriteTokens: 15 },
);
for (const pack of TICKET_PACKS) assert.equal(pack.tickets * 0.8, pack.price);
assert.equal(
    usageQuote({ modelId: "local", inputTokens: 0, outputTokens: 0, usageKind: "local" }, null)
        .tickets,
    0,
);
assert.equal(
    usageQuote(
        { modelId: "gpt-4.1-nano", inputTokens: 38, outputTokens: 10, cachedInputTokens: 0 },
        null,
    ).tickets,
    null,
);
const old = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: String(i).repeat(1000),
}));
old.push({ role: "user", content: "Current question" });
const compact = recentChat(old);
assert.ok(compact.length <= 12);
assert.equal(compact.at(-1).content, "Current question");
assert.equal(compact[0].role, "user");
assert.equal(isStandaloneGreeting("Hello!"), true);
assert.equal(isStandaloneGreeting("Hello, what is our uptime?"), false);
const instructions = await playgroundInstructions("Use plain English.", "What is AIForce.Ops?");
assert.match(instructions, /service operations platform/);
assert.match(instructions, /ePACE/);
assert.match(instructions, /Use plain English/);
const overview = readFileSync(resolve(root, "AIForce-Ops-Project-and-Meeting-Analysis.md"), "utf8");
const selected = instructions.match(/<project_overview>([\s\S]*?)<\/project_overview>/)[1];
assert.ok(selected.length < overview.length);
assert.ok(!selected.includes(overview));
console.log(
    "PASS: actual input/output pricing; cache reads/writes; long-context prices; unknown/tier guards; ×2 markup; fractional tickets; local zero cost; bounded history and retained project identity.",
);
const base = "http://localhost:3000";
let user, account;
async function api(cookie, path, body, status = 200) {
    const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { Cookie: cookie || "", Origin: base, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000),
    });
    const value = await r.json();
    assert.equal(r.status, status, JSON.stringify(value));
    return value;
}
try {
    await api("", "/api/usage", null, 401);
    account = await fixtureAccount(db, { role: "user", name: "Disposable pricing verification" });
    user = account.id;
    const cookie = account.cookie;
    const catalog = await api(cookie, "/api/playground/models");
    assert.ok(catalog.models.includes("gpt-6.1-sol"));
    assert.ok(!catalog.models.includes("gpt-image-1"));
    assert.ok(catalog.entries.some((e) => e.id === "gpt-image-1" && !e.usable));
    let state = await api(cookie, "/api/playground/state");
    assert.equal(state.messages.length, 0);
    await api(cookie, "/api/playground/state", { role: "user", content: "Failed orphan" }, 400);
    await api(
        cookie,
        "/api/playground/state",
        { userContent: "Successful question", assistantContent: "Successful answer" },
        201,
    );
    state = await api(cookie, "/api/playground/state");
    assert.deepEqual(
        state.messages.map((m) => m.role),
        ["user", "assistant"],
    );
    const longAnswer = "Detailed project information. ".repeat(700);
    assert.ok(longAnswer.length > 12000);
    await api(
        cookie,
        "/api/playground/state",
        { userContent: "Explain the project in detail", assistantContent: longAnswer },
        201,
    );
    state = await api(cookie, "/api/playground/state");
    assert.equal(state.messages.at(-1).content, longAnswer.trim());
    await api(
        cookie,
        "/api/playground/state",
        { userContent: "x".repeat(12001), assistantContent: "Answer" },
        400,
    );
    await api(
        cookie,
        "/api/playground/state",
        { userContent: "Question", assistantContent: "x".repeat(60001) },
        400,
    );
    const { playgroundMessageLimit } = await import("../lib/playground-messages.ts");
    assert.ok(longAnswer.length < playgroundMessageLimit("assistant"));
    assert.equal(playgroundMessageLimit("user"), 12000);
    console.log(
        "PASS: long answers persist intact; role-specific limits still reject oversized questions and replies.",
    );
    const { recordLocalChat } = await import("../lib/local-chat-usage.ts");
    await recordLocalChat(user, "playground");
    await recordLocalChat(user, "review-chat");
    process.env.USD_INR_RATE = "100";
    await recordModelUsage(user, "playground", {
        modelId: "gpt-4.1-nano",
        inputTokens: 38,
        outputTokens: 10,
        totalTokens: 48,
        cachedInputTokens: 0,
    });
    const usage = await api(cookie, "/api/usage");
    assert.equal(usage.pricing.multiplier, 2);
    assert.equal(usage.totals.totalTokens, 48);
    assert.equal(usage.totals.localReplies, 2);
    assert.equal(usage.totals.requests, 1);
    near(usage.totals.chargeUsd, 0.0000156);
    near(usage.events.find((e) => e.totalTokens === 48).billing.tickets, 0.00195);
    const stored = await db.query(
        "SELECT total_tokens,billing FROM usage_events WHERE user_id=$1 AND usage_kind='provider'",
        [user],
    );
    assert.equal(stored.rows[0].total_tokens, 48);
    assert.equal(stored.rows[0].billing.multiplier, 2);
    assert.equal(stored.rows[0].billing.fx.usdInr, 100);
    const missingId = randomUUID();
    await db.query(
        "INSERT INTO usage_events(id,user_id,source,model_id,input_tokens,output_tokens,total_tokens,cached_input_tokens,cache_write_tokens,billing) VALUES($1,$2,'playground','gpt-4-turbo',628,16,644,0,0,$3::jsonb)",
        [
            missingId,
            user,
            JSON.stringify({
                estimatedCostUsd: null,
                costBasis: "unavailable",
                fx: { usdInr: 96.48, date: "configured", source: "test" },
            }),
        ],
    );
    const recovered = (await api(cookie, "/api/usage")).events.find(
        (e) => e.id === missingId,
    ).billing;
    assert.equal(recovered.pricingRecovered, true);
    near(recovered.estimatedCostUsd, 0.00676);
    near(recovered.chargeUsd, 0.01352);
    near(recovered.chargeInr, 1.3044096);
    near(recovered.tickets, 1.630512);
    if (process.env.PLAYGROUND_NANO_TEST === "1") {
        const reply = await api(cookie, "/api/playground", {
            model: "gpt-5-nano",
            maxTokens: 300,
            messages: [{ role: "user", content: "Tell me deeply about this website." }],
        });
        assert.ok(reply.reply.length > 0);
        assert.match(reply.reply, /AIForce|operations|Agent Studio/i);
        assert.ok(reply.usage.totalTokens > 0);
        assert.doesNotMatch(
            reply.reply,
            /overview you provided|based on.*you provided|If you want|I don.t have access to live/i,
        );
        console.log(
            "PASS GPT-5 nano website question at 300 output tokens:",
            reply.responseStatus,
            JSON.stringify(reply.usage),
        );
    }
    if (process.env.MODEL_LIVE_TEST === "1") {
        for (const model of ["gpt-4.1-nano", "gpt-6.1-sol"]) {
            const reply = await api(cookie, "/api/playground", {
                model,
                maxTokens: 512,
                messages: [{ role: "user", content: "Reply with only the word OK." }],
            });
            assert.match(reply.reply, /OK/);
            assert.ok(reply.usage.totalTokens > 0);
            console.log("PASS live OpenAI generation:", model, JSON.stringify(reply.usage));
        }
    }
    console.log(
        "PASS: persisted local activity costs zero tokens; exact provider counts stay 48; persisted ×2 quote and FX snapshot; owner-only usage endpoint.",
    );
} finally {
    if (account) await cleanupFixture(db, account);
    await db.end();
}
