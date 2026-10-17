import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
const source = readFileSync("scripts/dev-workspace.mjs", "utf8").replace(/^import .*;\r?\n/gm, "");
function boot(args) {
    const children = [],
        timers = [];
    const process = new EventEmitter();
    process.argv = ["node", "workspace", ...args];
    process.execPath = "fixture-node";
    const spawn = (executable, argv, options) => {
        const child = new EventEmitter();
        child.kill = (signal) => {
            child.killed = signal;
        };
        children.push({ executable, argv, options, child });
        return child;
    };
    runInNewContext(source, {
        process,
        spawn,
        resolve,
        setTimeout: (fn) => timers.push(fn),
        console: { error() {} },
    });
    return { children, timers, process };
}
for (const [args, mode] of [
    [[], "dev"],
    [["--production", "--hostname", "0.0.0.0"], "start"],
]) {
    const runtime = boot(args);
    assert.equal(runtime.children.length, 4);
    assert.equal(runtime.children[0].argv[1], mode);
    assert.ok(!runtime.children[0].argv.includes("--production"));
    if (mode === "start")
        assert.deepEqual(Array.from(runtime.children[0].argv.slice(2)), ["--hostname", "0.0.0.0"]);
    for (const c of runtime.children) assert.equal(c.options.windowsHide, true);
    runtime.children[1].child.emit("exit", 1);
    assert.equal(runtime.timers.length, 1);
    runtime.timers[0]();
    assert.equal(runtime.children.length, 5);
    assert.equal(runtime.children[4].argv[0], resolve("scripts/security-worker.mjs"));
    runtime.process.emit("SIGTERM");
    for (const c of runtime.children.slice(2)) assert.equal(c.child.killed, "SIGTERM");
    runtime.children[4].child.emit("exit", 0);
    assert.equal(runtime.timers.length, 1, "Shutdown does not restart workers");
}
const failed = boot(["--production"]);
failed.children[0].child.emit("exit", 1);
assert.equal(failed.process.exitCode, 1);
for (const c of failed.children.slice(1)) assert.equal(c.child.killed, "SIGTERM");
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
assert.equal(scripts.start, "node scripts/dev-workspace.mjs --production");
assert.equal(scripts["start:web"], "next start");
console.log(
    "PASS: dev/production start independent workers, forward Next arguments, restart failed workers, stop cleanly, and retain a web-only command for separately hosted workers. No real services started.",
);
