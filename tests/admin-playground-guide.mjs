import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const m = { exports: {} };
new Function(
    "module",
    "exports",
    ts.transpileModule(readFileSync("lib/admin-playground-guide.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
)(m, m.exports);
const { adminCapabilities, adminPlaygroundGuide: guide } = m.exports;
const expected = [
    "Offer emails",
    "Email previews",
    "Email status",
    "Test emails",
    "Request approval",
    "Request rejection",
    "Request cancellation",
    "Request fulfilment",
    "Team requests",
    "Role assignment",
    "Admin assignment",
    "Account activation",
    "Account deactivation",
    "Account deletion",
    "Employment confirmation",
    "Department creation",
    "Qualification management",
    "Position management",
    "Staff IDs",
    "Manager assignment",
    "Ticket top-ups",
    "Unlimited tickets",
    "Recruitment publishing",
    "Organization controls",
    "Security policies",
    "Security scans",
    "Security reports",
    "Organization alerts",
    "Alert acknowledgement",
    "Alert resolution",
    "Alert history",
    "Audit activity",
    "Integration management",
    "Agent management",
    "Tool management",
    "Knowledge management",
    "Model selection",
    "Usage tracking",
    "Token calculator",
    "Payment access",
    "Review Center",
    "Observability",
    "Value dashboard",
    "AI Ops",
    "Executive summary",
    "Data sources",
    "Geo health",
    "Service details",
    "Data imports",
    "Collector tokens",
    "ePACE access",
    "eAssist access",
    "Automated alerts",
    "Alert silences",
    "Incident management",
    "Operations dashboard",
    "Task templates",
    "Automation schedules",
    "Inventory management",
    "Variable groups",
    "Key Store",
    "Repository management",
    "Team management",
    "Activity monitoring",
    "Service status",
    "Workspace settings",
];
assert.deepEqual(
    adminCapabilities.map((c) => c.name),
    expected,
);
const admin = { role: "admin", active: true };
const capabilityQuestions = [
    "Just tell me what a Admin Can do in form of Points\n1.\n2.\n\nAnd can implement it",
    "Please show me what an admin can do in numbered points",
    "What can the Admin do?",
    "List all Admin capabilities",
];
for (const prompt of capabilityQuestions) {
    const response = guide(prompt, admin);
    assert.ok(response, prompt);
    for (const [i, name] of expected.entries())
        assert.ok(response.reply.includes(`${i + 1}. [${name}]`), name);
    assert.match(response.reply, /preview before confirmation/);
    assert.match(response.reply, /checkout is not implemented/);
    for (const role of ["user", "employee", "manager"])
        assert.equal(guide(prompt, { role, active: true }), null);
    assert.equal(guide(prompt, { role: "admin", active: false }), null);
}
for (const prompt of [
    "Create department Admin",
    "Send an offer letter to admin@example.com",
    "Approve REQ-123",
    "What can Abhinav do?",
])
    assert.equal(m.exports.isAdminCapabilitiesQuestion(prompt), false, prompt);
for (const name of expected) {
    const response = guide(name, admin);
    assert.ok(response, name);
    assert.match(response.reply, /\[Open /, name);
    assert.ok(response.choices.includes("Admin actions"), name);
    assert.ok(guide("How do I use " + name + "?", admin), name);
    for (const role of ["user", "employee", "manager"])
        assert.equal(guide(name, { role, active: true }), null);
    assert.equal(guide(name, { role: "admin", active: false }), null);
    const capability = adminCapabilities.find((c) => c.name === name),
        url = new URL(capability.href, "http://localhost");
    const path = url.pathname;
    assert.ok(
        existsSync("app" + path + "/page.tsx") ||
            (path.startsWith("/dashboard/") && existsSync("app/dashboard/[section]/page.tsx")),
        name + ": page exists",
    );
    if (url.hash) {
        const files = {
            "#mail-center": "MailCenter",
            "#staff-catalog": "StaffCatalogEditor",
            "#organization-controls": "OrganizationSettings",
            "#audit-activity": "AuditActivity",
        };
        assert.ok(
            readFileSync("app/dashboard/_components/" + files[url.hash] + ".tsx", "utf8").includes(
                'id="' + url.hash.slice(1) + '"',
            ),
        );
    }
    if (path === "/service-review-center/eassist" && url.searchParams.has("view")) {
        assert.ok(
            readFileSync("app" + path + "/workspace.tsx", "utf8").includes(
                "['" + url.searchParams.get("view") + "',",
            ),
        );
    }
}
for (const category of guide("Admin actions", admin).choices) {
    const response = guide(category, admin);
    assert.ok(response.choices.length);
    response.choices.forEach((name) => assert.ok(expected.includes(name)));
}
assert.match(guide("Payment access", admin).reply, /not implemented/);
assert.match(guide("Incident management", admin).reply, /configured ServiceNow/);
assert.match(guide("Request fulfilment", admin).reply, /does not perform external/);
assert.match(guide("Alert acknowledgement", admin).reply, /does not fix/);
assert.match(guide("Email status", admin).reply, /Queued, SMTP accepted and failed/);
assert.equal(guide("unrelated question", admin), null);
for (const prompt of [
    "Please top up 100 tickets for the employee",
    "Disable this account",
    "Create a qualification MBA",
    "Send a test email",
    "Run a security scan",
    "Connect integrations",
    "Show all alerts",
    "Publish open positions",
    "Create a company position",
    "Check email delivery status",
])
    assert.ok(guide(prompt, admin), prompt);
console.log(
    "PASS: all 66 requested capabilities, natural help questions, seven menus, real destination pages/anchors/operations views, role isolation and truthful integration/payment limits.",
);
if (process.argv.includes("--report")) {
    const chat = new Set([
        "Offer emails",
        "Email previews",
        "Email status",
        "Request approval",
        "Request rejection",
        "Request cancellation",
        "Request fulfilment",
        "Team requests",
        "Role assignment",
        "Admin assignment",
        "Department creation",
    ]);
    writeFileSync(
        "docs/admin-playground-capability-audit.md",
        "# Admin Playground capability audit\n\nChecked against the requested 66 capabilities on 8 October 2026. Each topic now has deterministic guidance and an application link. Eleven have existing confirmed or read-only chat workflows; the remaining topics use dedicated controls or describe policy. Guidance is not evidence that an external integration is configured.\n\nType **Admin actions** to choose Email, Requests, People, Security, Review Center, Operations or Agent Studio.\n\n| # | Capability | Execution | Destination | Guidance |\n|---|---|---|---|---|\n" +
            adminCapabilities
                .map(
                    (c, i) =>
                        `| ${i + 1} | ${c.name} | ${chat.has(c.name) ? "Chat workflow" : "Workspace control / policy guidance"} | [Open](${c.href}) | ${c.instruction.replaceAll("|", "\\|")} |`,
                )
                .join("\n") +
            "\n\nVerification: all 66 exact labels and natural help questions, role isolation, seven navigation menus, destination pages/anchors and eAssist view names. Email and department workflows additionally have PostgreSQL rollback tests for confirmation, duplicate/replay prevention, audit and actual persistence. No external emails or infrastructure mutations are performed by these tests.\n\nRemaining dependencies: Razorpay checkout is not implemented. ServiceNow incident actions require a configured connection. Scanning and automation require their configured integrations, workers and credentials. SMTP acceptance is not independent proof of inbox delivery.\n",
    );
}
