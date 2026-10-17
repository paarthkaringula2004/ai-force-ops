import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { checkRenderEnvironment } from "./render-config.mjs";

dotenv.config({ quiet: true });
const config = checkRenderEnvironment(process.env);
for (const warning of config.warnings) console.warn(`Notice: ${warning}`);
if (config.errors.length) {
    for (const error of config.errors) console.error(`Configuration: ${error}`);
    process.exit(1);
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be a valid TCP port.");
const children = new Set(),
    timers = new Set();
let stopping = false;
function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const timer of timers) clearTimeout(timer);
    for (const child of children) child.kill("SIGTERM");
    const force = setTimeout(() => {
        for (const child of children) child.kill("SIGKILL");
    }, 10000);
    force.unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function launch(file, args = [], worker = false) {
    const local = `http://127.0.0.1:${port}`;
    const env = {
        ...process.env,
        NODE_ENV: "production",
        RENDER: "true",
        ...(worker ? { EASSIST_APP_URL: local, SECURITY_SCAN_APP_URL: local } : {}),
    };
    // Mail URLs inside messages must remain public; its request target is separate.
    if (worker) env.MAIL_WORKER_APP_URL = local;
    const child = spawn(process.execPath, [resolve(file), ...args], {
        env,
        stdio: "inherit",
        windowsHide: true,
    });
    children.add(child);
    child.on("error", () => {
        console.error(`Could not start ${file}.`);
        stop(1);
    });
    child.on("exit", (code) => {
        children.delete(child);
        if (stopping) return;
        if (!worker) {
            console.error(`Website exited (${code ?? "signal"}).`);
            stop(code || 1);
            return;
        }
        console.error(`Worker ${file} exited; retrying in five seconds.`);
        const timer = setTimeout(() => {
            timers.delete(timer);
            if (!stopping) launch(file, args, true);
        }, 5000);
        timers.add(timer);
    });
    return child;
}
async function migrate(file) {
    const child = spawn(process.execPath, [resolve(file)], {
        env: { ...process.env, RENDER: "true" },
        stdio: "inherit",
        windowsHide: true,
    });
    children.add(child);
    try {
        await new Promise((ok, fail) => {
            child.on("error", fail);
            child.on("exit", (code) =>
                code === 0
                    ? ok()
                    : fail(new Error("Database initialization failed; website was not started.")),
            );
        });
    } finally {
        children.delete(child);
    }
}
try {
    if (process.env.RENDER_RUN_MIGRATIONS !== "false") {
        await migrate("scripts/auth-migrate.mjs");
        if (!stopping) await migrate("scripts/migrate.mjs");
    }
    if (!stopping)
        launch("node_modules/next/dist/bin/next", [
            "start",
            "--hostname",
            "0.0.0.0",
            "--port",
            String(port),
        ]);
    if (!stopping && process.env.RENDER_RUN_WORKERS !== "false") {
        launch("scripts/eassist-worker.mjs", [], true);
        launch("scripts/mail-worker.mjs", [], true);
    }
    if (!stopping && process.env.RENDER_RUN_SECURITY_WORKER === "true")
        launch("scripts/security-worker.mjs", [], true);
} catch {
    console.error("Render startup failed during database setup. Review the migration error above.");
    stop(1);
}
