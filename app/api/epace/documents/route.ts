import { trustedOrigin } from "@/lib/epace/origin";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { project, record, audit, PaceError } from "@/lib/epace/store";
import { failure } from "../route";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const s = await getRequestSession(request);
  if (!s?.user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const u = new URL(request.url);
    const r = await record(
      s.user.id,
      u.searchParams.get("project") || "",
      u.searchParams.get("id") || "",
      "document",
    );
    return Response.json(r);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  const s = await getRequestSession(request);
  if (!s?.user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!trustedOrigin(request))
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 11000000)
      throw new PaceError("Upload files under 10 MB.", 413);
    const form = await request.formData(),
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
      content = (await (await import("mammoth")).extractRawText({ buffer }))
        .value;
    } else if (["txt", "md", "csv", "json"].includes(ext || ""))
      content = buffer.toString("utf8");
    else throw new PaceError("Use PDF, DOCX, TXT, Markdown, CSV or JSON.");
    content = content.replace(/\u0000/g, "").trim();
    if (!content || content.length > 500000)
      throw new PaceError(
        "File must contain readable text, up to 500,000 characters. Scanned PDFs need OCR first.",
      );
    const id = randomUUID(),
      chunks = [];
    for (let i = 0; i < content.length; i += 1600)
      chunks.push(content.slice(i, i + 2000));
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT id FROM epace_projects WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [p.id, s.user.id],
      );
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
            chunks: chunks.length,
          }),
        ],
      );
      for (let i = 0; i < chunks.length; i++)
        await c.query(
          "INSERT INTO epace_chunks(id,document_id,user_id,project_id,ordinal,content) VALUES($1,$2,$3,$4,$5,$6)",
          [randomUUID(), id, s.user.id, p.id, i, chunks[i]],
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
