import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compiled = ts.transpileModule(
    await readFile("app/service-review-center/review-data.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { latestHealthReadings } = await import(
    "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const record = (recordKey, endpoint, status, observedAt = "2026-10-05T12:00:00Z", extra = {}) => ({
    id: recordKey,
    recordType: "health",
    recordKey,
    payload: { endpoint, device: new URL(endpoint).host, status },
    observedAt,
    ...extra,
});
const records = [
    record("connection:health", "https://alerts.example/", "Healthy", "2026-10-05T12:01:00Z"),
    record("prometheus:target:alerts", "https://ALERTS.example/metrics", "Down"),
    record(
        "prometheus:target:alerts",
        "https://alerts.example/metrics",
        "Healthy",
        "2026-10-05T11:00:00Z",
    ),
    record("prometheus:target:old", "https://old.example/", "Healthy", undefined, {
        isCurrent: false,
    }),
    record("local:1", "http://localhost:9090/", "Healthy"),
    record("local:2", "http://localhost:9091/", "Down"),
    record("other", "https://other.example/", "Healthy"),
];
const rows = latestHealthReadings(records);
assert.equal(rows.length, 4, "Only one row per endpoint, excluding obsolete targets");
assert.equal(
    rows.find((r) => r.payload.device === "alerts.example").payload.status,
    "Down",
    "A successful API connection must not hide a failed scrape",
);
assert.equal(
    rows.filter((r) => r.payload.device.startsWith("localhost:")).length,
    2,
    "Different ports are distinct endpoints",
);
assert.deepEqual(
    latestHealthReadings([...records].reverse()),
    rows,
    "Order is stable across collector arrival order",
);
assert.equal(records.length, 7, "Display consolidation does not erase historical records");
console.log(
    "PASS endpoint deduplication, scrape health priority, latest snapshot, stable order, distinct ports and history preservation",
);
