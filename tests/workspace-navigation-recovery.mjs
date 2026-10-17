import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./helpers/load-ts.mjs";

const recovery = load("lib/workspace-navigation-recovery.ts");
const values = new Map();
const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
};
assert.equal(recovery.claimNavigationRecovery(storage, "/dashboard", 1000), true);
assert.equal(recovery.claimNavigationRecovery(storage, "/dashboard", 2000), false);
assert.equal(recovery.claimNavigationRecovery(storage, "/dashboard", 301001), true);
assert.equal(
    recovery.claimNavigationRecovery(
        {
            getItem() {
                throw Error("Storage blocked");
            },
        },
        "/dashboard",
    ),
    false,
);
values.clear();
let effect;
const updates = [],
    timers = [],
    cancelled = [],
    navigations = [];
const original = {
    window: globalThis.window,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
};
try {
    globalThis.window = {
        sessionStorage: storage,
        location: {
            pathname: "/dashboard/settings",
            search: "?tab=security",
            replace: (target) => navigations.push(target),
        },
    };
    globalThis.setTimeout = (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
    };
    globalThis.clearTimeout = (id) => cancelled.push(id);
    const { default: Transition } = load("components/workspace-transition.tsx", {
        react: {
            ...React,
            useState: (initial) => [initial, (value) => updates.push(value)],
            useEffect: (callback) => {
                effect = callback;
            },
        },
        "@/lib/workspace-navigation-recovery": recovery,
    });
    const html = renderToStaticMarkup(
        React.createElement(Transition, { destination: "Agent Studio" }),
    );
    assert.match(html, /Opening Agent Studio/);
    const cleanup = effect();
    assert.deepEqual(
        timers.map((t) => t.delay),
        [10000, 30000],
    );
    timers[1].callback();
    assert.deepEqual(navigations, ["/dashboard/settings?tab=security"]);
    // A second stuck mount must stop rather than repeatedly reload.
    timers[1].callback();
    assert.equal(navigations.length, 1);
    assert.equal(updates.at(-1), true);
    cleanup();
    assert.deepEqual(cancelled, [1, 2]);
} finally {
    Object.assign(globalThis, original);
}
const prior = {
    NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID,
    RENDER_GIT_COMMIT: process.env.RENDER_GIT_COMMIT,
};
try {
    delete process.env.NEXT_DEPLOYMENT_ID;
    process.env.RENDER_GIT_COMMIT = "fixture-render-revision";
    assert.equal(load("next.config.ts").default.deploymentId, "fixture-render-revision");
} finally {
    for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}
console.log(
    "PASS: one bounded navigation reload, five-minute loop protection, blocked storage safety, intended path/query preservation, timer cleanup and Render deployment version protection.",
);
