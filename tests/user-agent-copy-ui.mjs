import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./helpers/load-ts.mjs";
const states = [],
    refs = [];
let cursor = 0,
    refCursor = 0,
    fail = true;
const requests = [];
const prior = { document: globalThis.document, fetch: globalThis.fetch };
globalThis.document = { body: {} };
globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (fail) throw new Error("Network interrupted");
    return { ok: true, json: async () => ({ copies: [] }) };
};
const hooks = {
    ...React,
    useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [
            states[i],
            (v) => {
                states[i] = typeof v === "function" ? v(states[i]) : v;
            },
        ];
    },
    useRef(initial) {
        const i = refCursor++;
        return (refs[i] ??= { current: initial });
    },
    useEffect() {},
};
const { UserAgentCopyButton } = load("components/user-agent-copy.tsx", {
    react: hooks,
    "react-dom": { createPortal: (node) => node },
});
const all = (node, p) =>
    !React.isValidElement(node)
        ? []
        : [
              ...(p(node) ? [node] : []),
              ...React.Children.toArray(node.props.children).flatMap((n) => all(n, p)),
          ];
const render = () => {
    cursor = 0;
    refCursor = 0;
    return UserAgentCopyButton({ agent: { id: "fixture", name: "Test" }, onSaved: async () => {} });
};
try {
    let tree = render();
    all(
        tree,
        (n) => n.type === "button" && n.props["aria-label"] === "Share Test",
    )[0].props.onClick();
    tree = render();
    const html = renderToStaticMarkup(tree);
    assert.match(html, /Recipient user_ids/);
    assert.match(html, /Sent copies cannot be revoked/);
    assert.match(html, /API credentials are blank/);
    assert.doesNotMatch(html, /type="checkbox"/);
    all(tree, (n) => n.type === "textarea")[0].props.onChange({
        target: { value: "friend_id,friend2_id\nfriend_id" },
    });
    tree = render();
    const send = (t) =>
        all(
            t,
            (n) =>
                n.type === "button" &&
                React.Children.toArray(n.props.children).includes("Send editable copy"),
        )[0].props.onClick();
    send(tree);
    await new Promise(setImmediate);
    tree = render();
    assert.ok(all(tree, (n) => n.props.role === "alert").length);
    fail = false;
    send(tree);
    await new Promise(setImmediate);
    tree = render();
    assert.equal(requests[0].body.requestId, requests[1].body.requestId);
    assert.deepEqual(requests[1].body.recipientIds, ["friend_id", "friend2_id"]);
    assert.match(renderToStaticMarkup(tree), /Copy delivered/);
    console.log(
        "PASS: User dialog accepts selected IDs, explains independent ownership and credential removal, deduplicates IDs and preserves request ID through network retry.",
    );
} finally {
    Object.assign(globalThis, prior);
}
