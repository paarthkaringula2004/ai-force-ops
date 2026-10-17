import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./helpers/load-ts.mjs";
const all = (node, p) =>
    React.isValidElement(node)
        ? [
              ...(p(node) ? [node] : []),
              ...React.Children.toArray(node.props.children).flatMap((n) => all(n, p)),
          ]
        : [];
const prior = { document: globalThis.document, fetch: globalThis.fetch };
globalThis.document = { body: {} };
try {
    for (const scope of ["department", "all"]) {
        const states = [];
        let cursor = 0,
            payload;
        globalThis.fetch = async (_url, options) => {
            payload = JSON.parse(options.body);
            return { ok: true, json: async () => ({ shared: true }) };
        };
        const { AgentShareButton } = load("components/agent-sharing.tsx", {
            react: {
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
                useEffect() {},
                useRef: () => ({ current: null }),
            },
            "react-dom": { createPortal: (node) => node },
        });
        const render = (mode = "recipients") => {
            cursor = 0;
            return AgentShareButton({
                agent: { id: "fixture", name: "Test" },
                roles: [],
                recipientIds: [],
                shareMode: mode,
                recipientScope: scope,
                canShare: true,
                ownerName: "Owner",
                onSaved: async () => {},
            });
        };
        let tree = render();
        all(tree, (n) => n.props["aria-label"] === "Share Test")[0].props.onClick();
        tree = render();
        assert.equal(
            all(tree, (n) => n.type === "textarea").length,
            0,
            "IDs hidden until User checked",
        );
        assert.equal(
            all(tree, (n) => n.type === "input" && n.props.type === "checkbox").length,
            scope === "department" ? 3 : 4,
        );
        const boxes = all(tree, (n) => n.type === "input" && n.props.type === "checkbox");
        boxes[0].props.onChange({ target: { checked: true } });
        tree = render();
        assert.match(renderToStaticMarkup(tree), /Enter user ID/);
        assert.equal(all(tree, (n) => n.type === "textarea").length, 1);
        all(tree, (n) => n.type === "textarea")[0].props.onChange({
            target: { value: "friend_id,friend_id" },
        });
        tree = render();
        all(tree, (n) => n.type === "input" && n.props.type === "checkbox")[1].props.onChange({
            target: { checked: true },
        });
        tree = render();
        all(
            tree,
            (n) => n.type === "button" && React.Children.toArray(n.props.children).includes("Done"),
        )[0].props.onClick();
        await new Promise(setImmediate);
        assert.deepEqual(payload, { roles: ["user", "manager"], recipientIds: ["friend_id"] });
        all(tree, (n) => n.props["aria-label"] === "Share Test")[0].props.onClick();
        tree = render();
        all(tree, (n) => n.type === "input" && n.props.type === "checkbox")[0].props.onChange({
            target: { checked: true },
        });
        tree = render();
        all(tree, (n) => n.type === "textarea")[0].props.onChange({
            target: { value: "friend_id" },
        });
        tree = render();
        all(tree, (n) => n.type === "input" && n.props.type === "checkbox")[0].props.onChange({
            target: { checked: false },
        });
        tree = render();
        assert.equal(all(tree, (n) => n.type === "textarea").length, 0);
        const adminTree = render("roles");
        assert.equal(
            all(adminTree, (n) => n.type === "textarea").length,
            0,
            "Admin never requires User IDs",
        );
        assert.equal(
            all(adminTree, (n) => n.type === "input" && n.props.type === "checkbox").length,
            4,
        );
        const userTree = render("copy");
        assert.equal(typeof userTree.type, "function");
        assert.equal(
            userTree.type.name,
            "UserAgentCopyButton",
            "User must get its separate copy dialog",
        );
    }
    console.log(
        "PASS: Manager/Employee role checkboxes restored, User selection alone reveals ID input, unchecking hides it; Employee has no Admin option; User gets only copy dialog.",
    );
} finally {
    Object.assign(globalThis, prior);
}
