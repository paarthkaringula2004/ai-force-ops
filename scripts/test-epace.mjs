import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import ts from "typescript";
import { readFile } from "node:fs/promises";
const base = process.env.EPACE_TEST_URL || "http://localhost:3000",
    users = [],
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function call(cookie, path, body, expected = 200, origin = base) {
    const r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            Origin: origin,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, expected, `${path}: ${data.error || "unexpected status"}`);
    return data;
}
async function account() {
    const r = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Disposable ePACE verification",
            email: `epace-${randomUUID()}@example.invalid`,
            password: randomUUID() + "A1!",
        }),
    });
    const data = await r.json();
    assert.equal(r.status, 200, "Test account creation failed");
    users.push(data.user.id);
    return r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
}
async function upload(cookie, pid, name, content, expected = 200) {
    const f = new FormData();
    f.set("projectId", pid);
    f.set("file", new File([content], name));
    const r = await fetch(base + "/api/epace/documents", {
        method: "POST",
        headers: { Cookie: cookie, Origin: base },
        body: f,
    });
    const d = await r.json();
    assert.equal(r.status, expected, d.error);
    return d;
}
let checks = 0;
const pass = (name) => {
    checks++;
    console.log("PASS " + name);
};
try {
    const source = await readFile(new URL("../lib/epace/analytics.ts", import.meta.url), "utf8");
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext },
    }).outputText;
    const analytics = await import(
        "data:text/javascript;base64," + Buffer.from(js).toString("base64")
    );
    assert.equal(analytics.percentile([], 0.5), null);
    assert.equal(analytics.percentile([90, 10, 40], 0.5), 40);
    assert.equal(analytics.summarize([]).errorRate, null);
    assert.equal(
        analytics.series([], 24, (rs) => rs.length).reduce((n, b) => n + b.value, 0),
        0,
    );
    pass("analytics preserve missing measurements and actual percentiles");
    await call("", "/api/epace", undefined, 401);
    pass("unauthenticated requests rejected");
    const a = await account(),
        b = await account();
    const { id: pid } = await call(a, "/api/epace", {
        action: "createProject",
        name: "Disposable QA project",
    });
    const snap = await call(a, `/api/epace?project=${pid}`);
    assert.equal(snap.project.name, "Disposable QA project");
    assert.equal(snap.records.length, 0);
    pass("project creation and persistence without seeded records");
    await call(b, `/api/epace?project=${pid}`, undefined, 404);
    await call(
        b,
        "/api/epace",
        { action: "renameProject", projectId: pid, name: "Forbidden" },
        404,
    );
    await call(
        a,
        "/api/epace",
        { action: "renameProject", projectId: pid, name: "Forbidden" },
        403,
        "https://untrusted.example",
    );
    pass("cross-account reads, writes and cross-origin mutations rejected");
    await call(a, "/api/epace", { action: "settings", projectId: pid, settings: null }, 400);
    await call(
        a,
        "/api/epace",
        {
            action: "settings",
            projectId: pid,
            settings: { ...snap.project.settings, maxOutputTokens: 8001 },
        },
        400,
    );
    await call(
        a,
        "/api/epace",
        {
            action: "settings",
            projectId: pid,
            settings: { ...snap.project.settings, requireEvidence: "true" },
        },
        400,
    );
    await call(
        a,
        "/api/epace",
        {
            action: "settings",
            projectId: pid,
            settings: { ...snap.project.settings, contentSafety: false },
        },
        403,
    );
    pass("malformed settings, invalid output/evidence controls and disabled safety rejected");
    const oversized = await fetch(base + "/api/epace", {
        method: "POST",
        headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
        duplex: "half",
        body: new ReadableStream({
            start(c) {
                c.enqueue(
                    new TextEncoder().encode(JSON.stringify({ payload: "x".repeat(210000) })),
                );
                c.close();
            },
        }),
    });
    assert.equal(oversized.status, 413);
    pass("actual streamed request size enforced without Content-Length");
    await call(b, `/api/epace/readiness?project=${pid}`, undefined, 404);
    await call(a, "/api/epace/readiness", { projectId: pid }, 403, "https://untrusted.example");
    const readiness = await call(a, `/api/epace/readiness?project=${pid}`);
    assert.ok(readiness.checks.some((c) => c.id === "evidence" && c.state === "attention"));
    assert.ok(readiness.manual.some((c) => c.name === "Company security requirements"));
    assert.ok(!JSON.stringify(readiness).includes(process.env.OPENAI_API_KEY));
    pass("readiness uses actual coverage, hides credentials and enforces account/origin isolation");

    const document = await upload(
        a,
        pid,
        "qa-knowledge.md",
        "Disposable test evidence: the approved service maintenance window is Saturday 02:00–03:00 UTC. This is fictional verification data, not an operational record.",
    );
    const doc = await call(a, `/api/epace/documents?project=${pid}&id=${document.id}`);
    assert.match(doc.data.content, /Saturday/);
    await call(b, `/api/epace/documents?project=${pid}&id=${document.id}`, undefined, 404);
    await upload(a, pid, "invalid.exe", "not a document", 400);
    pass("document indexing, source retrieval, type validation and ownership");
    const again = await upload(a, pid, "renamed-duplicate.md", doc.data.content);
    assert.equal(again.id, document.id);
    assert.equal(again.deduplicated, true);
    const countAfterDuplicate = await pool.query(
        "SELECT count(*)::int AS n FROM epace_chunks WHERE document_id=$1",
        [document.id],
    );
    assert.equal(countAfterDuplicate.rows[0].n, document.chunks);
    pass("duplicate file does not multiply stored passages");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
        "[Content_Types].xml",
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
        "_rels/.rels",
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
        "word/document.xml",
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Disposable DOCX extraction evidence.</w:t></w:r></w:p></w:body></w:document>',
    );
    await upload(a, pid, "qa.docx", await zip.generateAsync({ type: "nodebuffer" }));
    pass("DOCX extraction");
    const bomb = new JSZip();
    bomb.file("word/document.xml", "x".repeat(20001000));
    await upload(
        a,
        pid,
        "oversized-expanded.docx",
        await bomb.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
        413,
    );
    pass("compressed DOCX expansion limit rejects an oversized archive");

    const pdfObjects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    const pdfStream = "BT /F1 12 Tf 50 750 Td (Disposable PDF extraction evidence.) Tj ET";
    pdfObjects.push("<< /Length " + pdfStream.length + " >>\nstream\n" + pdfStream + "\nendstream");
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let i = 0; i < pdfObjects.length; i++) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += i + 1 + " 0 obj\n" + pdfObjects[i] + "\nendobj\n";
    }
    const xref = Buffer.byteLength(pdf);
    pdf +=
        "xref\n0 6\n0000000000 65535 f \n" +
        offsets
            .slice(1)
            .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
            .join("") +
        "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
        xref +
        "\n%%EOF";
    await upload(a, pid, "qa.pdf", Buffer.from(pdf));
    pass("PDF extraction with real parser");

    const rules = Object.fromEntries(
        ["Violence", "Hate", "Sexual", "Self-harm"].map((c) => [
            c,
            { action: "Block", threshold: "Low" },
        ]),
    );
    const filter = await call(a, "/api/epace", {
        action: "save",
        projectId: pid,
        kind: "filter",
        data: {
            name: "QA filter",
            input: rules,
            output: rules,
            blocklist: "EXACT_QA_BLOCK",
            deployment: "",
        },
    });
    const config = { ...snap.project.settings, filterId: filter.id };
    await call(a, "/api/epace", {
        action: "settings",
        projectId: pid,
        settings: config,
    });
    await call(
        a,
        "/api/epace",
        {
            action: "settings",
            projectId: pid,
            settings: { ...config, sampling: 2 },
        },
        400,
    );
    pass("filter persistence, activation and settings validation");
    const component = await call(a, "/api/epace", {
        action: "save",
        projectId: pid,
        kind: "component",
        data: {
            name: "QA service",
            owner: "QA",
            lifecycle: "Design & build",
            repo: "https://example.org/repo",
        },
    });
    await call(a, "/api/epace", {
        action: "save",
        projectId: pid,
        kind: "component",
        id: component.id,
        data: { name: "QA changed", owner: "QA" },
    });
    assert.ok(
        (await call(a, `/api/epace?project=${pid}`)).records.some(
            (r) => r.id === component.id && r.data.name === "QA changed",
        ),
    );
    await call(
        a,
        "/api/epace",
        {
            action: "save",
            projectId: pid,
            kind: "component",
            data: { name: "Invalid", repo: "javascript:alert(1)" },
        },
        400,
    );
    pass("catalog CRUD and unsafe URL rejection");
    const starterResponse = await fetch(
        `${base}/api/epace/scaffold?project=${pid}&id=${component.id}`,
        { headers: { Cookie: a } },
    );
    assert.equal(starterResponse.status, 200);
    const starterZip = await JSZip.loadAsync(await starterResponse.arrayBuffer());
    assert.ok(starterZip.file("backend/server.mjs"));
    assert.ok(starterZip.file("frontend/index.html"));
    const generated = await starterZip.file("backend/server.mjs").async("string");
    const parsed = ts.createSourceFile(
        "server.mjs",
        generated,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
    );
    assert.equal(parsed.parseDiagnostics.length, 0);
    assert.match(generated, /SERVICE_TOKEN/);
    assert.match(generated, /moderations/);
    await call(b, `/api/epace/scaffold?project=${pid}&id=${component.id}`, undefined, 404);
    pass("runnable starter archive, JavaScript syntax, authentication and download ownership");

    const eventResponse = await fetch(`${base}/api/epace/events?project=${pid}`, {
        headers: { Cookie: a },
        signal: AbortSignal.timeout(15000),
    });
    assert.equal(eventResponse.headers.get("content-type"), "text/event-stream");
    const eventReader = eventResponse.body.getReader();
    const first = await eventReader.read();
    assert.match(new TextDecoder().decode(first.value), /QA service|QA changed/);
    await eventReader.cancel();
    pass("live event stream emits persisted project data");
    if (process.argv.includes("--live")) {
        const modelData = await call(a, "/api/playground/models");
        const model = modelData.models.includes("gpt-4o-mini")
            ? "gpt-4o-mini"
            : modelData.models.find((m) => /^gpt-.*mini/.test(m));
        assert.ok(model, "No accessible text model available for live verification");
        await call(a, "/api/epace", {
            action: "settings",
            projectId: pid,
            settings: {
                ...config,
                model,
                sampling: 1,
                retrieval: "Hybrid",
                semanticRanker: true,
                semanticCaptions: true,
                thresholds: { groundedness: 5, relevance: 5, fluency: 5, coherence: 5 },
            },
        });

        const preflight = await call(a, "/api/epace/readiness", { projectId: pid });
        assert.ok(preflight.readiness.checks.every((c) => c.source));
        assert.equal(preflight.readiness.checks.find((c) => c.id === "probe").state, "passed");
        const checked = await call(a, `/api/epace/readiness?project=${pid}`);
        assert.equal(checked.checks.find((c) => c.id === "probe").state, "passed");
        pass("real provider preflight verifies selected models, moderation and embeddings");
        const chatRequestId = randomUUID();
        const r = await fetch(`${base}/api/epace/chat`, {
            method: "POST",
            headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify({
                projectId: pid,
                requestId: chatRequestId,
                question:
                    "According to the test evidence, when is the approved service maintenance window?",
            }),
            signal: AbortSignal.timeout(240000),
        });
        assert.equal(r.status, 200);
        const body = await r.text();
        assert.match(body, /event: done/, "Live model run failed");
        assert.doesNotMatch(
            body,
            /event: delta/,
            "Safety-enabled output must be held until moderation",
        );
        const now = await call(a, `/api/epace?project=${pid}`);
        const run = now.records.find((r) => r.kind === "run" && r.data.status === "success");
        assert.ok(run);
        assert.match(run.data.output, /Saturday/);
        assert.ok(run.data.totalTokens > 0);
        assert.ok(run.data.sources.length);
        assert.equal(run.data.moderation.length, 2);
        assert.ok(run.data.evaluation, "Live evaluator did not return valid scores");
        assert.ok(run.data.spans.some((s) => s.kind === "llm"));
        pass(
            "live hybrid retrieval, ranking, captions, generation, input/output moderation, evaluation and trace persistence",
        );
        await call(a, "/api/epace", {
            action: "feedback",
            projectId: pid,
            id: run.id,
            scores: { groundedness: 4, relevance: 4, fluency: 4, coherence: 4 },
        });
        await call(
            b,
            "/api/epace",
            {
                action: "feedback",
                projectId: pid,
                id: run.id,
                scores: { groundedness: 4, relevance: 4, fluency: 4, coherence: 4 },
            },
            404,
        );
        pass("human feedback persistence and isolation");
        await call(
            a,
            "/api/epace/chat",
            {
                projectId: pid,
                requestId: chatRequestId,
                question: "Do not execute a duplicate",
            },
            409,
        );
        pass("duplicate chat request is rejected before another provider run");
        const empty = await call(a, "/api/epace", {
            action: "createProject",
            name: "Disposable empty knowledge test",
        });
        await call(a, "/api/epace", {
            action: "settings",
            projectId: empty.id,
            settings: { ...snap.project.settings, model },
        });
        const noEvidence = await fetch(base + "/api/epace/chat", {
            method: "POST",
            headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify({
                projectId: empty.id,
                question: "What is the approved service maintenance time?",
            }),
        });
        const missingBody = await noEvidence.text();
        assert.match(missingBody, /event: done/);
        assert.match(missingBody, /insufficient_evidence/);
        const missing = await call(a, `/api/epace?project=${empty.id}`);
        assert.equal(
            missing.records.find((r) => r.kind === "run").data.spans.filter((s) => s.kind === "llm")
                .length,
            0,
        );
        pass(
            "empty knowledge gives an evidence notice without model generation or invented evaluation",
        );

        const safety = await call(a, "/api/epace/moderate", {
            projectId: pid,
            text: "EXACT_QA_BLOCK harmless disposable verification string",
        });
        assert.equal(safety.blocked, true);
        pass("live moderation and exact blocklist enforcement");
        const blocked = await fetch(`${base}/api/epace/chat`, {
            method: "POST",
            headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify({
                projectId: pid,
                question: "EXACT_QA_BLOCK harmless verification",
            }),
        });
        assert.match(await blocked.text(), /"status":"blocked"/);
        assert.ok(
            (await call(a, `/api/epace?project=${pid}`)).records.some((r) => r.kind === "alert"),
        );
        pass("blocked chat creates actual in-app safety alert");
        const cancellationId = randomUUID(),
            abort = new AbortController();
        const cancellation = await fetch(base + "/api/epace/chat", {
            method: "POST",
            headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify({
                projectId: pid,
                requestId: cancellationId,
                question: "Summarize all the evidence carefully.",
            }),
            signal: abort.signal,
        });
        assert.equal(cancellation.status, 200);
        const cancelReader = cancellation.body.getReader();
        await cancelReader.read();
        abort.abort();
        let cancelled;
        for (let i = 0; i < 12; i++) {
            cancelled = (
                await pool.query("SELECT data FROM epace_records WHERE id=$1", [cancellationId])
            ).rows[0]?.data;
            if (cancelled?.status === "error") break;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        assert.equal(cancelled?.status, "error");
        assert.equal(cancelled.output, "");
        pass(
            "client cancellation stops provider work and saves an interrupted trace without answer text",
        );
    }

    const threadFixture = randomUUID(),
        runFixture = randomUUID(),
        alertFixture = randomUUID();
    for (const [id, kind, data] of [
        [threadFixture, "thread", { name: "Disposable deletion verification" }],
        [
            runFixture,
            "run",
            {
                threadId: threadFixture,
                status: "pending",
                input: "Disposable fixture",
                output: "",
            },
        ],
        [alertFixture, "alert", { runId: runFixture, input: "Disposable fixture" }],
    ]) {
        await pool.query(
            "INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,$4,$5)",
            [id, users[0], pid, kind, JSON.stringify(data)],
        );
    }
    await call(a, "/api/epace", { action: "delete", projectId: pid, id: threadFixture }, 409);
    assert.equal(
        (
            await pool.query("SELECT count(*)::int AS n FROM epace_records WHERE id=$1", [
                threadFixture,
            ])
        ).rows[0].n,
        1,
    );
    await pool.query(
        "UPDATE epace_records SET data=jsonb_set(data,'{status}','\"success\"'::jsonb) WHERE id=$1",
        [runFixture],
    );
    await call(a, "/api/epace", {
        action: "delete",
        projectId: pid,
        id: threadFixture,
    });
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int AS n FROM epace_records WHERE id=ANY($1::uuid[])",
                [[threadFixture, runFixture, alertFixture]],
            )
        ).rows[0].n,
        0,
    );
    pass(
        "active conversation deletion is blocked and completed deletion removes related alerts and runs",
    );
    // Fill this disposable account's real limiter window; no provider request should escape.
    await pool.query(
        "INSERT INTO epace_request_limits(user_id,window_start,window_kind,requests) VALUES($1,date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC','day',200) ON CONFLICT(user_id,window_start,window_kind) DO UPDATE SET requests=200",
        [users[0]],
    );
    await call(a, "/api/epace", {
        action: "settings",
        projectId: pid,
        settings: { ...config, model: "gpt-4o-mini" },
    });
    await call(
        a,
        "/api/epace/chat",
        { projectId: pid, question: "Must not reach a provider" },
        429,
    );
    pass("persistent per-account daily limiter blocks provider admission");
    await pool.query("DELETE FROM epace_request_limits WHERE user_id=$1", [users[0]]);
    await pool.query(
        "INSERT INTO usage_events(id,user_id,source,model_id,input_tokens,output_tokens,total_tokens) VALUES($1,$2,'epace','disposable-budget-fixture',500000,0,500000)",
        [randomUUID(), users[0]],
    );
    await call(
        a,
        "/api/epace/chat",
        { projectId: pid, question: "Must not exceed token allowance" },
        429,
    );
    pass("recorded daily token allowance blocks the next provider request");

    await call(a, "/api/epace", {
        action: "delete",
        projectId: pid,
        id: filter.id,
    });
    assert.equal((await call(a, `/api/epace?project=${pid}`)).project.settings.filterId, "");
    await call(a, "/api/epace", {
        action: "delete",
        projectId: pid,
        id: document.id,
    });
    const chunks = await pool.query(
        "SELECT count(*)::int AS n FROM epace_chunks WHERE document_id=$1",
        [document.id],
    );
    assert.equal(chunks.rows[0].n, 0);
    pass("filter deactivation and document chunk cascading deletion");
    console.log(`Completed ${checks} ePACE verification checks.`);
} finally {
    if (users.length) await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
    await pool.end();
    console.log("Disposable verification accounts and their data removed.");
}
