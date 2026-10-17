import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
    const m = { exports: {} };
    new Function(
        "require",
        "module",
        "exports",
        ts.transpileModule(readFileSync(path, "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                esModuleInterop: true,
            },
        }).outputText,
    )((n) => (n in deps ? deps[n] : require(n)), m, m.exports);
    return m.exports;
}
const guide = load("lib/admin-playground-guide.ts"),
    permissions = load("lib/workspace-permissions.ts");
const member = { role: "admin", active: true, permissions: [], user_id: "fixture" };
let workflowCalls = 0,
    decisionCalls = 0,
    topupReading = null;
let interpreted = null;
let catalogReading = null;
const modelCalls = [];
let modelResponse = {
    status: "completed",
    output_text: "An email preview lets you review the saved content before confirming delivery.",
    model: "fixture-model",
    usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
};
const workflow = async () => {
    workflowCalls++;
    return null;
};
const departmentQueries = [];
const lookup = load("lib/department-lookup.ts", {
    "./db": {
        db: {
            query: async (sql, args) => {
                departmentQueries.push([sql, args]);
                return {
                    rows: args && args[0].toLowerCase() !== "sde" ? [] : [{ code: 7, name: "SDE" }],
                };
            },
        },
    },
});
const { POST } = load("app/api/playground/route.ts", {
    "@/lib/employee-services": load("lib/employee-services.ts"),
    "@/lib/department-lookup": lookup,
    "@/lib/playground-tool-runtime": { connectedPlaygroundReply: async () => null },
    "@/lib/playground-catalog": {
        catalogQuestion: () => false,
        playgroundCatalogReply: async () => catalogReading,
    },
    "@/lib/playground-behavior": load("lib/playground-behavior.ts"),
    "@/lib/conversation-ai": {
        conversationResponse: async () => ({
            text: "Natural verified answer.",
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }),
    },
    "@/lib/staff-request-decision-ai": {
        staffRequestDecisionAiReply: async () => {
            decisionCalls++;
            return null;
        },
    },
    "@/lib/staff-evidence-chat": { staffEvidenceChatReply: async () => null },
    "@/lib/leave-ai-router": { employeeLeaveAiReply: async () => null },
    "@/lib/employee-service-ai": { employeeServiceAiReply: async () => null },
    "@/lib/organization-security": { OrganizationPolicyError: class extends Error {} },
    "@/lib/playground-messages": { playgroundMessageLimit: () => 12000 },
    "@/lib/playground-models": {
        supportsPlaygroundModel: (m) => m === "fixture-model",
        playgroundModelCatalog: async () => ({ entries: [{ id: "fixture-model", usable: true }] }),
    },
    "@/lib/model-pricing": { tokenDetails: () => ({}) },
    "@/lib/eassist/platform": {
        startPlatformRun: async () => "fixture-run",
        finishPlatformRun: async () => {},
    },
    openai: {
        __esModule: true,
        default: class {
            responses = {
                create: async (args) => {
                    modelCalls.push(args);
                    return modelResponse;
                },
            };
        },
    },
    "@/lib/playground-response": load("lib/playground-response.ts", {
        "./organization-security": { OrganizationPolicyError: class extends Error {} },
    }),
    "@/lib/model-usage": { recordModelUsage: async () => {} },
    "@/config/Arcjet": { protectOpenAiRequest: async () => null },
    "@/lib/request-session": {
        getRequestSession: async () => ({ user: { id: "fixture", name: "Fixture" } }),
    },
    "@/lib/db": {
        db: {
            query: async () => {
                throw new Error("No guide may mutate the database");
            },
        },
    },
    "@/lib/workspace-access": { workspaceAccess: async () => member },
    "@/lib/workspace-permissions": permissions,
    "@/lib/employee-playground": { employeeReply: async () => topupReading },
    "@/lib/workspace-chat": { workspaceChatReply: workflow },
    "@/lib/workspace-catalog-chat": { workspaceCatalogChatReply: workflow },
    "@/lib/workspace-mail-chat": { workspaceMailChatReply: workflow },
    "@/lib/workspace-offer-chat": { workspaceOfferChatReply: workflow },
    "@/lib/workspace-document-chat": { workspaceDocumentChatReply: workflow },
    "@/lib/admin-playground-router": {
        adminNaturalLanguageReply: async () => interpreted,
        readAdminConversationState: async () => null,
    },
    "@/lib/admin-playground-guide": guide,
    "@/lib/workspace-request-chat": { workspaceRequestChatReply: workflow },
    "@/lib/service-review/ingestion": { requireSameOrigin: () => {} },
    "@/lib/project-context": { playgroundInstructions: async (text) => text },
    "@/lib/chat-efficiency": {
        recentChat: (m) => m,
        isStandaloneGreeting: (text) => /^(?:hi|hello)[!.]*$/i.test(text),
    },
    "@/lib/local-chat-usage": { recordLocalChat: async () => {} },
    "@/lib/user-playground": {},
});
for (const c of guide.adminCapabilities) {
    const before = workflowCalls;
    const response = await POST(
        new Request("http://localhost/api/playground", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "", messages: [{ role: "user", content: c.name }] }),
        }),
    );
    assert.equal(response.status, 200, c.name);
    const data = await response.json();
    assert.match(data.reply, new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(data.choices.includes("Admin actions"), c.name);
    if (c.name !== "Team requests")
        assert.equal(
            workflowCalls,
            before,
            c.name + ": navigation must not become an active draft field",
        );
}
for (const prompt of [
    "Just tell me what a Admin Can do in form of Points\n1.\n2.\n\nAnd can implement it",
    "Please show me what an admin can do in numbered points",
    "List all Admin capabilities",
]) {
    const before = workflowCalls;
    const response = await POST(
        new Request("http://localhost/api/playground", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "",
                maxTokens: 1,
                messages: [
                    {
                        role: "assistant",
                        content: "Please enter the recipient name for your pending offer.",
                    },
                    { role: "user", content: prompt },
                ],
            }),
        }),
    );
    assert.equal(response.status, 200, prompt);
    const data = await response.json();
    assert.match(data.reply, /1\. \[Offer emails\]/);
    assert.match(data.reply, /66\. \[Workspace settings\]/);
    assert.equal(
        workflowCalls,
        before,
        "Capability questions must not be consumed by a pending workflow",
    );
    assert.equal(data.usage.totalTokens, 0);
}
// Catalog reads are available to every active role, before any draft or AI router.
for (const role of ["user", "employee", "manager", "admin"]) {
    member.role = role;
    for (const prompt of [
        "Is there's any DEPT named SDE?",
        '"SDE" is this dept available ?',
        "Does department SDE exist?",
        "Do we have SDE department?",
        "Is there a SDE department?",
        "Can you check if SDE department exists?",
        "Is there any dept named SDE in our organization?",
        "List departments",
    ]) {
        const before = workflowCalls;
        const response = await POST(
            new Request("http://localhost/api/playground", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [
                        {
                            role: "assistant",
                            content: "What is the exact name of the new department?",
                        },
                        { role: "user", content: prompt },
                    ],
                }),
            }),
        );
        assert.equal(response.status, 200, role + ": " + prompt);
        const data = await response.json();
        assert.match(data.reply, /SDE/);
        assert.match(data.reply, /Department ID:? 7/);
        assert.doesNotMatch(data.reply, /Review new department|Department creation/);
        assert.equal(workflowCalls, before, "Lookup cannot enter a mutation workflow");
        assert.equal(data.usage.totalTokens, 0);
        if (role !== "admin") assert.deepEqual(data.choices, ["List departments"]);
    }
    const missing = await POST(
        new Request("http://localhost/api/playground", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: "Is department Missing available?" }],
            }),
        }),
    );
    assert.match((await missing.json()).reply, /No department named \*\*Missing\*\* was found/);
}
member.role = "admin";
assert.ok(
    departmentQueries.every(([sql]) => sql.startsWith("SELECT code,name FROM staff_departments")),
);
assert.equal(await lookup.readDepartmentLookup({ ...member, active: false }, "SDE"), null);
for (const prompt of [
    "Create department SDE",
    "Delete department SDE",
    "Rename department SDE",
    "SDE",
])
    assert.equal(lookup.departmentLookupQuestion(prompt), null);
console.log(
    "PASS: all four roles read live department matches, missing names and lists; no writes, model calls or draft interception.",
);
console.log(
    "PASS: real Playground POST dispatch returns all 66 Admin topic responses without a model, database writes or draft-field interception. Existing workflow adapters remain ahead of generic guidance for action commands.",
);
assert.equal(modelCalls.length, 0, "Exact guides do not invoke the answer model");
const post = () =>
    POST(
        new Request("http://localhost/api/playground", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "fixture-model",
                instructions: "Explain in one sentence.",
                messages: [
                    {
                        role: "assistant",
                        content: "Please enter the recipient name for your pending offer.",
                    },
                    { role: "user", content: "What does an email preview mean?" },
                ],
            }),
        }),
    );
interpreted = {
    reply: "Please enter the recipient email.",
    choices: [],
    usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 },
};
let result = await post();
assert.equal(result.status, 200);
assert.equal((await result.json()).reply, interpreted.reply);
assert.equal(modelCalls.length, 0);
const before = workflowCalls;
const previousKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "fixture";
try {
    interpreted = { ...interpreted, continueToModel: true };
    result = await post();
    assert.equal(result.status, 200);
    let data = await result.json();
    assert.equal(data.reply, modelResponse.output_text);
    assert.deepEqual(data.usage, { inputTokens: 150, outputTokens: 50, totalTokens: 200 });
    assert.equal(workflowCalls, before, "General answers bypass pending draft field handlers");
    assert.equal(modelCalls[0].model, "fixture-model");
    assert.equal(modelCalls[0].store, false);
    assert.match(modelCalls[0].instructions, /Explain in one sentence/);
    assert.match(modelCalls[0].instructions, /Do not require memorized command words/);
    modelResponse = {
        ...modelResponse,
        status: "incomplete",
        output_text: "",
        incomplete_details: { reason: "max_output_tokens" },
    };
    result = await post();
    assert.equal(result.status, 422);
    data = await result.json();
    assert.deepEqual(data.usage, { inputTokens: 150, outputTokens: 50, totalTokens: 200 });
} finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
}
console.log(
    "PASS: interpreted actions return their actual workflow response; general answers use the selected model and instructions without draft interception, with combined usage for completed and incomplete answers.",
);

process.env.OPENAI_API_KEY = "fixture";
try {
    modelResponse = {
        ...modelResponse,
        status: "completed",
        output_text: "Good morning, Fixture.",
        incomplete_details: undefined,
    };
    const instructions =
        "Greet Every One Like this - Hello (Good Morning / Afternoon) From meena dept (his/her name) Name";
    const beforeGreeting = workflowCalls;
    const response = await POST(
        new Request("http://localhost/api/playground", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "fixture-model",
                instructions,
                messages: [
                    { role: "user", content: "Earlier greeting" },
                    {
                        role: "assistant",
                        content: "Hello (Good Morning / Afternoon) From meena dept (admin) Name",
                    },
                    { role: "user", content: "Hello" },
                ],
            }),
        }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reply, "Good morning, Fixture.");
    assert.equal(workflowCalls, beforeGreeting);
    assert.match(modelCalls.at(-1).instructions, /actual displayName/);
    assert.match(modelCalls.at(-1).instructions, /"displayName":"Fixture"/);
    assert.match(modelCalls.at(-1).instructions, /Asia\/Kolkata/);
    assert.match(modelCalls.at(-1).instructions, /not as a literal reply template/);
    assert.deepEqual(modelCalls.at(-1).input, [{ role: "user", content: "Hello" }]);
    assert.match(modelCalls.at(-1).instructions, /Return only the finished greeting/);
    interpreted = {
        reply: "Verified profile: Fixture.",
        choices: ["About me"],
        responseMode: "employee",
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
    };
    const grounded = await post();
    const groundedData = await grounded.json();
    assert.equal(groundedData.reply, "Natural verified answer.");
    assert.deepEqual(groundedData.choices, ["About me"]);
    assert.equal(groundedData.usage.totalTokens, 18);
    console.log(
        "PASS: greeting preferences reach OpenAI with trusted profile/time context and bypass workflow dispatch.",
    );
} finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
}

const catalogKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
try {
    catalogReading = {
        reply: "Verified catalog: Fresh Agent uses Fresh Tool.",
        choices: ["List my agents", "List my tools"],
        responseMode: "workspace",
    };
    for (const role of ["admin", "manager", "employee", "user"]) {
        member.role = role;
        const before = workflowCalls;
        const r = await POST(
            new Request("http://localhost/api/playground", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "What does Fresh Agent do?" }],
                }),
            }),
        );
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("cache-control"), "private, no-store");
        assert.equal((await r.json()).reply, catalogReading.reply);
        assert.equal(workflowCalls, before);
    }
} finally {
    catalogReading = null;
    member.role = "admin";
    if (catalogKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = catalogKey;
}
console.log(
    "PASS: live catalog reading reaches all four Playground roles ahead of guided workflows, including without a model key.",
);

try {
    topupReading = {
        reply: "How many tickets would you like to request from Admin?",
        choices: [],
        responseMode: "employee",
    };
    for (const role of ["manager", "employee"]) {
        member.role = role;
        const before = decisionCalls;
        const response = await POST(
            new Request("http://localhost/api/playground", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [
                        { role: "assistant", content: "How many people will attend?" },
                        { role: "user", content: "I want to request Tickets topup from Admin" },
                    ],
                }),
            }),
        );
        assert.equal(response.status, 200);
        assert.equal((await response.json()).reply, topupReading.reply);
        assert.equal(
            decisionCalls,
            before,
            "explicit top-up must run before history-based decision inference",
        );
    }
    console.log(
        "PASS: exact Manager and Employee top-up message bypasses stale meeting history and AI routing in the actual Playground POST handler.",
    );
} finally {
    topupReading = null;
    member.role = "admin";
}
