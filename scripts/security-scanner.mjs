import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdir, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function locate(root, pattern) {
    try {
        for (const item of await readdir(root, { withFileTypes: true })) {
            const path = join(root, item.name);
            if (item.isFile() && pattern.test(item.name)) return path;
            if (item.isDirectory()) {
                const found = await locate(path, pattern);
                if (found) return found;
            }
        }
    } catch {}
    return "";
}
export async function tools() {
    const root = resolve(".security-tools");
    return {
        java:
            process.env.SECURITY_JAVA_PATH ||
            (await locate(join(root, "java"), /^java(?:\.exe)?$/)),
        zap: process.env.SECURITY_ZAP_JAR || (await locate(join(root, "zap"), /^zap-[\d.]+\.jar$/)),
        trivy:
            process.env.SECURITY_TRIVY_PATH ||
            (await locate(join(root, "trivy"), /^trivy(?:\.exe)?$/)),
    };
}
function processOutput(executable, args, { cwd, timeout = 600000, max = 20_000_000 } = {}) {
    return new Promise((ok, reject) => {
        const child = spawn(executable, args, { cwd, shell: false, windowsHide: true }),
            chunks = [];
        let bytes = 0,
            ended = false;
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("Scanner exceeded its time limit."));
        }, timeout);
        child.stdout.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > max) {
                child.kill();
                reject(new Error("Scanner output exceeded its size limit."));
            } else chunks.push(chunk);
        });
        // Never forward scanner stderr, which might contain local paths or secrets.
        child.stderr.on("data", () => {});
        child.on("error", () => {
            clearTimeout(timer);
            reject(new Error("Scanner executable could not start."));
        });
        child.on("close", (code) => {
            if (ended) return;
            ended = true;
            clearTimeout(timer);
            if (code !== 0)
                reject(
                    new Error(
                        "Scanner failed; check worker setup, network access, and database download availability.",
                    ),
                );
            else ok(Buffer.concat(chunks).toString("utf8"));
        });
    });
}
const text = (v) => String(v ?? "").slice(0, 7500);
const level = (v) =>
    ["Critical", "High", "Medium", "Low", "Informational"].find(
        (s) => s.toLowerCase() === String(v).toLowerCase(),
    ) || "Unknown";
export function trivyFacts(report, target) {
    const findings = [];
    for (const result of report.Results || []) {
        const file = text(result.Target);
        for (const v of result.Vulnerabilities || [])
            findings.push({
                dns: new URL(target).hostname,
                title: text(`${v.PkgName}: ${v.Title || v.VulnerabilityID}`),
                qid: text(`${v.VulnerabilityID}:${v.PkgName}`),
                cve: text(v.VulnerabilityID),
                severity: level(v.Severity),
                status: "Active",
                scanner: "Trivy",
                url: file,
                confidence: "Scanner reported",
                evidence: text(
                    `Package ${v.PkgName}; installed ${v.InstalledVersion}; fixed version ${v.FixedVersion || "not published"}`,
                ),
                solution: text(
                    v.FixedVersion
                        ? `Update ${v.PkgName} to a supported patched release; scanner fixed version: ${v.FixedVersion}.`
                        : "No fixed version reported. Review vendor guidance and applicability.",
                ),
                threat: text(v.Description),
                vendorReference: text(v.PrimaryURL),
                cvss: text(
                    Object.values(v.CVSS || {})
                        .map((s) => s.V3Score)
                        .find(Boolean) || "",
                ),
            });
        for (const v of result.Misconfigurations || [])
            if (v.Status !== "PASS")
                findings.push({
                    dns: new URL(target).hostname,
                    title: text(v.Title),
                    qid: text(`${v.ID}:${v.CauseMetadata?.StartLine || 0}`),
                    severity: level(v.Severity),
                    status: "Active",
                    scanner: "Trivy",
                    url: file,
                    confidence: "Scanner reported",
                    evidence: text(
                        `Rule ${v.ID}; line ${v.CauseMetadata?.StartLine || "not reported"}`,
                    ),
                    solution: text(v.Resolution),
                    threat: text(v.Description),
                    vendorReference: text(v.PrimaryURL),
                });
        for (const v of result.Secrets || [])
            findings.push({
                dns: new URL(target).hostname,
                title: text(v.Title || "Potential exposed secret"),
                qid: text(`${v.RuleID}:${file}:${v.StartLine}`),
                severity: level(v.Severity),
                status: "Active",
                scanner: "Trivy",
                url: file,
                confidence: "Potential secret — validation required",
                evidence: text(
                    `Rule ${v.RuleID}; lines ${v.StartLine}-${v.EndLine}; matched value redacted`,
                ),
                solution:
                    "Verify the finding without sharing its value. Revoke and rotate any exposed credential, remove it from tracked files, and use a secret store.",
            });
    }
    return findings;
}
export async function scanWebBaseline(job, paths, progress, options = {}) {
    const target = new URL(job.target).origin;
    if (target !== new URL(process.env.SECURITY_SCAN_TARGET_URL).origin)
        throw new Error("Scan target does not match the worker scope.");
    const findings = [],
        coverage = [];
    const profile = options.profile || resolve(".security-tools", "zap-profile");
    await mkdir(profile, { recursive: true });
    const key = randomBytes(32).toString("hex"),
        port = Number(options.port || process.env.SECURITY_ZAP_PORT || 8099);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new Error("Invalid scanner API port.");
    const zap = spawn(
        paths.java,
        [
            "-Xmx512m",
            "-jar",
            paths.zap,
            "-daemon",
            ...(options.silent ? ["-silent"] : []),
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
            "connection.timeoutInSecs=15",
            "-config",
            "autoupdate.checkOnStart=false",
        ],
        { cwd: resolve(paths.zap, ".."), shell: false, windowsHide: true, stdio: "ignore" },
    );
    let startupError = false;
    zap.on("error", () => {
        startupError = true;
    });
    const api = async (group, kind, action, params = {}) => {
        const url = new URL(`http://127.0.0.1:${port}/JSON/${group}/${kind}/${action}/`);
        url.searchParams.set("apikey", key);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
        const r = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error" });
        if (!r.ok) throw new Error("The web scanner API is unavailable.");
        const body = await r.json();
        if (body.code) throw new Error(`Web scanner action failed: ${action}`);
        return body;
    };
    try {
        await progress("Starting ZAP web baseline", 10);
        let version = "";
        for (let i = 0; i < 90; i++) {
            if (startupError || zap.exitCode !== null)
                throw new Error("ZAP stopped before it became ready.");
            try {
                version = (await api("core", "view", "version")).version;
                break;
            } catch {
                await wait(1000);
            }
        }
        if (!version) throw new Error("ZAP did not start in time.");
        await api("core", "action", "newSession", { overwrite: true });
        // Only these GET routes are visited. No login credentials, form submissions, active payloads, or third-party redirects.
        const routes = [
            "/",
            "/sign-in",
            "/dashboard",
            "/service-review-center",
            "/service-review-center/vulnerability-reports",
            "/service-review-center/epace",
            "/service-review-center/eassist",
            "/api/health",
            "/robots.txt",
        ];
        await progress("Checking public pages and response security", 25);
        for (const path of routes)
            await api("core", "action", "accessUrl", {
                url: target + path,
                followRedirects: false,
            });
        for (let i = 0; i < 90; i++) {
            const left = Number((await api("pscan", "view", "recordsToScan")).recordsToScan);
            if (left === 0) break;
            if (i === 89) throw new Error("Passive scanner did not finish processing responses.");
            await wait(1000);
        }
        const alerts =
            (await api("core", "view", "alerts", { baseurl: target, start: 0, count: 1000 }))
                .alerts || [];
        const seen = new Set();
        for (const a of alerts) {
            let url;
            try {
                url = new URL(a.url);
            } catch {
                continue;
            }
            if (url.origin !== target) continue;
            const identity = `${a.pluginId}:${url.pathname}:${a.param || ""}`;
            if (seen.has(identity)) continue;
            seen.add(identity);
            findings.push({
                dns: url.hostname,
                title: text(a.alert),
                qid: text(`zap:${identity}`),
                severity:
                    a.riskcode !== undefined
                        ? ["Informational", "Low", "Medium", "High"][Number(a.riskcode)] ||
                          "Unknown"
                        : level(a.risk),
                status: "Active",
                scanner: "ZAP",
                url: url.origin + url.pathname,
                cwe: text(a.cweid),
                confidence: text(a.confidence),
                evidence: text(
                    `${a.evidence || "Response-based observation"}${a.param ? " · Parameter " + a.param : ""}`,
                ),
                threat: text(a.description),
                solution: text(a.solution),
                vendorReference: text(a.reference),
            });
        }
        coverage.push({
            tool: "ZAP",
            version,
            status: "Completed",
            detail: `Passive response checks on ${routes.length} configured public GET routes at ${target}. Redirects are not followed. Login-protected pages, active XSS/injection tests, business logic, and external services were not tested.`,
        });
    } finally {
        zap.kill();
    }
    return { findings, coverage };
}
export async function scanProject(job, paths, progress) {
    const target = new URL(job.target).origin;
    const { findings, coverage } = await scanWebBaseline(job, paths, progress);
    await progress("Scanning project dependencies, configuration and secrets", 55);
    const source = resolve(process.env.SECURITY_SCAN_SOURCE_DIR || ".");
    const args = [
        "fs",
        "--format",
        "json",
        "--scanners",
        "vuln,misconfig,secret",
        "--timeout",
        "8m",
        "--quiet",
        "--cache-dir",
        resolve(".security-tools", "trivy-cache"),
    ];
    for (const dir of [
        "node_modules",
        ".next",
        ".git",
        ".security-tools",
        ".security-runs",
        "docs/verification",
    ])
        args.push("--skip-dirs", join(source, dir));
    const report = JSON.parse(await processOutput(paths.trivy, [...args, source]));
    const version = JSON.parse(
        await processOutput(paths.trivy, ["version", "--format", "json"], { timeout: 10000 }),
    ).Version;
    findings.push(...trivyFacts(report, target));
    coverage.push({
        tool: "Trivy",
        version: text(version),
        status: "Completed",
        detail: "Configured source checkout: supported dependency lockfiles, infrastructure configuration and potential secrets. Generated files, dependency installations, Git history and scanner binaries are excluded. Secret values are redacted. No running-host or cloud account assessment.",
    });
    coverage.push({
        tool: "Manual / authenticated testing",
        version: "Not applicable",
        status: "Not assessed",
        detail: "Role-based authorization, authenticated workflows, active exploitation and breach investigation require additional scope, accounts and evidence. This is an automated baseline, not a complete pentest.",
    });
    if (findings.length > 5000)
        throw new Error("Scan returned more than 5,000 observations. Narrow the configured scope.");
    await progress("Saving evidence and preparing CSV / Excel reports", 90);
    return { findings, coverage };
}
