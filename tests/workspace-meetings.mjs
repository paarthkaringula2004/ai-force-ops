import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import ts from "typescript";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
    const m = { exports: {} };
    new Function(
        "require",
        "module",
        "exports",
        ts.transpileModule(readFileSync(path, "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                esModuleInterop: true,
            },
        }).outputText,
    )((name) => (name in deps ? deps[name] : require(name)), m, m.exports);
    return m.exports;
}
class InputError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
const control = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
    }),
    schema = "teams_test_" + randomUUID().replaceAll("-", "");
let pool;
const originalFetch = globalThis.fetch,
    env = Object.fromEntries(
        ["TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET", "TEAMS_TENANT_ID", "TEAMS_REDIRECT_URI"].map(
            (key) => [key, process.env[key]],
        ),
    );
const ids = {
    admin: randomUUID(),
    manager: randomUUID(),
    employee: randomUUID(),
    user: randomUUID(),
    otherEmployee: randomUUID(),
    otherManager: randomUUID(),
    otherAdmin: randomUUID(),
    inactive: randomUUID(),
};
const fixtures = Object.entries(ids).map(([label, id]) => ({
    id,
    name: `Fixture ${label}`,
    role: label.toLowerCase().includes("admin")
        ? "admin"
        : label.toLowerCase().includes("manager")
          ? "manager"
          : label === "user"
            ? "user"
            : "employee",
    active: label !== "inactive",
    department: label.startsWith("other") ? "Branch B" : "Branch A",
}));
const permissions = load("lib/workspace-permissions.ts"),
    secrets = load("lib/agent-secrets.ts");
let creates = 0,
    cancels = 0,
    failNext = false,
    renewals = 0;
const providerMeetings = new Map();
try {
    await control.query(`CREATE SCHEMA ${schema}`);
    await control.query(
        `CREATE TABLE ${schema}."user"(id text PRIMARY KEY,name text); CREATE TABLE ${schema}.workspace_members(user_id text PRIMARY KEY,role text,active boolean,department text)`,
    );
    for (const table of [
        "meeting_rooms",
        "meeting_room_bookings",
        "meeting_room_previews",
        "teams_user_connections",
        "teams_oauth_states",
        "teams_app_settings",
        "google_meet_app_settings",
        "google_meet_user_connections",
        "google_meet_oauth_states",
        "workspace_virtual_meetings",
        "workspace_meeting_invites",
    ])
        await control.query(`CREATE TABLE ${schema}.${table}(LIKE public.${table} INCLUDING ALL)`);
    pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
        max: 8,
        options: `-c search_path=${schema},public`,
    });
    for (const person of fixtures) {
        await pool.query('INSERT INTO "user"(id,name) VALUES($1,$2)', [person.id, person.name]);
        await pool.query(
            "INSERT INTO workspace_members(user_id,role,active,department) VALUES($1,$2,$3,$4)",
            [person.id, person.role, person.active, person.department],
        );
    }
    const access = {
        workspaceAccess: async (id) =>
            (
                await pool.query(
                    "SELECT user_id,role,active,department FROM workspace_members WHERE user_id=$1",
                    [id],
                )
            ).rows[0] || { role: "user", active: false },
    };
    const deps = {
        "./db": { db: pool },
        "./workspace-access": access,
        "./workspace-permissions": permissions,
        "./eassist/transport": { InputError },
    };
    const rooms = load("lib/meeting-rooms.ts", deps),
        teams = load("lib/teams-meetings.ts", { ...deps, "./agent-secrets": secrets }),
        google = load("lib/google-meet.ts", { ...deps, "./agent-secrets": secrets }),
        meetings = load("lib/workspace-meetings.ts", {
            ...deps,
            "./meeting-expiry": load("lib/meeting-expiry.ts"),
            "./meeting-rooms": rooms,
            "./teams-meetings": teams,
            "./google-meet": google,
        });
    for (const key of Object.keys(env)) delete process.env[key];
    assert.equal((await teams.teamsConnectionStatus(ids.employee)).configured, false);
    await assert.rejects(
        () => meetings.scheduleVirtualMeeting(ids.employee, { provider: "teams" }),
        (e) => e.status === 503,
    );
    assert.equal(
        (await pool.query("SELECT count(*) FROM workspace_virtual_meetings")).rows[0].count,
        "0",
    );
    const settings = {
        tenantId: randomUUID(),
        clientId: randomUUID(),
        clientSecret: "isolated-secret-value",
    };
    await assert.rejects(
        () => teams.configureTeamsApp(ids.manager, settings),
        (e) => e.status === 403,
    );
    await teams.configureTeamsApp(ids.admin, settings);
    assert.equal((await teams.teamsConnectionStatus(ids.admin)).configured, true);
    assert.equal((await teams.teamsConnectionStatus(ids.user)).setup, null);
    assert.equal(
        JSON.stringify(await teams.teamsConnectionStatus(ids.admin)).includes(
            settings.clientSecret,
        ),
        false,
    );
    const encryptedSettings = (await pool.query("SELECT client_secret FROM teams_app_settings"))
        .rows[0].client_secret;
    assert.notEqual(encryptedSettings, settings.clientSecret);
    assert.equal(secrets.decryptAgentApiKey(encryptedSettings), settings.clientSecret);
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        if (url.startsWith("https://login.microsoftonline.com/") && url.endsWith("/token")) {
            const body = new URLSearchParams(init.body);
            assert.equal(body.get("client_secret"), settings.clientSecret);
            let actor;
            if (body.get("grant_type") === "authorization_code") {
                actor = body.get("code").slice(5);
                assert.ok(body.get("code_verifier").length >= 43);
            } else {
                actor = body.get("refresh_token").slice("refresh-".length);
                renewals++;
            }
            return Response.json({
                access_token: `access-${actor}`,
                refresh_token: `refresh-${actor}`,
                expires_in: 3600,
                scope: "User.Read OnlineMeetings.ReadWrite",
            });
        }
        assert.ok(
            url.startsWith("https://graph.microsoft.com/v1.0/"),
            "No real provider/network request permitted in this test",
        );
        const actor = init.headers.Authorization.slice("Bearer access-".length);
        if (url.includes("/me?$select"))
            return Response.json({
                id: `microsoft-${actor}`,
                displayName: "Test Microsoft account",
                mail: "fixture@example.invalid",
            });
        if (init.method === "DELETE") {
            cancels++;
            return new Response(null, { status: 204 });
        }
        assert.equal(url, "https://graph.microsoft.com/v1.0/me/onlineMeetings/createOrGet");
        assert.equal(init.redirect, "error");
        creates++;
        if (failNext) {
            failNext = false;
            return Response.json({ error: "fixture failure" }, { status: 503 });
        }
        const body = JSON.parse(init.body),
            key = `${actor}:${body.externalId}`;
        if (!providerMeetings.has(key))
            providerMeetings.set(key, {
                id: `provider-${providerMeetings.size}`,
                joinWebUrl: `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent(body.externalId)}`,
                joinMeetingIdSettings: { joinMeetingId: "123456789", passcode: "fixture-passcode" },
            });
        return Response.json(providerMeetings.get(key));
    };
    const oauth = await teams.beginTeamsSignIn(ids.employee),
        authUrl = new URL(oauth.url);
    assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authUrl.searchParams.get("response_type"), "code");
    assert.ok(authUrl.searchParams.get("scope").includes("OnlineMeetings.ReadWrite"));
    const stateHash = createHash("sha256").update(oauth.state).digest("base64url"),
        storedState = (
            await pool.query("SELECT * FROM teams_oauth_states WHERE state_hash=$1", [stateHash])
        ).rows[0];
    assert.equal(
        authUrl.searchParams.get("code_challenge"),
        createHash("sha256")
            .update(secrets.decryptAgentApiKey(storedState.verifier))
            .digest("base64url"),
    );
    await assert.rejects(
        () => teams.finishTeamsSignIn(ids.user, oauth.state, `code:${ids.employee}`),
        (e) => e.status === 409,
    );
    await teams.finishTeamsSignIn(ids.employee, oauth.state, `code:${ids.employee}`);
    await assert.rejects(
        () => teams.finishTeamsSignIn(ids.employee, oauth.state, `code:${ids.employee}`),
        (e) => e.status === 409,
    );
    const connection = (
        await pool.query("SELECT * FROM teams_user_connections WHERE user_id=$1", [ids.employee])
    ).rows[0];
    assert.notEqual(connection.access_token, `access-${ids.employee}`);
    assert.equal(secrets.decryptAgentApiKey(connection.refresh_token), `refresh-${ids.employee}`);
    assert.equal((await teams.teamsConnectionStatus(ids.user)).connected, false);
    assert.equal((await teams.teamsConnectionStatus(ids.employee)).connected, true);
    assert.equal(
        JSON.stringify(await teams.teamsConnectionStatus(ids.employee)).includes("access_token"),
        false,
    );
    const expired = await teams.beginTeamsSignIn(ids.employee);
    await pool.query("UPDATE teams_oauth_states SET expires_at=now()-interval '1 minute'");
    await assert.rejects(
        () => teams.finishTeamsSignIn(ids.employee, expired.state, `code:${ids.employee}`),
        (e) => e.status === 409,
    );
    await assert.rejects(
        () => teams.beginTeamsSignIn(ids.inactive),
        (e) => e.status === 403,
    );
    for (const id of [ids.admin, ids.manager, ids.user]) {
        const signIn = await teams.beginTeamsSignIn(id);
        await teams.finishTeamsSignIn(id, signIn.state, `code:${id}`);
    }
    assert.throws(
        () => teams.verifiedTeamsUrl("https://teams.microsoft.com.attacker.invalid/meet"),
        (e) => e.status === 502,
    );
    assert.throws(
        () => teams.verifiedTeamsUrl("javascript:alert(1)"),
        (e) => e.status === 502,
    );
    assert.throws(
        () => teams.verifiedTeamsUrl("https://u:p@teams.microsoft.com/a"),
        (e) => e.status === 502,
    );
    const start = new Date(Date.now() + 86400000).toISOString(),
        end = new Date(Date.now() + 90000000).toISOString();
    const input = {
        provider: "teams",
        id: randomUUID(),
        kind: "scheduled",
        title: "Isolated virtual meeting",
        start,
        end,
    };
    await pool.query(
        "UPDATE teams_user_connections SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
        [ids.employee],
    );
    failNext = true;
    await assert.rejects(
        () => meetings.scheduleVirtualMeeting(ids.employee, input),
        (e) => e.status === 502,
    );
    assert.equal(renewals, 1);
    assert.equal(
        (await pool.query("SELECT status FROM workspace_virtual_meetings WHERE id=$1", [input.id]))
            .rows[0].status,
        "creating",
    );
    await assert.rejects(
        () =>
            meetings.inviteToMeeting(ids.employee, {
                id: input.id,
                mode: "virtual",
                people: [ids.user],
            }),
        (e) => e.status === 403,
    );
    const results = await Promise.all([
        meetings.retryVirtualMeeting(ids.employee, input.id),
        meetings.retryVirtualMeeting(ids.employee, input.id),
    ]);
    assert.equal(results[0].joinUrl, results[1].joinUrl);
    assert.equal(providerMeetings.size, 1);
    assert.equal(creates, 2);
    await meetings.scheduleVirtualMeeting(ids.employee, input);
    assert.equal(creates, 2);
    await assert.rejects(
        () => meetings.scheduleVirtualMeeting(ids.employee, { ...input, title: "changed" }),
        (e) => e.status === 409,
    );
    await assert.rejects(
        () => meetings.retryVirtualMeeting(ids.user, input.id),
        (e) => e.status === 404,
    );
    assert.deepEqual(meetings.invitationRoles("admin"), ["admin", "manager", "employee", "user"]);
    assert.deepEqual(meetings.invitationRoles("manager"), ["manager", "employee", "user"]);
    assert.deepEqual(meetings.invitationRoles("user"), ["employee", "user"]);
    const directory = await meetings.meetingDirectory(ids.employee);
    assert.ok(directory.people.every((person) => ["employee", "user"].includes(person.role)));
    assert.ok(!directory.people.some((person) => person.id === ids.inactive));
    await assert.rejects(
        () =>
            meetings.inviteToMeeting(ids.employee, {
                id: input.id,
                mode: "virtual",
                people: [ids.manager],
            }),
        (e) => e.status === 403,
    );
    await assert.rejects(
        () =>
            meetings.inviteToMeeting(ids.user, {
                id: input.id,
                mode: "virtual",
                people: [ids.employee],
            }),
        (e) => e.status === 403,
    );
    const sent = await meetings.inviteToMeeting(ids.employee, {
        id: input.id,
        mode: "virtual",
        people: [ids.user],
        departments: ["Branch B"],
    });
    assert.equal(sent.sent, 2);
    assert.equal(
        (
            await meetings.inviteToMeeting(ids.employee, {
                id: input.id,
                mode: "virtual",
                people: [ids.user],
                departments: ["Branch B"],
            })
        ).sent,
        0,
    );
    const userInbox = await meetings.meetingInbox(ids.user, true);
    assert.equal(userInbox.length, 1);
    assert.ok(userInbox[0].joinUrl.startsWith("https://teams.microsoft.com/"));
    assert.equal((await meetings.meetingInbox(ids.manager)).length, 0);
    await assert.rejects(
        () => meetings.respondToMeetingInvite(ids.manager, userInbox[0].id, "accept"),
        (e) => e.status === 404,
    );
    await meetings.respondToMeetingInvite(ids.user, userInbox[0].id, "accept");
    assert.equal((await meetings.meetingInbox(ids.user, true)).length, 0);
    assert.equal((await meetings.meetingInbox(ids.user))[0].status, "accepted");
    const managerMeeting = await meetings.scheduleVirtualMeeting(ids.manager, {
        ...input,
        id: randomUUID(),
    });
    await assert.rejects(
        () =>
            meetings.inviteToMeeting(ids.manager, {
                id: managerMeeting.id,
                mode: "virtual",
                people: [ids.admin],
            }),
        (e) => e.status === 403,
    );
    assert.equal(
        (
            await meetings.inviteToMeeting(ids.manager, {
                id: managerMeeting.id,
                mode: "virtual",
                people: [ids.otherManager, ids.otherEmployee, ids.user],
            })
        ).sent,
        3,
    );
    const userMeeting = await meetings.scheduleVirtualMeeting(ids.user, {
        ...input,
        id: randomUUID(),
    });
    await assert.rejects(
        () =>
            meetings.inviteToMeeting(ids.user, {
                id: userMeeting.id,
                mode: "virtual",
                people: [ids.manager],
            }),
        (e) => e.status === 403,
    );
    assert.equal(
        (
            await meetings.inviteToMeeting(ids.user, {
                id: userMeeting.id,
                mode: "virtual",
                people: [ids.employee],
            })
        ).sent,
        1,
    );
    const adminMeeting = await meetings.scheduleVirtualMeeting(ids.admin, {
        ...input,
        id: randomUUID(),
    });
    assert.equal(
        (
            await meetings.inviteToMeeting(ids.admin, {
                id: adminMeeting.id,
                mode: "virtual",
                people: [ids.otherAdmin, ids.manager, ids.employee, ids.user],
            })
        ).sent,
        4,
    );
    await pool.query("UPDATE teams_user_connections SET microsoft_id=$2 WHERE user_id=$1", [
        ids.employee,
        "different-account",
    ]);
    await assert.rejects(
        () => meetings.cancelVirtualMeeting(ids.employee, input.id),
        (e) => e.status === 409,
    );
    assert.equal(cancels, 0);
    await pool.query("UPDATE teams_user_connections SET microsoft_id=$2 WHERE user_id=$1", [
        ids.employee,
        `microsoft-${ids.employee}`,
    ]);
    await meetings.cancelVirtualMeeting(ids.employee, input.id);
    assert.equal(cancels, 1);
    const cancelled = (await meetings.meetingInbox(ids.user, true)).find(
        (invite) => invite.virtualId === input.id,
    );
    assert.equal(cancelled.meetingStatus, "cancelled");
    assert.equal(cancelled.joinUrl, null);
    await meetings.cancelVirtualMeeting(ids.employee, input.id);
    assert.equal(cancels, 1);
    const room = await rooms.configureMeetingRoom(ids.manager, {
        name: "Fixture room",
        location: "Test location",
        locationKind: "specific",
        capacity: 5,
    });
    assert.equal((await rooms.readMeetingRooms(ids.employee)).rooms[0].locationKind, "specific");
    await assert.rejects(
        () => rooms.setRoomActive(ids.otherManager, room.id, false),
        (e) => e.status === 404,
    );
    const nativePreview = await rooms.previewMeetingBooking(ids.employee, {
            roomId: room.id,
            title: "Native fixture",
            attendees: 3,
            start,
            end,
        }),
        booking = await rooms.confirmMeetingBooking(ids.employee, nativePreview.token);
    assert.equal(
        (
            await meetings.inviteToMeeting(ids.employee, {
                id: booking.id,
                mode: "in_person",
                people: [ids.user, ids.otherEmployee],
            })
        ).sent,
        2,
    );
    await assert.rejects(
        () =>
            meetings.inviteToMeeting(ids.employee, {
                id: booking.id,
                mode: "in_person",
                people: [ids.inactive],
            }),
        (e) => e.status === 403,
    );
    const extraEmployee = randomUUID();
    await pool.query(
        "INSERT INTO workspace_members(user_id,role,active,department) VALUES($1,$2,true,$3)",
        [extraEmployee, "employee", "Branch C"],
    );
    await assert.rejects(
        () =>
            meetings.inviteToMeeting(ids.employee, {
                id: booking.id,
                mode: "in_person",
                people: [extraEmployee],
            }),
        (e) => e.status === 409,
    );
    const nativeInvite = (await meetings.meetingInbox(ids.user, true)).find(
        (invite) => invite.bookingId === booking.id,
    );
    assert.equal(nativeInvite.mode, "in_person");
    assert.equal(nativeInvite.joinUrl, null);
    await meetings.respondToMeetingInvite(ids.user, nativeInvite.id, "dismiss");
    await rooms.cancelMeetingBooking(ids.employee, booking.id);
    assert.equal(
        (await meetings.meetingInbox(ids.user, true)).find(
            (invite) => invite.bookingId === booking.id,
        ).meetingStatus,
        "cancelled",
    );
    const api = load("app/api/meetings/route.ts", {
        "@/lib/request-session": {
            getRequestSession: async (request) =>
                request.headers.get("X-Test-Actor")
                    ? { user: { id: request.headers.get("X-Test-Actor") } }
                    : null,
        },
        "@/lib/eassist/transport": { InputError, boundedJson: (r) => r.json() },
        "@/lib/service-review/ingestion": {
            requireSameOrigin: (r) => {
                if (r.headers.get("origin") !== "http://localhost") throw Error("origin");
            },
        },
        "@/lib/workspace-meetings": meetings,
        "@/lib/teams-meetings": teams,
        "@/lib/google-meet": google,
    });
    assert.equal((await api.GET(new Request("http://localhost/api/meetings"))).status, 401);
    assert.equal(
        (
            await api.POST(
                new Request("http://localhost/api/meetings", {
                    method: "POST",
                    headers: { "X-Test-Actor": ids.user, origin: "https://attacker.invalid" },
                    body: "{}",
                }),
            )
        ).status,
        403,
    );
    const inboxResponse = await api.GET(
        new Request("http://localhost/api/meetings?inbox=unread", {
            headers: { "X-Test-Actor": ids.user },
        }),
    );
    assert.equal(inboxResponse.status, 200);
    assert.equal(inboxResponse.headers.get("cache-control"), "no-store");
    assert.ok(Array.isArray((await inboxResponse.json()).invitations));
    const changed = await teams.beginTeamsSignIn(ids.employee);
    await teams.configureTeamsApp(ids.admin, { ...settings, clientSecret: "new-isolated-secret" });
    assert.equal((await teams.teamsConnectionStatus(ids.employee)).connected, false);
    await assert.rejects(
        () => teams.finishTeamsSignIn(ids.employee, changed.state, `code:${ids.employee}`),
        (e) => e.status === 409,
    );
    console.log(
        "PASS: encrypted Teams settings/tokens, per-organizer OAuth/PKCE, single-use/expired states, token renewal, real adapter requests with mocked Microsoft responses, unsafe URL rejection, failure recovery/concurrent idempotent retries, organizer account binding, role/department invitation rules, recipient privacy, acknowledgements, native booking invitations, cancellation notifications, authentication and CSRF. No real Microsoft calls or real invitations; isolated database schema only.",
    );
} finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    if (pool) await pool.end();
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
}
