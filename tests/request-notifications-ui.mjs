import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./helpers/load-ts.mjs";
const before = {
    window: globalThis.window,
    document: globalThis.document,
    EventSource: globalThis.EventSource,
    fetch: globalThis.fetch,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
};
let effect,
    cleanup,
    source,
    cursor = 0,
    refCursor = 0,
    events = 0;
const states = [],
    refs = [],
    paths = [],
    posts = [];
const first = {
    id: "11111111-1111-4111-8111-111111111111",
    requestNumber: "REQ-FIRST",
    kind: "ticket_topup",
    senderName: "Synthetic Manager",
    createdAt: "2026-10-16T07:00:00Z",
};
const initial = { notifications: [first], unreadCount: 1, revision: "initial", cursor: "1" };
class Source {
    static OPEN = 1;
    readyState = 1;
    listeners = new Map();
    closed = false;
    constructor() {
        source = this;
    }
    addEventListener(name, callback) {
        this.listeners.set(name, callback);
    }
    emit(name, value) {
        this.listeners.get(name)?.({ data: JSON.stringify(value) });
    }
    close() {
        this.closed = true;
    }
}
globalThis.EventSource = Source;
globalThis.window = {
    dispatchEvent() {
        events++;
    },
    addEventListener() {},
    removeEventListener() {},
};
globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.fetch = async (_url, options) => {
    if (options?.method === "POST") {
        posts.push(JSON.parse(options.body));
        return { ok: true };
    }
    return { ok: true, status: 200, json: async () => initial };
};
const { WorkspaceRequestNotifications: View } = load(
    "app/dashboard/_components/RequestNotifications.tsx",
    {
        react: {
            ...React,
            useEffect(fn) {
                effect = fn;
            },
            useState(initial) {
                const i = cursor++;
                if (!(i in states)) states[i] = initial;
                return [
                    states[i],
                    (value) => {
                        states[i] = typeof value === "function" ? value(states[i]) : value;
                    },
                ];
            },
            useRef(initial) {
                const i = refCursor++;
                return (refs[i] ??= { current: initial });
            },
        },
        "next/navigation": { useRouter: () => ({ push: (path) => paths.push(path) }) },
    },
);
const all = (node, p) =>
    React.isValidElement(node)
        ? [
              ...(p(node) ? [node] : []),
              ...React.Children.toArray(node.props.children).flatMap((n) => all(n, p)),
          ]
        : [];
const render = () => {
    cursor = 0;
    refCursor = 0;
    return View({ userId: "fixture-reviewer" });
};
try {
    assert.equal(render(), null);
    cleanup = effect();
    await new Promise(setImmediate);
    let tree = render(),
        html = renderToStaticMarkup(tree);
    assert.match(html, /Synthetic Manager/);
    assert.match(html, /Ticket top-up/);
    assert.match(html, /top-24/);
    assert.doesNotMatch(html, /Approve|Reject/);
    const second = {
        ...first,
        id: "22222222-2222-4222-8222-222222222222",
        requestNumber: "REQ-SECOND",
    };
    source.emit("requests", {
        notifications: [first, second],
        unreadCount: 2,
        revision: "next",
        cursor: "2",
    });
    tree = render();
    assert.match(renderToStaticMarkup(tree), /1 more unread/);
    all(
        tree,
        (n) =>
            n.type === "button" &&
            React.Children.toArray(n.props.children).includes("Review request"),
    )[0].props.onClick();
    await new Promise(setImmediate);
    assert.deepEqual(posts, [{ id: first.id }]);
    assert.deepEqual(paths, [`/dashboard/team-requests?request=${first.id}`]);
    source.emit("requests", {
        notifications: [first, second],
        unreadCount: 2,
        revision: "stale-dismissal",
        cursor: "3",
    });
    tree = render();
    html = renderToStaticMarkup(tree);
    assert.doesNotMatch(html, /REQ-FIRST/);
    assert.match(html, /REQ-SECOND/);
    source.emit("revoked", {});
    source.emit("requests", {
        notifications: [first],
        unreadCount: 1,
        revision: "late",
        cursor: "4",
    });
    assert.equal(render(), null, "late authorized responses cannot revive revoked notifications");
    assert.equal(source.closed, true);
    assert.ok(events >= 2);
    cleanup();
    console.log(
        "PASS: login catch-up, pushed queue updates, review navigation, persistent-dismiss request only, no approvals, no stale alert resurrection after dismissal/revocation, cleanup and separation from meeting toast.",
    );
} finally {
    Object.assign(globalThis, before);
}
