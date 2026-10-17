import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import ts from "typescript";
import { randomUUID } from "node:crypto";
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
});
const schema = "booking_test_" + randomUUID().replaceAll("-", "");
let pool;
const admin = randomUUID(),
    person = randomUUID(),
    other = randomUUID(),
    disabled = randomUUID();
const members = new Map([
    [admin, { role: "admin", active: true }],
    [person, { role: "employee", active: true }],
    [other, { role: "user", active: true }],
    [disabled, { role: "manager", active: false }],
]);
const permissions = load("lib/workspace-permissions.ts");
const access = {
    workspaceAccess: async (id) => members.get(id) || { role: "user", active: false },
};
try {
    await control.query(`CREATE SCHEMA ${schema}`);
    for (const name of [
        "meeting_rooms",
        "meeting_room_bookings",
        "meeting_room_previews",
        "workspace_meeting_invites",
    ])
        await control.query(`CREATE TABLE ${schema}.${name} (LIKE public.${name} INCLUDING ALL)`);
    pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
        max: 4,
        options: `-c search_path=${schema},public`,
    });
    const rooms = load("lib/meeting-rooms.ts", {
        "./db": { db: pool },
        "./workspace-access": access,
        "./workspace-permissions": permissions,
        "./eassist/transport": { InputError },
    });
    assert.equal(permissions.requiredPermission("/dashboard/meeting-rooms"), "signed_in");
    assert.equal(permissions.requiredPermission("/api/meeting-rooms"), "signed_in");
    assert.throws(() => rooms.bookingWindow("2026-11-01T09:00", "2026-11-01T10:00"), /timezone/);
    await assert.rejects(
        () => rooms.configureMeetingRoom(person, { name: "Cannot create", capacity: 5 }),
        (error) => error.status === 403,
    );
    await assert.rejects(
        () => rooms.readMeetingRooms(disabled),
        (error) => error.status === 403,
    );
    assert.equal((await rooms.readMeetingRooms(person)).configured, false);
    const room = await rooms.configureMeetingRoom(admin, {
        name: "Verification room",
        location: "Isolated test schema",
        capacity: 4,
        amenities: "Fixture only",
    });
    await assert.rejects(
        () =>
            rooms.configureMeetingRoom(admin, {
                name: room.name,
                location: room.location,
                capacity: 4,
            }),
        (error) => error.status === 409,
    );
    const start = new Date(Date.now() + 24 * 3600000).toISOString(),
        end = new Date(Date.now() + 25 * 3600000).toISOString();
    const input = { roomId: room.id, title: "Private fixture title", attendees: 4, start, end };
    await assert.rejects(
        () => rooms.previewMeetingBooking(person, { ...input, attendees: 5 }),
        /too small/,
    );
    const first = await rooms.previewMeetingBooking(person, input),
        second = await rooms.previewMeetingBooking(other, {
            ...input,
            title: "Other private title",
        });
    assert.equal(
        (await rooms.readMeetingRooms(person, { start, end, attendees: 4 })).rooms[0].available,
        true,
    );
    await assert.rejects(
        () => rooms.confirmMeetingBooking(other, first.token),
        (error) => error.status === 404,
    );
    const competing = await Promise.allSettled([
        rooms.confirmMeetingBooking(person, first.token),
        rooms.confirmMeetingBooking(other, second.token),
    ]);
    assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
    const failure = competing.find((r) => r.status === "rejected");
    assert.equal(failure.reason.status, 409);
    const winner = competing[0].status === "fulfilled" ? person : other,
        loser = winner === person ? other : person,
        token = winner === person ? first.token : second.token,
        booking = competing.find((r) => r.status === "fulfilled").value;
    await assert.rejects(
        () =>
            rooms.configureMeetingRoom(admin, {
                roomId: room.id,
                name: room.name,
                location: room.location,
                capacity: 3,
            }),
        (error) => error.status === 409,
    );
    await assert.rejects(
        () =>
            rooms.configureMeetingRoom(person, {
                roomId: room.id,
                name: "Unauthorized",
                location: "No",
                capacity: 4,
            }),
        (error) => error.status === 403,
    );
    const updated = await rooms.configureMeetingRoom(admin, {
        roomId: room.id,
        name: room.name,
        location: "Updated fixture location",
        capacity: 6,
        amenities: "Updated",
        locationKind: "specific",
    });
    assert.equal(updated.id, room.id);
    assert.equal(updated.capacity, 6);
    assert.equal(
        (await pool.query("SELECT status FROM meeting_room_bookings WHERE id=$1", [booking.id]))
            .rows[0].status,
        "confirmed",
    );
    await rooms.configureMeetingRoom(admin, {
        roomId: room.id,
        name: room.name,
        location: room.location,
        capacity: 4,
    });
    console.log(
        "PASS: room edit persists in place, rejects unauthorized changes and protects existing reservation capacity.",
    );
    const again = await rooms.confirmMeetingBooking(winner, token);
    assert.equal(again.id, booking.id);
    assert.equal(again.alreadyConfirmed, true);
    const loserData = await rooms.readMeetingRooms(loser, { start, end, attendees: 4 });
    assert.equal(loserData.rooms[0].available, false);
    assert.equal(loserData.bookings.length, 0);
    assert.equal(JSON.stringify(loserData).includes("Private fixture title"), false);
    assert.equal(JSON.stringify(loserData).includes("Other private title"), false);
    await assert.rejects(
        () => rooms.cancelMeetingBooking(loser, booking.id),
        (error) => error.status === 404,
    );
    await rooms.cancelMeetingBooking(winner, booking.id);
    assert.equal((await rooms.readMeetingRooms(loser, { start, end })).rooms[0].available, true);
    const adjacent = await rooms.previewMeetingBooking(person, {
        ...input,
        end: new Date(Date.parse(end) + 3600000).toISOString(),
    });
    const adjacentBooking = await rooms.confirmMeetingBooking(person, adjacent.token);
    const atBoundary = new Date(Date.parse(end) + 3600000).toISOString();
    const backToBack = await rooms.previewMeetingBooking(other, {
        ...input,
        start: atBoundary,
        end: new Date(Date.parse(atBoundary) + 3600000).toISOString(),
    });
    const boundaryBooking = await rooms.confirmMeetingBooking(other, backToBack.token);
    const far = {
        ...input,
        start: new Date(Date.parse(end) + 4 * 3600000).toISOString(),
        end: new Date(Date.parse(end) + 5 * 3600000).toISOString(),
    };
    const expiring = await rooms.previewMeetingBooking(person, far);
    await pool.query(
        "UPDATE meeting_room_previews SET expires_at=now()-interval '1 minute' WHERE user_id=$1 AND booking_id IS NULL",
        [person],
    );
    await assert.rejects(() => rooms.confirmMeetingBooking(person, expiring.token), /expired/);
    const pending = await rooms.previewMeetingBooking(person, far);
    await rooms.setRoomActive(admin, room.id, false);
    await assert.rejects(() => rooms.confirmMeetingBooking(person, pending.token), /unavailable/);
    assert.equal((await rooms.readMeetingRooms(person)).configured, false);
    await assert.rejects(
        () => rooms.setRoomActive(person, room.id, true),
        (error) => error.status === 403,
    );
    await assert.rejects(
        () => rooms.deleteMeetingRoom(person, room.id),
        (error) => error.status === 403,
    );
    await assert.rejects(
        () => rooms.deleteMeetingRoom(admin, room.id),
        (error) => error.status === 409,
    );
    await assert.rejects(
        () => rooms.removeMeetingBooking(person, adjacentBooking.id),
        (error) => error.status === 409,
    );
    await assert.rejects(
        () => rooms.removeMeetingBooking(loser, booking.id),
        (error) => error.status === 409,
    );
    await rooms.removeMeetingBooking(winner, booking.id);
    assert.equal(
        (await rooms.readMeetingRooms(winner)).bookings.some((b) => b.id === booking.id),
        false,
    );
    assert.equal(
        (await pool.query("SELECT status FROM meeting_room_bookings WHERE id=$1", [booking.id]))
            .rows[0].status,
        "cancelled",
    );
    await rooms.cancelMeetingBooking(person, adjacentBooking.id);
    await rooms.cancelMeetingBooking(other, boundaryBooking.id);
    await rooms.deleteMeetingRoom(admin, room.id);
    assert.equal((await rooms.readMeetingRooms(admin)).rooms.length, 0);
    assert.equal(
        (await rooms.readMeetingRooms(person)).bookings.some((b) => b.id === adjacentBooking.id),
        true,
    );
    await assert.rejects(
        () => rooms.setRoomActive(admin, room.id, true),
        (error) => error.status === 404,
    );
    await assert.rejects(() => rooms.confirmMeetingBooking(person, pending.token), /unavailable/);
    const replacement = await rooms.configureMeetingRoom(admin, {
        name: room.name,
        location: room.location,
        capacity: 4,
    });
    const deleteRacePreview = await rooms.previewMeetingBooking(person, {
        ...far,
        roomId: replacement.id,
    });
    const deleteRace = await Promise.allSettled([
        rooms.deleteMeetingRoom(admin, replacement.id),
        rooms.confirmMeetingBooking(person, deleteRacePreview.token),
    ]);
    assert.equal(deleteRace.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(deleteRace.find((r) => r.status === "rejected").reason.status, 409);
    console.log(
        "PASS: Admin-only room deletion, upcoming reservation protection, own cancelled booking removal, retained history, reused room names and deletion/confirmation concurrency.",
    );
    const route = load("app/api/meeting-rooms/route.ts", {
        "@/lib/request-session": {
            getRequestSession: async (request) =>
                request.headers.get("X-Test-Actor")
                    ? { user: { id: request.headers.get("X-Test-Actor") } }
                    : null,
        },
        "@/lib/meeting-rooms": rooms,
        "@/lib/service-review/ingestion": {
            requireSameOrigin: (request) => {
                if (request.headers.get("origin") !== "http://localhost")
                    throw new Error("Wrong origin");
            },
        },
        "@/lib/eassist/transport": { InputError, boundedJson: (request) => request.json() },
    });
    assert.equal((await route.GET(new Request("http://localhost/api/meeting-rooms"))).status, 401);
    assert.equal(
        (
            await route.POST(
                new Request("http://localhost/api/meeting-rooms", {
                    method: "POST",
                    headers: { "X-Test-Actor": person, origin: "https://other.invalid" },
                    body: "{}",
                }),
            )
        ).status,
        403,
    );
    const result = await route.GET(
        new Request("http://localhost/api/meeting-rooms", { headers: { "X-Test-Actor": person } }),
    );
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    const presets = load("lib/agent-studio-presets.ts", {
        "./agent-studio-graph": load("lib/agent-studio-graph.ts"),
    });
    const graph = presets.presetGraph("MeetRoom", "Custom instructions");
    const upgraded = presets.ensureMeetingRoomTool(graph);
    assert.equal(graph.nodes.length, 6);
    assert.equal(upgraded.nodes.length, 7);
    assert.equal(presets.ensureMeetingRoomTool(upgraded), upgraded);
    assert.equal(
        upgraded.nodes.find((n) => n.id === "main").data.instructions,
        graph.nodes.find((n) => n.id === "main").data.instructions,
    );
    console.log(
        "PASS: native booking configuration, active-role permissions, timezones, capacity, private per-user history, previews, two concurrent confirmations (only one succeeds), idempotency, exact interval boundaries, cancellation, expiry, disabled rooms, authentication/CSRF/no-cache and additive agent wiring. Isolated schema removed; no real rooms, provider calls or external calendar actions.",
    );
} finally {
    if (pool) await pool.end();
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
}
