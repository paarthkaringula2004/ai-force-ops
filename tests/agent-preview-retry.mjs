import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the actual submit handler with a rejected request followed by retries.
const file = ts.createSourceFile(
    "preview.tsx",
    readFileSync("app/agent-builder/[agentId]/preview/page.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
);
let handler;
function find(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "sendMessage")
        handler = node.getText(file);
    ts.forEachChild(node, find);
}
find(file);
assert.ok(handler);
const code = ts.transpileModule(handler, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const state = {
    messages: [
        { role: "user", content: "Old greeting" },
        { role: "assistant", content: "" },
    ],
    input: "Hello",
    sending: false,
    error: "",
};
const requests = [];
let calls = 0;
const submit = new Function(
    "state",
    "fetch",
    `
 const agent={id:'fixture'},agentId='fixture',previewModel='gpt-4.1-mini',previewInstructions='',previewContext='',previewOutput='Text',previewSchema='',includeChatHistory=true;
 let messages,input,sending;
 const setMessages=value=>{state.messages=typeof value==='function'?value(state.messages):value;};
 const setInput=value=>{state.input=value;}; const setChatError=value=>{state.error=value;}; const setSending=value=>{state.sending=value;}; const setTrace=()=>{};const setApprovals=()=>{};
 ${code}
 return async()=>{messages=state.messages;input=state.input;sending=state.sending;await sendMessage({preventDefault(){}});};
`,
)(state, async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    assert.ok(payload.messages.every((m) => m.content.trim()));
    if (++calls === 1)
        return { ok: false, json: async () => ({ error: "Legacy workflow cannot execute" }) };
    return {
        ok: true,
        json: async () => ({ reply: "Hello from the configured agent", charts: [] }),
    };
});
await submit();
assert.equal(state.input, "Hello");
assert.equal(state.error, "Legacy workflow cannot execute");
assert.equal(state.sending, false);
assert.deepEqual(state.messages, [{ role: "user", content: "Old greeting" }]);
await submit();
assert.equal(state.error, "");
assert.equal(state.messages.at(-1).content, "Hello from the configured agent");
state.input = "Hi again";
await submit();
assert.equal(requests[2].messages.at(-1).content, "Hi again");
assert.equal(requests[2].messages.filter((m) => m.role === "assistant").length, 1);
console.log(
    "PASS: failed preview removes empty placeholders, restores input, cleans existing blank history, retries successfully and retains completed conversation. No provider calls.",
);
