import assert from "node:assert/strict";
import { load } from "./helpers/load-ts.mjs";

for (const [provider, parameter, cookieName, finishName, moduleName] of [
    ["google-meet", "google", "aiforce-google-meet-state", "finishGoogleMeetSignIn", "google-meet"],
    ["teams", "teams", "aiforce-teams-state", "finishTeamsSignIn", "teams-meetings"],
]) {
    let session = { user: { id: "fixture-user" } },
        calls = 0,
        fail = false;
    const { GET } = load(`app/api/${provider}/callback/route.ts`, {
        "@/lib/request-session": { getRequestSession: async () => session },
        [`@/lib/${moduleName}`]: {
            [finishName]: async (user, state, code) => {
                calls++;
                assert.equal(user, "fixture-user");
                assert.equal(state, "fixture-state");
                assert.equal(code, "fixture-code");
                if (fail) throw Error("Provider rejected code");
            },
        },
    });
    const request = (query = "", cookie = "") =>
        new Request(`http://localhost:10000/api/${provider}/callback${query}`, {
            headers: {
                cookie,
                "x-forwarded-host": "untrusted.example",
                "x-forwarded-proto": "https",
            },
        });
    function check(response, status) {
        assert.equal(response.status, 303);
        const location = response.headers.get("location");
        assert.equal(location, `/dashboard/meeting-rooms?mode=virtual&${parameter}=${status}`);
        assert.equal(
            new URL(location, "https://ai-force-ops.onrender.com").origin,
            "https://ai-force-ops.onrender.com",
        );
        assert.ok(response.headers.get("set-cookie").includes("Max-Age=0"));
        assert.equal(response.headers.get("cache-control"), "no-store");
    }
    check(await GET(request()), "failed");
    assert.equal(calls, 0, "opening callback directly must not exchange an OAuth code");
    check(
        await GET(request("?state=fixture-state&code=fixture-code", `${cookieName}=wrong-state`)),
        "failed",
    );
    assert.equal(calls, 0);
    check(await GET(request("?error=access_denied")), "cancelled");
    assert.equal(calls, 0);
    check(
        await GET(request("?state=fixture-state&code=fixture-code", `${cookieName}=fixture-state`)),
        "connected",
    );
    assert.equal(calls, 1);
    fail = true;
    check(
        await GET(request("?state=fixture-state&code=fixture-code", `${cookieName}=fixture-state`)),
        "failed",
    );
    assert.equal(calls, 2);
    session = null;
    check(
        await GET(request("?state=fixture-state&code=fixture-code", `${cookieName}=fixture-state`)),
        "failed",
    );
    assert.equal(calls, 2);
}
console.log(
    "PASS: Google Meet and Teams success/cancellation/failure stay on the public origin behind Render; direct visits, missing sessions and state mismatches cannot exchange codes. No Google/Microsoft requests made.",
);
