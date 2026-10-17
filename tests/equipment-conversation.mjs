import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { load } from "./helpers/load-ts.mjs";
const allocation = load("lib/equipment-allocation.ts");
for (const input of [
    "As mine is broken - its new one",
    "Mine was crushed by a car and cannot be repaired",
    "Can I get a replacement?",
])
    assert.equal(allocation.equipmentAllocation(input), "Replacement");
assert.equal(allocation.equipmentAllocation("New allocation"), "New allocation");
assert.equal(allocation.equipmentAllocation("My first company laptop"), "New allocation");
assert.equal(allocation.equipmentAllocation("I need an upgrade"), "Upgrade");
for (const input of [
    "My laptop is not broken",
    "replacement or new allocation",
    "What is a replacement?",
    "I do not want a replacement",
    "its a new one",
])
    assert.equal(allocation.equipmentAllocation(input), null);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    c = await pool.connect();
const db = {
    query: (...args) => c.query(...args),
    connect: async () => ({
        query: (sql, args) =>
            c.query(
                sql === "BEGIN"
                    ? "SAVEPOINT equipment_test"
                    : sql === "COMMIT"
                      ? "RELEASE SAVEPOINT equipment_test"
                      : sql === "ROLLBACK"
                        ? "ROLLBACK TO SAVEPOINT equipment_test"
                        : sql,
                args,
            ),
        release() {},
    }),
};
let providerCalls = 0;
const deps = {
    "./db": { db },
    "@/lib/db": { db },
    "./leave-conversation": { leaveConversation: async () => null },
    "./organization-security": { organizationWriteAllowed: async () => {} },
    "./mail-events": { queueLeaveEvent: async () => {} },
    "./conversation-ai": {
        conversationResponse: async () => {
            providerCalls++;
            throw Error("Unavailable fixture provider");
        },
    },
};
const employee = load("lib/employee-playground.ts", deps),
    ai = load("lib/employee-service-ai.ts", deps),
    oldKey = process.env.OPENAI_API_KEY;
try {
    await c.query("BEGIN");
    for (const role of ["manager", "employee"]) {
        const user = randomUUID();
        await c.query(
            'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
            [user, "Equipment fixture", user + "@example.invalid"],
        );
        await c.query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [user, role]);
        const member = (await c.query("SELECT * FROM workspace_members WHERE user_id=$1", [user]))
                .rows[0],
            ask = (input) => employee.employeeReply(user, "Fixture", input, member);
        await ask("Request a laptop");
        process.env.OPENAI_API_KEY = "fixture-not-a-real-provider-key";
        const answer = await ai.employeeServiceAiReply(user, "Fixture", member, "", [
            { role: "user", content: "As mine is broken - its new one" },
        ]);
        assert.match(answer.reply, /replacement for your damaged laptop/);
        assert.match(answer.reply, /What do you need/);
        assert.doesNotMatch(answer.reply, /Is this a replacement/);
        assert.equal(providerCalls, 0);
        let saved = (
            await c.query("SELECT draft FROM employee_playground_drafts WHERE user_id=$1", [user])
        ).rows[0].draft;
        assert.equal(saved.fields.allocation, "Replacement");
        assert.equal(saved.fields.reason, "As mine is broken - its new one");
        delete process.env.OPENAI_API_KEY;
        await ask("High-performance workstation");
        const review = await ask("Yes Include mouse and bag");
        assert.match(review.reply, /Review your equipment request/);
        assert.match(review.reply, /mouse and bag/);
        assert.match(review.reply, /As mine is broken/);
        assert.doesNotMatch(review.reply, /leave|calendar|reporting manager/i);
        assert.equal(
            (await c.query("SELECT 1 FROM employee_service_requests WHERE user_id=$1", [user]))
                .rowCount,
            0,
        );
        const submitted = await ask("Submit request");
        assert.match(submitted.reply, /Equipment request submitted/);
        assert.match(submitted.reply, /Admin for review/);
        assert.doesNotMatch(submitted.reply, /leave|calendar|assign your reporting manager/i);
        await ask("Submit request");
        assert.equal(
            (await c.query("SELECT 1 FROM employee_service_requests WHERE user_id=$1", [user]))
                .rowCount,
            1,
        );
        await ask("Request a laptop");
        await ask("As mine is broken - its new one");
        const corrected = await ask("Actually new allocation");
        assert.match(corrected.reply, /updated to new allocation/);
        assert.match(corrected.reply, /What do you need/);
        saved = (
            await c.query("SELECT draft FROM employee_playground_drafts WHERE user_id=$1", [user])
        ).rows[0].draft;
        assert.equal(saved.fields.allocation, "New allocation");
        assert.equal(saved.fields.requirements, undefined);
        await ask("Cancel request");
        await ask("Request a laptop");
        const ambiguous = await ask("its a new one");
        assert.match(ambiguous.reply, /replacement replaces a laptop/i);
        await ask("New allocation");
        await ask("High-performance workstation");
        await ask("Yes Include mouse and bag");
        const originalReview = await ask("Broken / Crushed by CAR - Cant be repaired");
        assert.match(
            originalReview.reply,
            /Allocation:\*\* New allocation/,
            "explicit category must not be overwritten by later damage details",
        );
        assert.match(originalReview.reply, /Crushed by CAR/);
        assert.doesNotMatch(originalReview.reply, /leave|calendar/i);
        const current = (
            await c.query(
                "SELECT draft,updated_at::text AS version FROM employee_playground_drafts WHERE user_id=$1",
                [user],
            )
        ).rows[0];
        const guarded = await employee.employeeReply(
            user,
            "Fixture",
            "Mine was crushed by a car",
            member,
            undefined,
            {
                expectedDraftId: current.draft.id,
                expectedVersion: current.version,
                intent: {
                    mode: "collect",
                    kind: "equipment",
                    fields: [
                        { key: "allocation", value: "Replacement" },
                        { key: "reason", value: "Mine was crushed by a car" },
                    ],
                    reply: "",
                },
            },
        );
        assert.match(
            guarded.reply,
            /Allocation:\*\* New allocation/,
            "model-inferred category must not overwrite an explicit choice",
        );
        await ask("Cancel request");
        await ask("Request a laptop");
        await ask("New allocation");
        await ask("High-performance workstation");
        await ask("No accessories needed");
        const working = await ask("I need a laptop because mine is not working");
        assert.match(working.reply, /Review your equipment/);
        assert.doesNotMatch(working.reply, /another|saved.*request|category/i);
    }
    console.log(
        "PASS: Manager and Employee exact damaged-laptop paraphrase advances, retains reason/accessories, supports explicit corrections and choices, clarifies ambiguity, omits unrelated boilerplate, confirms before submitting and prevents replay. No model/mail calls; fixtures rolled back.",
    );
} finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
}
