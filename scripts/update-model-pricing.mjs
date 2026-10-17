import { writeFile } from "node:fs/promises";

const source = "https://developers.openai.com/api/docs/pricing.md";
const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Official pricing fetch failed: ${response.status}`);
const text = await response.text();
const number = (value) =>
    value === "Free" ? 0 : /^\$[\d.]+$/.test(value) ? Number(value.slice(1)) : null;
const models = {};
const standard = text.split("### Standard pricing data")[1]?.split("### Batch pricing data")[0];
if (!standard)
    throw new Error("Official Standard table format changed; retained existing catalog.");
for (const row of standard.split("\n").filter((row) => row.startsWith("|"))) {
    const cells = row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
    if (cells.length !== 9 || number(cells[1]) === null) continue;
    const model = cells[0].replace(/ \(.+\)$/, "");
    models[model] = {
        input: number(cells[1]),
        cached: number(cells[2]),
        cacheWrite: number(cells[3]),
        output: number(cells[4]),
        longInput: number(cells[5]),
        longCached: number(cells[6]),
        longCacheWrite: number(cells[7]),
        longOutput: number(cells[8]),
    };
}
const specialized = text.split("Specialized models")[1]?.split("Fast")[0];
for (const row of specialized?.split("\n").filter((row) => row.startsWith("|")) ?? []) {
    const cells = row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
    if (cells.length !== 5 || number(cells[2]) === null) continue;
    models[cells[1]] = {
        input: number(cells[2]),
        cached: number(cells[3]),
        cacheWrite: null,
        output: number(cells[4]) ?? 0,
        longInput: null,
        longCached: null,
        longCacheWrite: null,
        longOutput: null,
    };
}
// Pricing lists some legacy snapshots instead of their public aliases. Verify
// each alias's default snapshot against its official model page before copying.
for (const id of Object.keys(models).filter((id) => /-(?:\d{4}-\d{2}-\d{2}|\d{4})$/.test(id))) {
    const alias = id.replace(/-(?:\d{4}-\d{2}-\d{2}|\d{4})$/, "");
    if (models[alias]) continue;
    const doc = await fetch(`https://developers.openai.com/api/docs/models/${alias}.md`, {
        signal: AbortSignal.timeout(10000),
    });
    if (!doc.ok) continue;
    const modelDoc = await doc.text();
    const snapshot = modelDoc.match(/Default snapshot: `([^`]+)`/)?.[1];
    if (snapshot && models[snapshot]) models[alias] = { ...models[snapshot] };
    else {
        const metric = (name) => {
            const value = modelDoc.match(
                new RegExp("\\| " + name + " \\| \\$([0-9.]+) \\| 1M tokens \\|"),
            )?.[1];
            return value === undefined ? null : Number(value);
        };
        const input = metric("Input"),
            output = metric("Output");
        if (input !== null && output !== null)
            models[alias] = {
                input,
                output,
                cached: metric("Cached input"),
                cacheWrite: metric("Cache writes"),
                longInput: null,
                longCached: null,
                longCacheWrite: null,
                longOutput: null,
            };
    }
}
if (models["gpt-4.1-nano"]?.input !== 0.1 || Object.keys(models).length < 35)
    throw new Error("Pricing validation failed; retained existing catalog.");
await writeFile(
    "lib/openai-pricing.json",
    JSON.stringify(
        {
            source,
            verifiedAt: new Date().toISOString(),
            currency: "USD",
            unit: "per million tokens",
            models,
        },
        null,
        2,
    ) + "\n",
);
console.log(
    `Updated ${Object.keys(models).length} standard text / embedding model rates from official OpenAI pricing.`,
);
