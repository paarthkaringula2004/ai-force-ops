import assert from "node:assert/strict";
import { load } from "./helpers/load-ts.mjs";
const { InputError } = load("lib/eassist/transport.ts");
let signedIn = true,
    allowed = true,
    notify,
    unsubscribed = 0,
    snapshot = { notifications: [], unreadCount: 0, revision: null, cursor: "1" };
const route = load("app/api/workspace/request-notifications/route.ts", {
    "@/lib/request-session": {
        getRequestSession: async () => (signedIn ? { user: { id: "reviewer" } } : null),
    },
    "@/lib/request-notifications": {
        requestNotificationSnapshot: async () => {
            if (!allowed) throw new InputError("Forbidden", 403);
            return snapshot;
        },
        dismissRequestNotification: async () => {},
    },
    "@/lib/request-notification-events": {
        subscribeRequestChanges: (callback) => {
            notify = callback;
            return {
                ready: Promise.resolve(),
                unsubscribe() {
                    unsubscribed++;
                },
            };
        },
    },
    "@/lib/eassist/transport": { InputError, boundedJson: (r) => r.json() },
    "@/lib/service-review/ingestion": {
        requireSameOrigin: (request) => {
            if (request.headers.get("origin") !== "http://localhost")
                throw new InputError("Invalid origin", 403);
        },
    },
});
const request = () => new Request("http://localhost/api/workspace/request-notifications?stream=1");
signedIn = false;
assert.equal((await route.GET(request())).status, 401);
signedIn = true;
allowed = false;
assert.equal((await route.GET(request())).status, 403);
allowed = true;
const response = await route.GET(request());
assert.equal(response.headers.get("content-type"), "text/event-stream");
assert.match(response.headers.get("cache-control"), /no-store/);
const reader = response.body.getReader(),
    decode = (value) => new TextDecoder().decode(value);
assert.match(decode((await reader.read()).value), /event: requests/);
await new Promise(setImmediate);
snapshot = {
    notifications: [{ id: "new-request" }],
    unreadCount: 1,
    revision: "updated",
    cursor: "2",
};
notify();
await new Promise(setImmediate);
assert.match(
    decode((await reader.read()).value),
    /new-request/,
    "DB event must push the new request without page reload",
);
allowed = false;
notify();
await new Promise(setImmediate);
assert.match(decode((await reader.read()).value), /event: revoked/);
assert.equal((await reader.read()).done, true);
assert.equal(unsubscribed, 1);
allowed = true;
const second = await route.GET(request());
await second.body.cancel();
assert.equal(unsubscribed, 2, "cancel must release listeners and timers");
assert.equal(
    (
        await route.POST(
            new Request("http://localhost/api/workspace/request-notifications", {
                method: "POST",
                headers: { origin: "https://foreign.invalid" },
                body: "{}",
            }),
        )
    ).status,
    403,
);
console.log(
    "PASS: authorized initial snapshot, pushed updates, live permission revocation, stream cancellation cleanup, no-store headers, authentication and cross-origin checks.",
);
