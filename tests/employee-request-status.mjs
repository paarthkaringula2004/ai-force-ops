import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.WORKSPACE_TEST_URL || "http://localhost:3000",
    users = [];
import { load } from "./helpers/load-ts.mjs";
let actor;
const deps = {
    "@/lib/db": { db },
    "./db": { db },
    "@/config/Arcjet": { protectOpenAiRequest: async () => null },
    "@/lib/request-session": {
        getRequestSession: async () =>
            actor ? { user: { id: actor.id, name: actor.name } } : null,
    },
    "./mail-events": { queueLeaveEvent: async () => {} },
    "@/lib/conversation-ai": {
        conversationResponse: async (_, options) => ({
            text: JSON.parse(options.input).verifiedReading,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
    },
};
const routes = {
    "/api/playground": load("app/api/playground/route.ts", deps),
    "/api/workspace/requests": load("app/api/workspace/requests/route.ts", deps),
};
async function account(name) {
    const id = randomUUID();
    users.push(id);
    await db.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [id, name, id + "@example.invalid"],
    );
    await db.query("UPDATE workspace_members SET role='employee' WHERE user_id=$1", [id]);
    return { id, name };
}
async function call(who, path, body, method = "POST") {
    actor = who;
    const response = await routes[path][method](
        new Request(base + path, {
            method,
            headers: { Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
}

const ask = (who, text) =>
    call(who, "/api/playground", {
        model: "",
        messages: [
            { role: "user", content: "Apply for leave" },
            { role: "assistant", content: "Your leave request is Pending approval." },
            { role: "user", content: text },
        ],
    });
async function seed(owner, kind = "leave") {
    const id = randomUUID(),
        number = "REQ-" + id.replaceAll("-", "").slice(0, 12).toUpperCase();
    await db.query(
        "INSERT INTO employee_service_requests(id,user_id,request_number,kind,details) VALUES($1,$2,$3,$4,$5::jsonb)",
        [
            id,
            owner.id,
            number,
            kind,
            JSON.stringify({ dates: "12 November 2026, full day", reason: "Test request" }),
        ],
    );
    return { id, number };
}
try {
    const employee = await account("Status test employee"),
        manager = await account("Status test Manager"),
        other = await account("Status test unrelated employee");
    await db.query("UPDATE workspace_members SET role='manager' WHERE user_id=$1", [manager.id]);
    await db.query("UPDATE workspace_members SET role='employee',manager_id=$2 WHERE user_id=$1", [
        employee.id,
        manager.id,
    ]);
    await db.query("UPDATE workspace_members SET role='employee' WHERE user_id=$1", [other.id]);
    const leave = await seed(employee);
    assert.match((await ask(employee, "is my holiday approved ?")).reply, /pending approval/);
    await call(
        manager,
        "/api/workspace/requests",
        { id: leave.id, action: "approve", note: "Coverage confirmed" },
        "PATCH",
    );
    for (const question of [
        "is my holiday approved ?",
        "Who approved my leave?",
        "What is my leave status?",
        "Did my manager approve my vacation?",
        leave.number,
    ]) {
        const reply = await ask(employee, question);
        assert.equal(reply.responseMode, "employee");
        assert.equal(reply.usage.totalTokens, 0);
        assert.match(
            reply.reply,
            /Yes, your leave request is \*\*approved\*\* by \*\*Status test Manager\*\*/,
        );
        assert.match(reply.reply, /Coverage confirmed/);
        assert.match(reply.reply, /12 November 2026/);
        assert.doesNotMatch(reply.reply, /Pending approval/);
    }
    assert.match(
        (await ask(other, "is my holiday approved?")).reply,
        /no submitted leave requests/,
    );
    assert.match((await ask(other, leave.number)).reply, /couldn't find/);
    await ask(employee, "Refer a candidate");
    await ask(employee, "is my holiday approved?");
    assert.deepEqual(
        (
            await db.query("SELECT draft FROM employee_playground_drafts WHERE user_id=$1", [
                employee.id,
            ])
        ).rows[0].draft.fields,
        {},
    );
    await seed(employee);
    const multiple = await ask(employee, "is my holiday approved?");
    assert.match(multiple.reply, /multiple leave requests/);
    assert.equal(multiple.choices.length, 2);
    assert.match(multiple.reply, /Approved/);
    assert.match(multiple.reply, /Pending approval/);
    assert.match((await ask(employee, leave.number)).reply, /\*\*approved\*\*/);
    const referral = await seed(employee, "referral");
    await call(
        manager,
        "/api/workspace/requests",
        { id: referral.id, action: "reject", note: "Opening closed" },
        "PATCH",
    );
    assert.match(
        (await ask(employee, "is my referral approved?")).reply,
        /\*\*rejected\*\* by \*\*Status test Manager\*\*/,
    );
    assert.match((await ask(employee, "is my referral approved?")).reply, /Opening closed/);
    const equipment = await seed(employee, "equipment");
    await call(
        employee,
        "/api/workspace/requests",
        { id: equipment.id, action: "cancel", note: "" },
        "PATCH",
    );
    assert.match((await ask(employee, "what is my laptop status?")).reply, /\*\*cancelled\*\*/);
    console.log(
        "PASS: real handler/database status after manager approval despite stale history; approver, decision notes, dates, owner isolation, draft preservation, ambiguity, rejection and cancellation.",
    );
} finally {
    await db.query(
        "DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])",
        [users],
    );
    for (const id of users) await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    await db.end();
}
