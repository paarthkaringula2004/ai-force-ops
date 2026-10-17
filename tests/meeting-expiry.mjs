import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
const m = { exports: {} };
new Function(
    "module",
    "exports",
    ts.transpileModule(readFileSync("lib/meeting-expiry.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
)(m, m.exports);
const { meetingAccess } = m.exports,
    now = Date.parse("2026-10-15T10:00:00Z");
const meeting = {
    id: "fixture",
    status: "ready",
    end: "2026-10-15T15:30:00+05:30",
    joinUrl: "https://meet.google.com/fixture",
    meetingId: "code",
    passcode: "secret",
};
assert.equal(meetingAccess(meeting, now - 1).joinUrl, meeting.joinUrl);
const expired = meetingAccess(meeting, now);
assert.equal(expired.status, "expired");
assert.equal(expired.joinUrl, null);
assert.equal(expired.meetingId, null);
assert.equal(expired.passcode, null);
assert.equal(expired.id, "fixture");
assert.equal(meeting.status, "ready");
assert.equal(meetingAccess({ ...meeting, status: "creating" }, now).status, "expired");
assert.equal(meetingAccess({ ...meeting, status: "cancelled" }, now).status, "cancelled");
assert.equal(meetingAccess({ ...meeting, end: "invalid" }, now).joinUrl, null);
console.log(
    "PASS: exact meeting expiry boundary, timezone offsets, link/code redaction, cancelled/pending states and immutable input.",
);
