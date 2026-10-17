// Isolated proof of scanner capability. Never exposes the intentionally vulnerable
// fixture on the application server, changes user records, or scans external hosts.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { tools, scanWebBaseline } from "../scripts/security-scanner.mjs";
const escape = (value) =>
    value.replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
const requests = { total: 0, unsafe: 0, safe: 0 };
const fixture = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
    }
    requests.total++;
    const safe = url.pathname === "/safe";
    requests[safe ? "safe" : "unsafe"]++;
    const input = url.searchParams.get("q") || "";
    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    });
    res.end(
        `<!doctype html><html><head><title>Isolated XSS test fixture</title></head><body><h1>${safe ? "Escaped control" : "Intentional test flaw"}</h1><form method="get"><input name="q" value="${escape(input)}"><button>Search</button></form><p>Result: ${safe ? escape(input) : input}</p></body></html>`,
    );
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${fixture.address().port}`;
// Scope belongs only to this test process, not the .env or running app worker.
process.env.SECURITY_SCAN_TARGET_URL = origin;
const root = resolve(".security-runs");
await mkdir(root, { recursive: true });
const runDir = await mkdtemp(join(root, "xss-proof-"));
async function freePort() {
    const s = createServer();
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    const port = s.address().port;
    await new Promise((r) => s.close(r));
    return port;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let zap;
try {
    const paths = await tools();
    assert.ok(paths.java && paths.zap, "Install the project ZAP/Java tools first.");
    console.log(
        "Testing the actual project passive web-baseline function against a loopback-only XSS fixture.",
    );
    const baseline = await scanWebBaseline(
        { target: origin },
        paths,
        async (phase) => console.log(phase),
        { port: await freePort(), profile: join(runDir, "baseline"), silent: true },
    );
    const baselineXss = baseline.findings.filter(
        (a) => a.cwe === "79" || /cross.?site scripting|\bXSS\b/i.test(a.title),
    );
    console.log(
        `Baseline completed: ${baseline.findings.length} observations; ${baselineXss.length} XSS findings.`,
    );
    const port = await freePort(),
        key = randomBytes(32).toString("hex"),
        profile = join(runDir, "active-control");
    await mkdir(profile, { recursive: true });
    zap = spawn(
        paths.java,
        [
            "-Xmx512m",
            "-jar",
            paths.zap,
            "-daemon",
            "-silent",
            "-host",
            "127.0.0.1",
            "-port",
            String(port),
            "-dir",
            profile,
            "-config",
            `api.key=${key}`,
            "-config",
            "api.addrs.addr.name=127.0.0.1",
            "-config",
            "api.addrs.addr.regex=false",
            "-config",
            "autoupdate.checkOnStart=false",
        ],
        { cwd: dirname(paths.zap), shell: false, windowsHide: true, stdio: "ignore" },
    );
    let startupError = false;
    zap.on("error", () => {
        startupError = true;
    });
    const api = async (group, kind, action, params = {}) => {
        const url = new URL(`http://127.0.0.1:${port}/JSON/${group}/${kind}/${action}/`);
        url.searchParams.set("apikey", key);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
        const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
        const b = await r.json();
        if (!r.ok || b.code)
            throw new Error(`ZAP ${action}: HTTP ${r.status}; ${b.code || ""}; ${b.message || ""}`);
        return b;
    };
    let version;
    for (let i = 0; i < 90; i++) {
        if (startupError || zap.exitCode !== null) throw new Error("ZAP control process stopped.");
        try {
            version = (await api("core", "view", "version")).version;
            break;
        } catch {
            await wait(1000);
        }
    }
    assert.ok(version, "ZAP failed to start.");
    await api("core", "action", "newSession", { overwrite: true });
    const scanners = (await api("ascan", "view", "scanners")).scanners;
    assert.ok(
        scanners.some((s) => String(s.id) === "40012"),
        "Reflected-XSS active scan rule 40012 is not installed.",
    );
    await api("ascan", "action", "addScanPolicy", { scanPolicyName: "XSS proof only" });
    await api("ascan", "action", "disableAllScanners", { scanPolicyName: "XSS proof only" });
    await api("ascan", "action", "enableScanners", {
        ids: "40012",
        scanPolicyName: "XSS proof only",
    });
    const results = [];
    for (const [path, expected] of [
        ["/vulnerable", true],
        ["/safe", false],
    ]) {
        const url = origin + path + "?q=hello";
        assert.equal(new URL(url).hostname, "127.0.0.1");
        await api("core", "action", "accessUrl", { url, followRedirects: false });
        let recorded = false;
        for (let i = 0; i < 20; i++) {
            const known = (await api("core", "view", "urls", { baseurl: origin })).urls || [];
            if (known.includes(url)) {
                recorded = true;
                break;
            }
            await wait(250);
        }
        assert.ok(recorded, "Fixture URL was not recorded in the ZAP site tree.");
        // Scan the GET history entry recorded by accessUrl; omitting method/postData
        // avoids asking ZAP to match a synthetic request that is absent from its tree.
        const id = (
            await api("ascan", "action", "scan", {
                url,
                recurse: false,
                inScopeOnly: false,
                scanPolicyName: "XSS proof only",
            })
        ).scan;
        console.log(`Running reflected-XSS rule against ${path} only.`);
        let done = false;
        for (let i = 0; i < 120; i++) {
            if (Number((await api("ascan", "view", "status", { scanId: id })).status) === 100) {
                done = true;
                break;
            }
            await wait(1000);
        }
        assert.ok(done, "The isolated XSS control scan timed out.");
        const alerts =
            (await api("core", "view", "alerts", { baseurl: origin + path, start: 0, count: 100 }))
                .alerts || [];
        const xss = alerts.filter(
            (a) => String(a.pluginId) === "40012" && new URL(a.url).pathname === path,
        );
        assert.equal(
            xss.length > 0,
            expected,
            `${path}: XSS detection did not match the expected control result.`,
        );
        results.push({
            path,
            expectedVulnerable: expected,
            detected: xss.length > 0,
            findings: xss.map((a) => ({
                rule: a.pluginId,
                title: a.alert,
                risk: a.risk,
                confidence: a.confidence,
                parameter: a.param,
                cwe: a.cweid,
            })),
        });
        console.log(`PASS: ${path}: ${xss.length} reflected-XSS findings.`);
    }
    const report = {
        checkedAt: new Date().toISOString(),
        scope: "Isolated loopback-only fixture; not an application vulnerability assessment",
        zapVersion: version,
        productionBaseline: {
            xssFindings: baselineXss.length,
            observations: baseline.findings.length,
            coverage: baseline.coverage,
        },
        controls: results,
        requests,
        conclusion:
            "The installed ZAP active rule detects reflected XSS, but the current project passive baseline does not exercise that rule. These controls do not establish whether AIForce.Ops contains XSS.",
        source: "https://www.zaproxy.org/docs/alerts/40012/",
    };
    await mkdir("docs/verification", { recursive: true });
    await writeFile("docs/verification/xss-scanner-proof.json", JSON.stringify(report, null, 2));
    console.log(
        "PASS: proof saved to docs/verification/xss-scanner-proof.json. No real accounts or application data were changed.",
    );
} finally {
    if (zap) {
        zap.kill();
        await new Promise((r) => {
            if (zap.exitCode !== null) return r();
            zap.once("exit", r);
            setTimeout(r, 5000);
        });
    }
    await new Promise((r) => fixture.close(r));
}
