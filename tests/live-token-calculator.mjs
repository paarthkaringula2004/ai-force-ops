import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
let actor = null,
    limited = false,
    fail = false,
    calls = 0,
    queries = [];
class InputError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
class IngestionError extends InputError {}
class OpenAI {
    constructor() {
        this.responses = {
            inputTokens: {
                count: async (b) => {
                    calls++;
                    assert.equal(b.model, "gpt-4.1-mini");
                    assert.equal(b.input, "తెలుగు 😊");
                    if (fail) throw Error("private-provider-error");
                    return { input_tokens: 17 };
                },
            },
        };
    }
}
const origin = (r) => {
    if (r.headers.get("origin") !== "https://app.test")
        throw new IngestionError("Cross-site changes are not allowed.", 403);
};
const deps = {
    openai: { default: OpenAI },
    "@/lib/db": {
        db: {
            query: async (sql, args) => {
                queries.push({ sql, args });
                return {
                    rowCount: limited ? 0 : 1,
                    rows: [
                        {
                            updatedAt: new Date(),
                            inputText: "owned",
                            outputText: "legacy",
                            model: "gpt-4.1-mini",
                            outputBudget: 512,
                        },
                    ],
                };
            },
        },
    },
    "@/lib/request-session": {
        getRequestSession: async () => (actor ? { user: { id: actor } } : null),
    },
    "@/lib/service-review/ingestion": { requireSameOrigin: origin, IngestionError },
    "@/lib/eassist/transport": {
        InputError,
        boundedJson: async (r) => {
            if (Number(r.headers.get("content-length")) > 512 * 1024)
                throw new InputError("Too large.", 413);
            try {
                return await r.json();
            } catch {
                throw new InputError("Invalid JSON.");
            }
        },
    },
    "@/lib/playground-models": {
        supportsPlaygroundModel: (m) => m.startsWith("gpt-"),
        playgroundModelCatalog: async () => ({ entries: [{ id: "gpt-4.1-mini", usable: true }] }),
    },
    "@/lib/model-usage": {
        usageQuote: (e) => {
            assert.equal(e.cachedInputTokens, 0);
            assert.equal(e.cacheWriteTokens, 0);
            return { chargeUsd: 0.001 };
        },
    },
    "@/lib/currency-rate": { currencyRate: async () => null },
};
function load(path) {
    const m = { exports: {} };
    new Function(
        "require",
        "module",
        "exports",
        ts.transpileModule(readFileSync(path, "utf8"), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
    )(
        (key) => {
            assert.ok(key in deps, key);
            return deps[key];
        },
        m,
        m.exports,
    );
    return m.exports;
}
const count = load("app/api/token-calculator/count/route.ts"),
    state = load("app/api/token-calculator/state/route.ts");
const request = (body, origin = "https://app.test") =>
    new Request("https://app.test/api/token-calculator/count", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
const body = { input: "తెలుగు 😊", model: "gpt-4.1-mini", outputBudget: 512 };
const previous = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "fixture-only";
try {
    assert.equal((await count.POST(request(body))).status, 401);
    actor = "owner-one";
    assert.equal((await count.POST(request(body, "https://attacker.test"))).status, 403);
    assert.equal((await count.POST(request({ ...body, input: "a".repeat(50001) }))).status, 400);
    assert.equal((await count.POST(request({ ...body, outputBudget: -1 }))).status, 400);
    assert.equal((await count.POST(request({ ...body, model: "invalid-model" }))).status, 400);
    const good = await count.POST(request(body));
    assert.equal(good.status, 200);
    assert.equal(good.headers.get("cache-control"), "private, no-store");
    assert.equal((await good.json()).inputTokens, 17);
    assert.equal(calls, 1);
    assert.equal(queries.at(-1).args[0], actor);
    const empty = await count.POST(request({ ...body, input: "" }));
    assert.equal((await empty.json()).inputTokens, 0);
    assert.equal(calls, 1);
    limited = true;
    assert.equal((await count.POST(request(body))).status, 429);
    limited = false;
    fail = true;
    const failed = await count.POST(request(body));
    assert.equal(failed.status, 502);
    assert.ok(!JSON.stringify(await failed.json()).includes("private-provider-error"));
    await state.GET(new Request("https://app.test/api/token-calculator/state"));
    assert.equal(queries.at(-1).args[0], actor);
    actor = "owner-two";
    await state.PUT(
        request({
            input: "new",
            output: "preserved legacy sample",
            model: "gpt-4.1-mini",
            outputBudget: 700,
        }),
    );
    assert.deepEqual(queries.at(-1).args, [
        "owner-two",
        "new",
        "preserved legacy sample",
        "gpt-4.1-mini",
        700,
    ]);
    assert.equal(
        (await state.PUT(request({ input: "new", output: "", outputBudget: 128001 }))).status,
        400,
    );
    assert.equal(
        (await state.PUT(request({ input: "new", output: "" }, "https://attacker.test"))).status,
        403,
    );
    console.log(
        "PASS live calculator: authenticated owner-scoped state, CSRF, model/input/budget validation, Unicode provider count, empty input, shared limiter, no-store, safe failures and backward-compatible persistence. No reply generated.",
    );
} finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
}
