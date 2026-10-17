import "./load-env.mjs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
// Independent backend processes keep working without a browser session.
const production = process.argv.includes("--production");
const children = new Set();
let stopping = false;
function run(file, args, label) {
    const child = spawn(process.execPath, [resolve(file), ...args], {
        stdio: "inherit",
        shell: false,
        windowsHide: true,
    });
    children.add(child);
    child.on("error", (error) => console.error(`${label}: ${error.message}`));
    child.on("exit", (code) => {
        children.delete(child);
        if (stopping) return;
        if (label.endsWith("worker")) {
            console.error(`${label} stopped; restarting in 3 seconds.`);
            setTimeout(() => {
                if (!stopping) run(file, args, label);
            }, 3000);
        } else {
            shutdown();
            process.exitCode = code || 0;
        }
    });
    return child;
}
function shutdown() {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
run(
    "node_modules/next/dist/bin/next",
    [
        production ? "start" : "dev",
        ...process.argv.slice(2).filter((arg) => arg !== "--production"),
    ],
    "Website",
);
run("scripts/security-worker.mjs", [], "Security worker");

run("scripts/eassist-worker.mjs", [], "Integration worker");

run("scripts/mail-worker.mjs", [], "Mail worker");
