import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import OpenAI from "openai";
const m = { exports: {} };
new Function(
    "module",
    "exports",
    ts.transpileModule(readFileSync("lib/leave-ai-intent.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
)(m, m.exports);
const { parseLeaveAiIntent, leaveAiInstructions, leaveIntentTool } = m.exports;
const valid = {
    mode: "leave",
    type: "Sick leave",
    start: "2026-10-14",
    end: "2026-10-14",
    halfDay: false,
    reason: "Rest and recovery following medical advice.",
    question: null,
};
assert.deepEqual(parseLeaveAiIntent(JSON.stringify(valid)), valid);
for (const invalid of [
    { ...valid, start: "2026-02-30" },
    { ...valid, end: "2026-10-12" },
    { ...valid, paidDays: 99 },
    { ...valid, mode: "approve" },
    { ...valid, halfDay: true, end: "2026-10-15" },
])
    assert.throws(() => parseLeaveAiIntent(JSON.stringify(invalid)));
console.log("PASS: interpreted date validation, bounded fields, no model approval/payroll fields.");
if (!process.argv.includes("--live")) process.exit(0);
assert.ok(process.env.OPENAI_API_KEY, "OpenAI key required for live interpreter verification.");
const model = process.env.OPENAI_EMPLOYEE_ROUTER_MODEL || "gpt-4.1-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60000, maxRetries: 0 });
const context = {
    today: "2026-10-11",
    active: null,
    recent: [
        {
            number: "REQ-SYNTHETIC",
            type: "Sick leave",
            dates: "2026-10-13 · Full day (Asia/Kolkata)",
            reason: valid.reason,
            status: "approved",
        },
    ],
};
const cases = [
    {
        text: "And I also want leave at 14th same reason",
        history: [
            { role: "user", content: "Sick leave on the 13th for recovery." },
            { role: "assistant", content: "Your sick leave on 13 October was recorded." },
        ],
        start: "2026-10-14",
        mode: "leave",
    },
    {
        text: "Could we add one more recovery day after that? Same reason.",
        history: [
            { role: "user", content: "Sick leave on the 13th for recovery." },
            { role: "assistant", content: "Your sick leave on 13 October was recorded." },
        ],
        start: "2026-10-14",
        mode: "leave",
    },
    {
        text: "Doctor said to rest minimum 2 days so I want leave the next day also",
        context: {
            ...context,
            recent: [
                {
                    ...context.recent[0],
                    type: "Annual leave",
                    dates: "2026-10-12 · Full day (Asia/Kolkata)",
                },
            ],
        },
        history: [],
        start: "2026-10-13",
        mode: "leave",
    },
    {
        text: "Don't submit it yet; I'm just checking the preview.",
        context: {
            ...context,
            active: {
                id: "synthetic",
                type: "Sick leave",
                dates: "2026-10-14",
                reason: valid.reason,
            },
        },
        history: [],
        notMode: "confirm",
    },
];
for (const c of cases) {
    const response = await client.responses.create({
        model,
        store: false,
        instructions: leaveAiInstructions(c.context || context),
        input: [...c.history, { role: "user", content: c.text }],
        tools: [leaveIntentTool],
        tool_choice: { type: "function", name: "interpret_leave_request" },
        parallel_tool_calls: false,
        max_output_tokens: 4000,
        ...(/^gpt-4(?:\.1|o)(?:-|$)/.test(model) ? { temperature: 0 } : {}),
    });
    assert.equal(response.status, "completed");
    const call = response.output.find((item) => item.type === "function_call");
    assert.ok(call);
    const result = parseLeaveAiIntent(call.arguments);
    if (c.mode) {
        assert.equal(result.mode, c.mode);
        assert.equal(result.start, c.start);
        assert.equal(result.type, "Sick leave");
        assert.ok(result.reason);
    }
    if (c.notMode) assert.notEqual(result.mode, c.notMode);
    console.log(
        `PASS: real OpenAI interpretation: ${c.text} (${response.model}; ${response.usage?.total_tokens ?? 0} tokens)`,
    );
}
console.log(
    "Live checks used synthetic leave context only. No employee requests, approvals or emails were created.",
);
