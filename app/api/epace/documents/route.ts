import { boundedBody } from "@/lib/epace/runtime";
import { trustedOrigin } from "@/lib/epace/origin";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { project, record, audit, PaceError } from "@/lib/epace/store";
import { failure } from "../route";
export const runtime = "nodejs";
export async function GET(request: Request) {
    const s = await getRequestSession(request);
    if (!s?.user) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        const u = new URL(request.url);
        const r = await record(
            s.user.id,
            u.searchParams.get("project") || "",
            u.searchParams.get("id") || "",
            "document",
        );
        return Response.json(r, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    const s = await getRequestSession(request);
    if (!s?.user) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!trustedOrigin(request))
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    try {
        if (Number(request.headers.get("content-length")) > 11000000)
            throw new PaceError("Upload files under 10 MB.", 413);
        const body = await boundedBody(request, 11000000);
        const form = await new Response(body as BodyInit, {
                headers: { "Content-Type": request.headers.get("content-type") || "" },
            }).formData(),
            p = await project(s.user.id, String(form.get("projectId") || "")),
            file = form.get("file");
        if (!(file instanceof File) || !file.size || file.size > 10000000)
            throw new PaceError("Upload a non-empty file under 10 MB.");
        const ext = file.name.split(".").at(-1)?.toLowerCase();
        const buffer = Buffer.from(await file.arrayBuffer());
        let content = "";
        if (ext === "pdf") {
            const { getData } = await import("pdf-parse/worker");
            const { PDFParse } = await import("pdf-parse");
            PDFParse.setWorker(getData());
            const parser = new PDFParse({ data: buffer });
            try {
                content = (await parser.getText()).text;
            } finally {
                await parser.destroy();
            }
        } else if (ext === "docx") {
            const zip = await (await import("jszip")).default.loadAsync(buffer);
            const entries = Object.values(zip.files);
            if (entries.length > 1000 || !zip.file("word/document.xml"))
                throw new PaceError(
                    "Use a valid DOCX document with at most 1,000 archive entries.",
                );
            let expanded = 0;
            for (const entry of entries) {
                if (entry.dir) continue;
                await new Promise<void>((resolve, reject) => {
                    const stream = entry.nodeStream("nodebuffer");
                    stream.on("data", (chunk: Buffer) => {
                        expanded += chunk.length;
                        if (expanded > 20000000) {
                            stream.pause();
                            if ("destroy" in stream && typeof stream.destroy === "function")
                                stream.destroy();
                            reject(new PaceError("DOCX expanded content exceeds 20 MB.", 413));
                        }
                    });
                    stream.once("end", resolve);
                    stream.once("error", reject);
                });
            }
            content = (await (await import("mammoth")).extractRawText({ buffer })).value;
        } else if (["txt", "md", "csv", "json"].includes(ext || ""))
            content = buffer.toString("utf8");
        else throw new PaceError("Use PDF, DOCX, TXT, Markdown, CSV or JSON.");
        content = content.replace(/\u0000/g, "").trim();
        if (!content || content.length > 500000)
            throw new PaceError(
                "File must contain readable text, up to 500,000 characters. Scanned PDFs need OCR first.",
            );
        const digest = createHash("sha256").update(buffer).digest("hex");
        const id = randomUUID(),
            chunks = [];
        for (let i = 0; i < content.length; i += 1600) chunks.push(content.slice(i, i + 2000));
        const c = await db.connect();
        try {
            await c.query("BEGIN");
            await c.query("SELECT id FROM epace_projects WHERE id=$1 AND user_id=$2 FOR UPDATE", [
                p.id,
                s.user.id,
            ]);
            const duplicate = await c.query(
                "SELECT id,data FROM epace_records WHERE user_id=$1 AND project_id=$2 AND kind='document' AND data->>'sha256'=$3",
                [s.user.id, p.id, digest],
            );
            if (duplicate.rowCount) {
                await c.query("COMMIT");
                return Response.json({
                    id: duplicate.rows[0].id,
                    chunks: duplicate.rows[0].data.chunks,
                    deduplicated: true,
                });
            }
            const count = await c.query(
                "SELECT count(*)::int AS n FROM epace_chunks WHERE user_id=$1 AND project_id=$2",
                [s.user.id, p.id],
            );
            if (count.rows[0].n + chunks.length > 2000)
                throw new PaceError(
                    "This project supports up to 2,000 indexed passages. Remove older documents or create another project.",
                );
            await c.query(
                `INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'document',$4)`,
                [
                    id,
                    s.user.id,
                    p.id,
                    JSON.stringify({
                        name: file.name.slice(0, 180),
                        content,
                        size: file.size,
                        sha256: digest,
                        chunks: chunks.length,
                    }),
                ],
            );
            await c.query(
                "INSERT INTO epace_chunks(id,document_id,user_id,project_id,ordinal,content) SELECT x.id,$2,$3,$4,x.ordinal,x.content FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,ordinal integer,content text)",
                [
                    JSON.stringify(
                        chunks.map((content, ordinal) => ({
                            id: randomUUID(),
                            ordinal,
                            content,
                        })),
                    ),
                    id,
                    s.user.id,
                    p.id,
                ],
            );
            await c.query("COMMIT");
        } catch (e) {
            await c.query("ROLLBACK");
            throw e;
        } finally {
            c.release();
        }
        await audit(s.user.id, p.id, "Uploaded knowledge document", id);
        return Response.json({ id, chunks: chunks.length });
    } catch (e) {
        return failure(e);
    }
}
