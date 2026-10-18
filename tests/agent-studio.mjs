import "../scripts/load-env.mjs";
import { postgresConnectionOptions } from "../config/postgres.mjs";

import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { readFileSync } from "node:fs";

import { createRequire } from "node:module";

import ts from "typescript";

import pg from "pg";
import { load as loadTree } from "./helpers/load-ts.mjs";

const require = createRequire(import.meta.url);

function load(path, deps = {}) {
    // Keep existing isolated fixtures independent of the operator library owner.
    const library = { adminLibrarySettingsOwner: async (actor) => actor };
    deps = { "./admin-library": library, "../admin-library": library, "@/lib/admin-library": library, ...deps };
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
                jsx: ts.JsxEmit.ReactJSX,
            },
        }).outputText,
    )((n) => (n in deps ? deps[n] : require(n)), m, m.exports);
    return m.exports;
}

const graphs = load("lib/agent-studio-graph.ts"),
    presets = loadTree("lib/agent-studio-presets.ts", { "./agent-studio-graph": graphs });

const graph = graphs.studioGraph("Parent");

assert.equal(
    graphs.studioDependencies({ ...graph, edges: graph.edges.filter((e) => e.id !== "info-main") })
        .root,
    null,
);

assert.equal(graph.nodes.length, 6);
assert.equal(graphs.studioDependencies(graph).model.id, "model");

const lone = {
    id: "lone",
    type: "ReferenceNode",
    position: { x: 0, y: 0 },
    data: { label: "Unwired", referenceKind: "builtin", referenceId: "profile" },
};

assert.equal(
    graphs.studioDependencies({ ...graph, nodes: [...graph.nodes, lone] }).references.length,
    0,
);

const existing = graphs.studioGraph("Custom", "gpt-5-nano", "Keep these instructions");

const merged = graphs.mergeStudioGraph(existing, graph);
assert.equal(
    merged.nodes.find((n) => n.id === "main").data.instructions,
    "Keep these instructions",
);
assert.equal(merged.nodes.find((n) => n.id === "model").data.modelId, "gpt-5-nano");
assert.deepEqual(graphs.mergeStudioGraph(merged, graph), merged);

assert.equal(presets.studioPresets.cyber.children.length, 5);

const upgraded = presets.ensureCyberAssistTools(existing);

assert.equal(
    upgraded.nodes.find((n) => n.id === "main").data.instructions,
    "Keep these instructions",
);

assert.equal(graphs.studioDependencies(upgraded).references.length, 2);

assert.equal(presets.ensureCyberAssistTools(upgraded), upgraded);

const ordering = load("lib/agent-card-order.ts");

assert.equal(ordering.validAgentOrder(["b", "a"], ["a", "b"]), true);

assert.equal(ordering.validAgentOrder(["a", "a"], ["a", "b"]), false);

assert.equal(ordering.validAgentOrder(["a", "foreign"], ["a", "b"]), false);

assert.deepEqual(
    ordering.moveAgent([{ id: "a" }, { id: "b" }, { id: "c" }], "a", "c").map((x) => x.id),
    ["b", "c", "a"],
);

const charts = load("lib/agent-studio-charts.ts");
const healthEvidence = load("lib/agent-service-health.ts");
const healthFixture = healthEvidence.serviceHealthEvidence(
    [
        {
            recordKey: "endpoint",
            recordType: "health",
            observedAt: "2026-10-10T10:00:00Z",
            payload: { device: "Fixture service", status: "Down", description: "HTTP 502" },
        },
        {
            recordKey: "unverified",
            recordType: "availability",
            observedAt: null,
            payload: { service: "Unverified", availability: 100, period: "24h", samples: 0 },
        },
        {
            recordKey: "measured",
            recordType: "availability",
            observedAt: "2026-10-10T10:00:00Z",
            payload: {
                service: "Measured",
                availability: 100,
                period: "24h",
                samples: 120,
                method: "Fraction of recorded up samples; gaps are not counted",
            },
        },
    ],
    "2026-10-10T10:05:00Z",
);
assert.equal(healthFixture.records[0].ageSeconds, 300);
assert.equal(healthFixture.liveCheckExecuted, false);
assert.equal(healthFixture.databaseActivityEvidenceProvided, false);
assert.equal(healthFixture.records[1].payload.availability, undefined);
assert.equal(healthFixture.records[1].observedAt, null);
assert.equal(healthFixture.records[1].availabilityEvidence.supported, false);
assert.equal(healthFixture.records[2].payload.availability, 100);
assert.equal(healthFixture.records[2].availabilityEvidence.supported, true);
assert.equal(healthFixture.capabilities.liveServiceCheck, false);

assert.deepEqual(
    charts.chartCounts("scan_reports", {
        findings: [{ severity: "High" }, { severity: "High" }, { severity: "Low" }],
        completedAt: "2026-10-10T10:00:00Z",
    }).points,
    [
        { label: "High", value: 2 },
        { label: "Low", value: 1 },
    ],
);

assert.equal(charts.chartCounts("scan_reports", { message: "No report" }), null);

assert.equal(charts.chartCounts("incidents", []), null);
const ChartComponent = load("components/agent-studio-chart.tsx").default;
const { renderToStaticMarkup } = require("react-dom/server");
const chartMarkup = renderToStaticMarkup(
    require("react").createElement(ChartComponent, {
        chart: {
            id: "fixture",
            ...charts.chartCounts("scan_reports", {
                findings: [{ severity: "High" }, { severity: "High" }, { severity: "Low" }],
            }),
        },
    }),
);
assert.match(chartMarkup, /High: 2, Low: 1/);
assert.match(chartMarkup, /width:50%/);
assert.match(chartMarkup, /Recorded data/);

const pool = new pg.Pool({ ...postgresConnectionOptions(), max: 1 }),
    c = await pool.connect(),
    db = { query: (sql, args) => c.query(sql, args) };

const access = load("lib/workspace-access.ts", { "@/lib/db": { db } }),
    permissions = load("lib/workspace-permissions.ts");

class InputError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const endpoint = load("lib/agent-tool-input.ts", { "./eassist/transport": { InputError } });

assert.equal(
    endpoint.resolveToolEndpoint(
        "https://api.github.com/repos/{owner}/{repo}",
        '{"owner":"openai","repo":"example"}',
    ),
    "https://api.github.com/repos/openai/example",
);

assert.throws(
    () => endpoint.resolveToolEndpoint("https://{host}/api", '{"host":"unapproved.invalid"}'),
    /hosts/,
);

assert.throws(
    () => endpoint.resolveToolEndpoint("https://example.invalid/{id}", '{"id":".."}'),
    /Invalid/,
);

const usage = [];

let remoteResponse = { result: [] },
    remoteFailure = false,
    remoteCalls = [];
const serviceNow = load("lib/agent-servicenow.ts", {
    "./db": { db },
    "./eassist/transport": {
        remote: async (connection, path) => {
            remoteCalls.push({ owner: connection.user_id, path });
            if (remoteFailure) throw new Error("Fixture unreachable");
            return remoteResponse;
        },
    },
});
const flows = load("lib/agent-flow.ts", {
    "./eassist/transport": { InputError },
    "./agent-studio-graph": graphs,
});
const projectBindingFixture = {
    id: randomUUID(),
    name: "Custom project fixture",
    purpose: "Read a fixture asset",
    provider: "custom_fixture",
    operation: "lookup",
    defaults: { limit: 10 },
    revision: 1,
};
const projectIntegrationCalls = [];
const projectRuntimeFixture = {
    requireIntegrationAdmin: async () => {},
    integrationCapabilities: async () => ({
        configured: true,
        enabled: true,
        operations: [{ id: "lookup", label: "Lookup", requiresApproval: false }],
    }),
    prepareIntegration: async (actor, provider, operation, inputs, scope) => {
        projectIntegrationCalls.push({ actor, provider, operation, inputs, scope });
        return { status: "completed", result: { assetId: inputs.assetId } };
    },
};
const builtinSettings = load("lib/builtin-project-tool-settings.ts", {
    "./db": { db },
    "./eassist/transport": { InputError },
    "./agent-project-tools": load("lib/agent-project-tools.ts", {
        "./integrations/catalog": load("lib/integrations/catalog.ts"),
    }),
});
const runtime = load("lib/agent-studio-runtime.ts", {
    "./dwp-tools": loadTree("lib/dwp-tools.ts", { "./db": { db }, "@/lib/db": { db } }),
    "./builtin-project-tool-settings": builtinSettings,
    "./integrations/project-tools": { resolveProjectBinding: async () => projectBindingFixture },
    "./integrations/runtime": projectRuntimeFixture,
    "./agent-flow": flows,
    "./meeting-rooms": {
        readMeetingRooms: async (actor) => ({
            calendar: "AIForce.Ops",
            configured: false,
            actor,
            bookingPage: "/dashboard/meeting-rooms",
        }),
    },
    "./agent-service-health": healthEvidence,
    "./agent-servicenow": serviceNow,
    "./agent-studio-charts": load("lib/agent-studio-charts.ts"),
    "./db": { db },
    "./agent-studio-graph": graphs,
    "./workspace-access": access,
    "./workspace-permissions": permissions,
    "./eassist/organization-context": {
        sharedOperationsOwner: async (user) => {
            if (!permissions.permitted(await access.workspaceAccess(user), "admin"))
                throw new InputError("Admin access required.", 403);
            return user;
        },
    },
    "./eassist/transport": {
        InputError,
        authorizeOrigin: () => {},
        boundedJson: async (request) => request.json(),
    },
    "./agent-tool-input": load("lib/agent-tool-input.ts", {
        "./eassist/transport": { InputError },
    }),
    "./agent-secrets": {
        decryptAgentApiKey: () => {
            throw new Error("No test secret should be accessed");
        },
    },
    "./model-usage": { recordModelUsage: async (...args) => usage.push(args) },
    "./model-pricing": { tokenDetails: () => ({}) },
    "./playground-models": { supportsPlaygroundModel: () => true },
});

const fake = (answer) => ({
    chat: { completions: { create: async (request) => answer(request) } },
});

const result = (content, calls) => ({
    model: "gpt-4.1-mini",
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    choices: [
        {
            finish_reason: calls ? "tool_calls" : "stop",
            message: { role: "assistant", content, tool_calls: calls },
        },
    ],
});

const call = (name, request = "Question") => [
    {
        id: randomUUID(),
        type: "function",
        function: { name, arguments: JSON.stringify({ request }) },
    },
];

try {
    await c.query("BEGIN");

    const user = randomUUID(),
        foreign = randomUUID(),
        parent = randomUUID(),
        child = randomUUID();

    for (const id of [user, foreign])
        await c.query(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
            [id, "Studio fixture", id + "@example.invalid"],
        );

    await c.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1", [user]);
    const initialBuiltin = await builtinSettings.builtinTools(user);
    assert.equal(initialBuiltin.length, 12);
    assert.ok(initialBuiltin.every((t) => t.enabled));
    await builtinSettings.changeBuiltinTool(user, "save_builtin", {
        id: "profile",
        name: "Employee profile",
        purpose: "My authorized profile",
        enabled: false,
    });
    await assert.rejects(() => runtime.readProjectTool(user, "profile"), /disabled/);
    assert.equal((await builtinSettings.builtinTool(foreign, "profile")).name, "My profile");
    await builtinSettings.changeBuiltinTool(user, "delete_builtin", { id: "profile" });
    assert.ok(!(await builtinSettings.builtinTools(user)).some((t) => t.id === "profile"));
    await builtinSettings.changeBuiltinTool(user, "restore_builtin", { id: "profile" });
    await assert.rejects(() => builtinSettings.builtinTool(user, "profile"), /disabled/);
    await builtinSettings.changeBuiltinTool(user, "save_builtin", {
        id: "profile",
        name: "My profile",
        purpose: "My profile",
        enabled: true,
    });
    assert.equal((await runtime.readProjectTool(user, "profile")).name, "Studio fixture");
    assert.throws(
        () => builtinSettings.validateDefaultRequest("chart_visualizer", '{"source":"salary"}'),
        /Choose requests/,
    );
    assert.throws(
        () => builtinSettings.validateDefaultRequest("meeting_rooms", '{"start":"2026-10-15"}'),
        /both start/,
    );
    assert.throws(
        () => builtinSettings.validateDefaultRequest("profile", "secrets"),
        /no configurable/,
    );
    assert.throws(
        () => builtinSettings.validateDefaultRequest("incidents", "all private data"),
        /INC/,
    );
    await builtinSettings.changeBuiltinTool(user, "save_builtin", {
        id: "incidents",
        name: "Incident lookup",
        purpose: "Lookup",
        enabled: true,
        defaultRequest: "INC123456",
    });
    assert.equal(
        (await builtinSettings.builtinTool(user, "incidents")).defaultRequest,
        "INC123456",
    );
    await builtinSettings.changeBuiltinTool(user, "save_builtin", {
        id: "incidents",
        name: "ServiceNow incidents",
        purpose: "Incidents",
        enabled: true,
        defaultRequest: "",
    });
    console.log(
        "PASS: built-in project settings persistence, owner isolation, deletion/disabled restore, runtime denial and default-input validation.",
    );

    async function save(id, name, g) {
        await c.query(
            "INSERT INTO agents(id,user_id,name,purpose,model_id,instructions) VALUES($1,$2,$3,'Fixture','gpt-4.1-mini','Use connected evidence')",
            [id, user, name],
        );
        await c.query("INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)", [
            user,
            id,
            JSON.stringify(g),
        ]);
    }

    const childGraph = graphs.studioGraph("Child");
    childGraph.nodes.push({ ...lone, id: "profile" });
    childGraph.edges.push({ id: "profile-edge", source: "tools", target: "profile" });

    const parentGraph = graphs.studioGraph("Parent");
    parentGraph.nodes.push({
        ...lone,
        id: "child",
        data: {
            label: "Child",
            referenceKind: "agent",
            referenceId: child,
            purpose: "Profile questions",
        },
    });
    parentGraph.edges.push({ id: "delegate", source: "agents", target: "child" });

    await save(child, "Child", childGraph);
    await save(parent, "Parent", parentGraph);

    let count = 0;

    const delegated = await runtime.runStudioAgent(
        user,
        parent,
        [{ role: "user", content: "Tell me my profile" }],
        {
            client: fake((request) => {
                count++;
                if (count === 1) {
                    assert.match(request.messages[0].content, /current_application_database/);
                    assert.match(request.messages[0].content, /specialist_agent/);
                    assert.match(request.messages[0].content, /\"configured\":false/);
                    return result(null, call("connection_0"));
                }
                if (count === 2) return result(null, call("connection_0"));
                if (count === 3) {
                    assert.match(request.messages.at(-1).content, /Studio fixture/);
                    return result("Child verified profile");
                }
                assert.match(request.messages.at(-1).content, /Child verified profile/);
                return result("Parent answer");
            }),
        },
    );

    assert.equal(delegated.reply, "Parent answer");
    assert.equal(delegated.usage.totalTokens, 60);
    assert.ok(delegated.trace.some((t) => t.name === "Child" && t.kind === "agent"));
    assert.equal(usage.length, 4);

    await assert.rejects(() => runtime.loadStudioAgent(foreign, parent), /not found/);

    await assert.rejects(() => runtime.readProjectTool(foreign, "scan_reports"), /Admin access/);

    for (const name of ["requests", "scan_reports", "service_health", "incidents"])
        await runtime.readProjectTool(user, name);
    const healthRecord = randomUUID(),
        unsupportedAvailability = randomUUID();
    await c.query(
        "INSERT INTO service_review_records(id,user_id,record_type,record_key,payload,observed_at) VALUES($1,$2,'health','fixture-endpoint',$3,'2026-10-10T10:00:00Z')",
        [
            healthRecord,
            user,
            JSON.stringify({ device: "Fixture service", status: "Down", description: "HTTP 502" }),
        ],
    );
    await c.query(
        "INSERT INTO service_review_records(id,user_id,record_type,record_key,payload) VALUES($1,$2,'availability','fixture-unsupported',$3)",
        [
            unsupportedAvailability,
            user,
            JSON.stringify({
                service: "Fixture service",
                availability: 100,
                period: "24h",
                samples: 0,
            }),
        ],
    );
    const monitorGraph = graphs.studioGraph("Database Activity Monitoring Agent");
    monitorGraph.nodes.push({
        id: "health",
        type: "ReferenceNode",
        position: { x: 0, y: 0 },
        data: { label: "Service health", referenceKind: "builtin", referenceId: "service_health" },
    });
    monitorGraph.edges.push({ id: "health-edge", source: "tools", target: "health" });
    const monitor = randomUUID();
    await save(monitor, "Database Activity Monitoring Agent", monitorGraph);
    const healthAnswer = await runtime.runStudioAgent(
        user,
        monitor,
        [{ role: "user", content: "Please give me those recorded observations" }],
        {
            sharedViewer: foreign,
            client: fake((request) => {
                const system = request.messages[0].content;
                assert.match(system, /infrastructure_service_health/);
                assert.match(system, /2026-10-10T10:00:00.000Z/);
                assert.match(system, /last recorded check/);
                assert.match(system, /"liveServiceCheck":false/);
                assert.match(system, /"supported":false/);
                assert.match(system, /not Database activity monitoring results/);
                return result(
                    "The last recorded check returned HTTP 502. Database query monitoring is unverified.",
                );
            }),
        },
    );
    assert.match(healthAnswer.reply, /No live endpoint check was run/);
    assert.match(healthAnswer.reply, /do not verify database audit or query activity/);
    const currentHealth = await runtime.readProjectTool(user, "service_health");
    assert.ok(currentHealth.checkedAt);
    assert.equal(
        currentHealth.records.find((r) => r.recordKey === "fixture-unsupported").payload
            .availability,
        undefined,
    );
    await assert.rejects(() => runtime.readProjectTool(foreign, "service_health"), /Admin access/);
    await c.query("DELETE FROM service_review_records WHERE id=ANY($1::uuid[])", [
        [healthRecord, unsupportedAvailability],
    ]);
    console.log(
        "PASS: shared monitoring labels recorded service health separately from database activity, retains observation/retrieval timestamps, withholds unsupported availability percentages and declares live checks unavailable. Isolated fixtures; no endpoint or provider calls.",
    );

    const incidentConnection = randomUUID();
    await c.query(
        "INSERT INTO eassist_connections(id,user_id,name,kind,base_url,enabled) VALUES($1,$2,'ServiceNow fixture','servicenow','https://example.invalid',false)",
        [incidentConnection, user],
    );
    await c.query(
        "INSERT INTO eassist_records(id,user_id,connection_id,kind,external_id,data) VALUES($1,$2,$3,'incidents','fixture-incident',$4)",
        [
            randomUUID(),
            user,
            incidentConnection,
            JSON.stringify({ number: "INC-FIXTURE", priority: "1" }),
        ],
    );
    const synchronized = await runtime.readProjectTool(user, "incidents");
    assert.equal(synchronized.mode, "paused");
    assert.equal(synchronized.records.length, 1);
    assert.equal(synchronized.records[0].data.number, "INC-FIXTURE");
    assert.equal(remoteCalls.length, 0);
    assert.deepEqual(charts.chartCounts("incidents", synchronized).points, [
        { label: "1", value: 1 },
    ]);
    console.log(
        "PASS: agent reads the incidents record kind written by the ServiceNow collector. This is an isolated fixture, not a live tenant test.",
    );
    assert.equal((await serviceNow.readServiceNowIncidents(foreign)).mode, "not_connected");
    await assert.rejects(() => runtime.readProjectTool(foreign, "incidents"), /Admin/);
    await c.query("UPDATE eassist_connections SET enabled=true WHERE id=$1", [incidentConnection]);
    remoteResponse = { result: [] };
    const emptyLive = await runtime.readProjectTool(user, "incidents");
    assert.equal(emptyLive.mode, "live");
    assert.equal(emptyLive.records.length, 0);
    assert.ok(emptyLive.checkedAt);
    remoteResponse = { result: [{ sys_id: "fixture-live", number: "INC123456", priority: "2" }] };
    const current = await runtime.readProjectTool(
        user,
        "incidents",
        "What is the status of INC123456?",
    );
    assert.equal(current.mode, "live");
    assert.equal(current.records[0].data.number, "INC123456");
    assert.match(remoteCalls.at(-1).path, /sysparm_query=number%3DINC123456/);
    assert.match(charts.chartCounts("incidents", current).source, /Live/);
    remoteFailure = true;
    const cached = await runtime.readProjectTool(user, "incidents");
    assert.equal(cached.mode, "cached");
    assert.equal(cached.records[0].data.number, "INC-FIXTURE");
    assert.match(charts.chartCounts("incidents", cached).source, /not live/);
    remoteFailure = false;
    remoteResponse = { result: [{ unexpected: "bad record" }] };
    assert.equal((await runtime.readProjectTool(user, "incidents")).mode, "cached");
    remoteResponse = { notAnIncidentResponse: true };
    assert.equal((await runtime.readProjectTool(user, "incidents")).mode, "cached");
    const secondConnection = randomUUID();
    await c.query(
        "INSERT INTO eassist_connections(id,user_id,name,kind,base_url,enabled) VALUES($1,$2,'Second fixture','servicenow','https://second.invalid',true)",
        [secondConnection, user],
    );
    const callsBefore = remoteCalls.length;
    assert.equal((await runtime.readProjectTool(user, "incidents")).mode, "choose_connection");
    assert.equal(remoteCalls.length, callsBefore);
    remoteResponse = { result: [] };
    assert.equal(
        (
            await runtime.readProjectTool(
                user,
                "incidents",
                JSON.stringify({ connectionName: "Second fixture" }),
            )
        ).mode,
        "live",
    );
    await c.query("DELETE FROM eassist_connections WHERE id=$1", [secondConnection]);
    await c.query("UPDATE eassist_connections SET enabled=false WHERE id=$1", [incidentConnection]);
    console.log(
        "PASS: disconnected, paused, live-empty, live incident number, cached failure, invalid API response, multiple-instance choice and role boundaries; isolated API fixtures only.",
    );

    const emptyReport = await runtime.readProjectTool(user, "scan_reports");
    assert.equal(emptyReport.mode, "no_data");
    assert.equal(emptyReport.scanId, null);
    assert.ok(emptyReport.checkedAt);
    assert.equal(emptyReport.freshScanStarted, false);

    const assistGraph = presets.ensureCyberAssistTools(graphs.studioGraph("Cyber test"));

    const cyber = randomUUID();
    await save(cyber, "Cyber test", assistGraph);

    await c.query(
        "INSERT INTO security_scan_jobs(id,user_id,request_id,target,status,completed_at,findings) VALUES($1,$2,$3,'https://example.invalid','completed',now(),$4)",
        [
            randomUUID(),
            user,
            randomUUID(),
            JSON.stringify([{ severity: "High" }, { severity: "High" }, { severity: "Low" }]),
        ],
    );

    let chartCalls = 0;

    const rendered = await runtime.runStudioAgent(
        user,
        cyber,
        [{ role: "user", content: "Chart scan findings" }],
        {
            client: fake((request) =>
                ++chartCalls === 1
                    ? result(null, call("connection_1", '{"source":"scan_reports"}'))
                    : (assert.match(request.messages.at(-1).content, /Latest scan findings/),
                      result("Chart is ready")),
            ),
        },
    );

    assert.equal(rendered.charts.length, 1);
    assert.deepEqual(rendered.charts[0].points, [
        { label: "High", value: 2 },
        { label: "Low", value: 1 },
    ]);

    let assistCalls = 0;

    const assisted = await runtime.runStudioAgent(
        user,
        cyber,
        [{ role: "user", content: "Help assess recorded operations" }],
        {
            client: fake((request) =>
                ++assistCalls === 1
                    ? result(null, call("connection_0"))
                    : (assert.match(request.messages.at(-1).content, /observations/),
                      result("Recorded guidance")),
            ),
        },
    );

    assert.ok(assisted.trace.some((t) => t.name === "Agent Assist" && t.status === "completed"));

    const foreignGraph = presets.ensureCyberAssistTools(graphs.studioGraph("Restricted test")),
        foreignAgent = randomUUID();

    await c.query(
        "INSERT INTO agents(id,user_id,name,model_id) VALUES($1,$2,'Restricted test','gpt-4.1-mini')",
        [foreignAgent, foreign],
    );

    await c.query("INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)", [
        foreign,
        foreignAgent,
        JSON.stringify(foreignGraph),
    ]);

    let deniedCalls = 0;

    const denied = await runtime.runStudioAgent(
        foreign,
        foreignAgent,
        [{ role: "user", content: "Chart scans" }],
        {
            client: fake(() =>
                ++deniedCalls === 1
                    ? result(null, call("connection_1", '{"source":"scan_reports"}'))
                    : result("Admin required"),
            ),
        },
    );

    assert.equal(denied.charts.length, 0);
    assert.ok(denied.trace.some((t) => t.status === "error" && t.detail.includes("Admin access")));

    await c.query('UPDATE "user" SET name=$2 WHERE id=$1', [foreign, "Preview Recipient"]);
    const meetingAgent = randomUUID(),
        meetingGraph = presets.ensureMeetingRoomTool(graphs.studioGraph("MeetRoom"));
    await save(meetingAgent, "MeetRoom", meetingGraph);
    let meetingCalls = 0;
    await runtime.runStudioAgent(
        user,
        meetingAgent,
        [{ role: "user", content: "Which rooms can I book?" }],
        {
            sharedViewer: foreign,
            client: fake((request) => {
                if (++meetingCalls === 1) {
                    assert.match(
                        request.messages[0].content,
                        /live_aiforce_room_availability_read_only/,
                    );
                    assert.ok(request.messages[0].content.includes('"actor":"' + foreign + '"'));
                    assert.match(request.messages[0].content, /chat reads cannot reserve rooms/);
                    return result(null, call("connection_0", "{}"));
                }
                const evidence = JSON.parse(request.messages.at(-1).content);
                assert.equal(evidence.actor, foreign);
                assert.equal(evidence.configured, false);
                assert.equal(evidence.bookingPage, "/dashboard/meeting-rooms");
                return result("An Admin must configure real rooms first.");
            }),
        },
    );
    console.log(
        "PASS: shared MeetRoom reads recipient-scoped native calendar evidence, discloses missing real rooms and offers Dashboard confirmation without chat writes. No provider calls.",
    );
    let sharedCalls = 0,
        checkedAccess = 0;
    const sharedChart = await runtime.runStudioAgent(
        user,
        cyber,
        [{ role: "user", content: "Show shared vulnerabilities" }],
        {
            sharedViewer: foreign,
            checkSharedAccess: async () => {
                checkedAccess++;
            },
            client: fake((request) =>
                ++sharedCalls === 1
                    ? (assert.match(request.messages[0].content, /shared read-only preview/),
                      result(null, call("connection_1", '{"source":"scan_reports"}')))
                    : result("Shared chart"),
            ),
        },
    );
    assert.deepEqual(sharedChart.charts[0].points, [
        { label: "High", value: 2 },
        { label: "Low", value: 1 },
    ]);
    assert.ok(checkedAccess >= 3);
    assert.equal(usage.at(-1)[0], foreign);
    const originalScan = await runtime.readProjectTool(user, "scan_reports");
    assert.equal(originalScan.mode, "recorded");
    assert.equal(originalScan.scanId, originalScan.id);
    assert.ok(originalScan.completedAt);
    assert.ok(originalScan.checkedAt);
    assert.equal(originalScan.capabilities.activeScan, false);
    assert.equal(originalScan.capabilities.authenticatedScan, false);
    assert.match(sharedChart.reply, new RegExp(originalScan.scanId));
    assert.match(sharedChart.reply, /Completed \(UTC\)/);
    assert.match(sharedChart.reply, /Checked \(UTC\)/);
    assert.match(sharedChart.reply, /no new scan was started/);
    const newerScan = randomUUID(),
        pendingScan = randomUUID();
    await c.query(
        "INSERT INTO security_scan_jobs(id,user_id,request_id,target,status,completed_at,findings,created_at) VALUES($1,$2,$3,'https://example.invalid','completed',now()+interval '1 second',$4,now()+interval '1 second')",
        [newerScan, user, randomUUID(), JSON.stringify([{ severity: "Medium" }])],
    );
    await c.query(
        "INSERT INTO security_scan_jobs(id,user_id,request_id,target,status,created_at) VALUES($1,$2,$3,'https://example.invalid','queued',now()+interval '2 seconds')",
        [pendingScan, user, randomUUID()],
    );
    const refreshed = await runtime.runStudioAgent(
        user,
        cyber,
        [
            { role: "user", content: "Old scan?" },
            { role: "assistant", content: "Older findings" },
            { role: "user", content: "Show the latest security findings" },
        ],
        {
            sharedViewer: foreign,
            client: fake((request) => {
                const system = request.messages[0].content;
                assert.ok(system.includes(newerScan));
                assert.ok(system.includes(pendingScan));
                assert.match(system, /"activeScan":false/);
                assert.match(system, /never reuse older scan facts/);
                return result("Latest verified findings");
            }),
        },
    );
    assert.match(refreshed.reply, new RegExp(newerScan));
    assert.match(refreshed.reply, new RegExp(pendingScan));
    assert.match(refreshed.reply, /queued/);
    assert.equal(refreshed.reply.includes(originalScan.scanId), false);
    await c.query("DELETE FROM security_scan_jobs WHERE id=ANY($1::uuid[])", [
        [newerScan, pendingScan],
    ]);
    console.log(
        "PASS: shared security answers refresh the latest report despite prior chat history, preserve scan ID/completion/check timestamps, disclose pending newer jobs and unavailable active/authenticated execution. No scan or provider calls.",
    );

    let personalCalls = 0;
    await runtime.runStudioAgent(user, child, [{ role: "user", content: "Who am I?" }], {
        sharedViewer: foreign,
        client: fake((request) =>
            ++personalCalls === 1
                ? result(null, call("connection_0"))
                : (assert.match(request.messages.at(-1).content, /Preview Recipient/),
                  result("Your profile")),
        ),
    });
    await assert.rejects(
        () =>
            runtime.runStudioAgent(user, cyber, [{ role: "user", content: "After revocation" }], {
                sharedViewer: foreign,
                checkSharedAccess: async () => {
                    throw new InputError("Sharing removed", 403);
                },
                client: fake(() => {
                    throw new Error("Model must not be called");
                }),
            }),
        /Sharing removed/,
    );
    console.log(
        "PASS: shared runtime reads Admin scan evidence, keeps personal profile scoped to recipient, bills recipient and checks revoked access before model calls.",
    );
    console.log(
        "PASS: persistent-order validation, safe rearrangement, additive CyberOps upgrade, verified chart counts, empty sources, real-DB Chart Visualizer and Agent Assist, and chart RBAC.",
    );

    const tool = randomUUID(),
        writeGraph = graphs.studioGraph("Writer");
    writeGraph.nodes.push({
        ...lone,
        id: "write",
        data: {
            label: "Fixture API",
            referenceKind: "tool",
            referenceId: tool,
            includeApiKey: false,
        },
    });
    writeGraph.edges.push({ id: "write-edge", source: "tools", target: "write" });

    await c.query(
        "INSERT INTO tools(id,user_id,name,purpose,method,endpoint_url) VALUES($1,$2,'Fixture API','Save fixture','POST','https://example.invalid/api')",
        [tool, user],
    );

    const writer = randomUUID();
    await save(writer, "Writer", writeGraph);

    let readonlyCalls = 0;
    const readonly = await runtime.runStudioAgent(
        user,
        writer,
        [{ role: "user", content: "Try external write" }],
        {
            sharedViewer: foreign,
            client: fake(() =>
                ++readonlyCalls === 1
                    ? result(null, call("connection_0", '{"name":"fixture"}'))
                    : result("Read-only"),
            ),
        },
    );
    assert.equal(readonly.approvals.length, 0);
    assert.ok(
        readonly.trace.some((item) => item.status === "error" && item.detail.includes("read-only")),
    );
    let writeCalls = 0;

    const draft = await runtime.runStudioAgent(
        user,
        writer,
        [{ role: "user", content: "Save fixture" }],
        {
            client: fake(() =>
                ++writeCalls === 1
                    ? result(null, call("connection_0", '{"name":"fixture"}'))
                    : result("Please confirm the preview"),
            ),
        },
    );

    assert.equal(draft.approvals.length, 1);
    assert.equal(draft.approvals[0].agentId, writer);
    assert.equal(draft.trace.at(-2).status, "awaiting_approval");

    await assert.rejects(
        () => runtime.approveStudioTool(foreign, writer, draft.approvals[0].token),
        /not found/,
    );

    const oldFetch = globalThis.fetch;
    let sent = 0;

    globalThis.fetch = async (url, options) => {
        sent++;
        assert.equal(options.body, '{"name":"fixture"}');
        return new Response(JSON.stringify({ saved: true }), { status: 200 });
    };

    try {
        const approved = await runtime.approveStudioTool(user, writer, draft.approvals[0].token);
        assert.equal(approved.httpStatus, 200);
        await assert.rejects(
            () => runtime.approveStudioTool(user, writer, draft.approvals[0].token),
            /expired/,
        );
        assert.equal(sent, 1);
    } finally {
        globalThis.fetch = oldFetch;
    }

    const actualId = randomUUID(),
        actual = graphs.studioGraph("Actual fixture");
    actual.nodes[0].data.workflowMode = "actual";
    actual.nodes.push({
        id: "end-flow",
        type: "EndNode",
        position: { x: 0, y: 0 },
        data: { label: "End" },
    });
    actual.edges.push({ id: "end-flow-edge", source: "main", target: "end-flow" });
    await save(actualId, "Actual fixture", actual);
    const actualAnswer = await runtime.runStudioAgent(
        user,
        actualId,
        [{ role: "user", content: "Explain this task" }],
        { client: fake(() => result("Actual agent ran")) },
    );
    assert.equal(actualAnswer.reply, "Actual agent ran");
    const apiId = randomUUID(),
        apiGraph = {
            nodes: [
                {
                    id: "start",
                    type: "StartNode",
                    position: { x: 0, y: 0 },
                    data: { label: "Start", workflowMode: "actual" },
                },
                {
                    id: "api",
                    type: "ApiNode",
                    position: { x: 0, y: 0 },
                    data: {
                        label: "Custom API fixture",
                        method: "POST",
                        url: "https://example.invalid/work",
                        includeApiKey: false,
                        bodyParams: '{"name":"fixture"}',
                    },
                },
                {
                    id: "finish",
                    type: "EndNode",
                    position: { x: 0, y: 0 },
                    data: { label: "End", message: "Must not reach before approval" },
                },
            ],
            edges: [
                { id: "api-entry", source: "start", target: "api" },
                { id: "api-finish", source: "api", target: "finish" },
            ],
        };
    await save(apiId, "Custom API fixture", apiGraph);
    const pendingApi = await runtime.runStudioAgent(
        user,
        apiId,
        [{ role: "user", content: "Submit" }],
        {
            client: fake(() => {
                throw new Error("No model should be called by an API-only flow");
            }),
        },
    );
    assert.equal(pendingApi.approvals.length, 1);
    assert.match(pendingApi.reply, /Nothing has been sent/);
    await assert.rejects(
        () =>
            runtime.runStudioAgent(user, apiId, [{ role: "user", content: "Submit" }], {
                sharedViewer: foreign,
                client: fake(() => result("unused")),
            }),
        /External writes/,
    );
    globalThis.fetch = async (_, options) => {
        assert.equal(options.body, '{"name":"fixture"}');
        return Response.json({ saved: true });
    };
    try {
        assert.equal(
            (await runtime.approveStudioTool(user, apiId, pendingApi.approvals[0].token))
                .httpStatus,
            200,
        );
        await assert.rejects(
            () => runtime.approveStudioTool(user, apiId, pendingApi.approvals[0].token),
            /expired/,
        );
    } finally {
        globalThis.fetch = oldFetch;
    }
    console.log(
        "PASS: real runtime executes Actual Agent steps; custom API writes stop for exact one-use approval and shared viewers cannot write. Fixtures only.",
    );

    const boundId = randomUUID(),
        boundGraph = graphs.studioGraph("Bound project tool");
    boundGraph.nodes.push({
        ...lone,
        id: "bound-tool",
        data: {
            label: "Custom project fixture",
            referenceKind: "builtin",
            referenceId: `project:${projectBindingFixture.id}`,
        },
    });
    boundGraph.edges.push({ id: "bound-edge", source: "tools", target: "bound-tool" });
    await save(boundId, "Bound project fixture", boundGraph);
    let boundCalls = 0;
    const bound = await runtime.runStudioAgent(
        user,
        boundId,
        [{ role: "user", content: "Read asset fixture" }],
        {
            client: fake(() =>
                ++boundCalls === 1
                    ? result(null, call("connection_0", '{"inputs":{"assetId":"asset-one"}}'))
                    : result("Read asset completed"),
            ),
        },
    );
    assert.equal(bound.reply, "Read asset completed");
    assert.equal(projectIntegrationCalls.length, 1);
    assert.equal(projectIntegrationCalls[0].provider, "custom_fixture");
    assert.equal(projectIntegrationCalls[0].operation, "lookup");
    assert.deepEqual(projectIntegrationCalls[0].inputs, { limit: 10, assetId: "asset-one" });
    assert.match(projectIntegrationCalls[0].scope.bindingHash, /^[a-f0-9]{64}$/);
    let boundDeniedCalls = 0;
    const deniedProject = await runtime.runStudioAgent(
        user,
        boundId,
        [{ role: "user", content: "Read asset fixture" }],
        {
            sharedViewer: foreign,
            client: fake(() =>
                ++boundDeniedCalls === 1
                    ? result(null, call("connection_0", "{}"))
                    : result("Private Admin connection required"),
            ),
        },
    );
    assert.equal(projectIntegrationCalls.length, 1);
    assert.ok(
        deniedProject.trace.some(
            (t) => t.status === "error" && t.detail.includes("private agent preview"),
        ),
    );
    console.log(
        "PASS: actual Agent Studio runtime executes a custom project-tool binding with fixed provider/operation, server defaults, exact scope fingerprint, and rejects shared-preview access without contacting the provider.",
    );
    const reviewId = randomUUID(),
        reviewGraph = {
            nodes: [
                {
                    id: "start",
                    type: "StartNode",
                    position: { x: 0, y: 0 },
                    data: { label: "Start", workflowMode: "actual" },
                },
                {
                    id: "review",
                    type: "UserApprovalNode",
                    position: { x: 0, y: 0 },
                    data: { label: "Review", approvalPrompt: "Please review this result" },
                },
                {
                    id: "approved",
                    type: "EndNode",
                    position: { x: 0, y: 0 },
                    data: { label: "End", message: "Approved branch ran" },
                },
                {
                    id: "rejected",
                    type: "EndNode",
                    position: { x: 0, y: 0 },
                    data: { label: "End", message: "Rejected branch ran" },
                },
            ],
            edges: [
                { id: "s", source: "start", target: "review" },
                { id: "a", source: "review", sourceHandle: "approve", target: "approved" },
                { id: "r", source: "review", sourceHandle: "reject", target: "rejected" },
            ],
        };
    await save(reviewId, "Review fixture", reviewGraph);
    const noModel = fake(() => {
        throw new Error("Approval-only flow must not call model");
    });
    for (const decision of ["approve", "reject"]) {
        const pending = await runtime.runStudioAgent(
            user,
            reviewId,
            [{ role: "user", content: "Review" }],
            { client: noModel },
        );
        assert.equal(pending.approvals[0].kind, "flow");
        await assert.rejects(
            () =>
                runtime.resumeStudioFlow(
                    foreign,
                    reviewId,
                    pending.approvals[0].token,
                    decision,
                    noModel,
                ),
            /not found/,
        );
        const resumed = await runtime.resumeStudioFlow(
            user,
            reviewId,
            pending.approvals[0].token,
            decision,
            noModel,
        );
        assert.equal(
            resumed.reply,
            decision === "approve" ? "Approved branch ran" : "Rejected branch ran",
        );
        await assert.rejects(
            () =>
                runtime.resumeStudioFlow(
                    user,
                    reviewId,
                    pending.approvals[0].token,
                    decision,
                    noModel,
                ),
            /expired/,
        );
    }
    await assert.rejects(
        () =>
            runtime.runStudioAgent(user, reviewId, [{ role: "user", content: "Review" }], {
                sharedViewer: foreign,
                client: noModel,
            }),
        /private preview/,
    );
    const changed = await runtime.runStudioAgent(
        user,
        reviewId,
        [{ role: "user", content: "Review" }],
        { client: noModel },
    );
    await c.query(
        "UPDATE agent_workflows SET graph=jsonb_set(graph,'{nodes,1,data,approvalPrompt}','\"Changed\"') WHERE user_id=$1 AND agent_id=$2",
        [user, reviewId],
    );
    await assert.rejects(
        () =>
            runtime.resumeStudioFlow(
                user,
                reviewId,
                changed.approvals[0].token,
                "approve",
                noModel,
            ),
        /workflow changed/,
    );
    console.log(
        "PASS: User Approval persists a pause, resumes both branches, rejects other users, replay, graph changes and shared execution.",
    );

    const cycle = {
        ...parentGraph,
        nodes: parentGraph.nodes.map((n) =>
            n.id === "child" ? { ...n, data: { ...n.data, referenceId: parent } } : n,
        ),
    };

    await c.query("UPDATE agent_workflows SET graph=$3 WHERE user_id=$1 AND agent_id=$2", [
        user,
        parent,
        JSON.stringify(cycle),
    ]);

    let cycleCalls = 0;
    const cyclic = await runtime.runStudioAgent(
        user,
        parent,
        [{ role: "user", content: "delegate" }],
        {
            client: fake(() =>
                ++cycleCalls === 1
                    ? result(null, call("connection_0"))
                    : result("The connection has a cycle"),
            ),
        },
    );
    assert.equal(cyclic.trace.find((t) => t.status === "error").detail.includes("cycle"), true);

    console.log(
        "PASS: graph structure, preservation/idempotency, disconnected isolation, real-DB delegation, tool results, combined usage, ownership/RBAC, exact write preview, one-use approvals and cycle protection. No paid provider calls or real external actions.",
    );
} finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
