import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = mkdtempSync(join(tmpdir(), "aiforce-env-"));
const privateFile = join(directory, "private.env");
const loader = new URL("../scripts/load-env.mjs", import.meta.url).href;
const env = { ...process.env };
delete env.OPENAI_API_KEY;
delete env.AIFORCE_ENV_FILE;
delete env.RENDER;

try {
    writeFileSync(privateFile, "OPENAI_API_KEY=fixture-external-key\n");
    writeFileSync(join(directory, ".env"), "FIXTURE_BASE=base\n");
    writeFileSync(join(directory, ".env.local"), `AIFORCE_ENV_FILE=${JSON.stringify(privateFile)}\n`);
    function check(overrides) {
        const result = spawnSync(process.execPath, ["--input-type=module", "-e",
            `import ${JSON.stringify(loader)}; process.stdout.write(JSON.stringify({key:process.env.OPENAI_API_KEY || null}));`],
            { cwd: directory, env: { ...env, ...overrides }, encoding: "utf8", windowsHide: true });
        assert.equal(result.status, 0, "Environment loader should start successfully");
        return JSON.parse(result.stdout).key;
    }
    assert.equal(check({}), "fixture-external-key");
    assert.equal(check({ OPENAI_API_KEY: "fixture-hosted-key" }), "fixture-hosted-key");
    assert.equal(check({ RENDER: "true", AIFORCE_ENV_FILE: privateFile }), null);
    assert.equal(check({ RENDER: "true", OPENAI_API_KEY: "fixture-hosted-key" }), "fixture-hosted-key");
    assert.equal(check({ AIFORCE_ENV_FILE: join(directory, "does-not-exist.env") }), null);
    console.log("PASS external environment loading, hosting precedence, optional file handling, and Render isolation.");
} finally {
    for (const file of [privateFile, join(directory, ".env"), join(directory, ".env.local")]) unlinkSync(file);
    rmdirSync(directory);
}
