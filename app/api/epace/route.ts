import { boundedJson, runtimePolicy } from "@/lib/epace/runtime";
import { trustedOrigin } from "@/lib/epace/origin";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import {
  snapshot,
  project,
  record,
  put,
  audit,
  PaceError,
  text,
  settings,
  uuid,
} from "@/lib/epace/store";
import { defaultSettings, type Kind } from "@/lib/epace/types";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const s = await getRequestSession(request);
  if (!s?.user)
    return Response.json({ error: "Sign in to use ePACE." }, { status: 401 });
  try {
    return Response.json(
      await snapshot(
        s.user.id,
        new URL(request.url).searchParams.get("project"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export function failure(e: unknown) {
  if (e instanceof SyntaxError)
    return Response.json(
      { error: "Send a valid JSON request." },
      { status: 400 },
    );
  return Response.json(
    {
      error:
        e instanceof PaceError
          ? e.message
          : "ePACE could not save or load this request. Please retry.",
    },
    { status: e instanceof PaceError ? e.status : 500 },
  );
}
export async function POST(request: Request) {
  const s = await getRequestSession(request);
  if (!s?.user)
    return Response.json({ error: "Sign in to use ePACE." }, { status: 401 });
  if (!trustedOrigin(request))
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 200000)
      throw new PaceError("Request too large.", 413);
    const b = await boundedJson(request, 200000),
      user = s.user.id;
    if (b.action === "createProject") {
      const id = randomUUID();
      await db.query(
        "INSERT INTO epace_projects(id,user_id,name,settings) VALUES($1,$2,$3,$4)",
        [id, user, text(b.name, 100, true), JSON.stringify(defaultSettings)],
      );
      await audit(user, id, "Created project", id);
      return Response.json({ id });
    }
    const p = await project(user, b.projectId);
    if (b.action === "deleteProject") {
      const client=await db.connect();
      try {
        await client.query("BEGIN");
        const owned=await client.query("SELECT id FROM epace_projects WHERE user_id=$1 AND id=$2 FOR UPDATE",[user,p.id]);
        if(!owned.rowCount) throw new PaceError("Project not found.",404);
        const active=await client.query("SELECT 1 FROM epace_records WHERE user_id=$1 AND project_id=$2 AND kind='run' AND data->>'status'='pending' AND created_at>now()-interval '15 minutes'",[user,p.id]);
        if(active.rowCount) throw new PaceError("Wait for this project's active answer to finish before deleting it.",409);
        await client.query("DELETE FROM epace_projects WHERE user_id=$1 AND id=$2",[user,p.id]);
        await client.query("COMMIT");
      } catch(error){await client.query("ROLLBACK");throw error;}
      finally{client.release();}
      return Response.json({deleted:true,id:p.id});
    }
    if (b.action === "settings") {
      const v = settings(b.settings);
      if (runtimePolicy().requireSafety && !v.contentSafety)
        throw new PaceError(
          "Input and output safety checks are required by the production policy.",
          403,
        );
      if (v.filterId) await record(user, p.id, v.filterId, "filter");
      await db.query(
        "UPDATE epace_projects SET settings=$3,updated_at=now() WHERE user_id=$1 AND id=$2",
        [user, p.id, JSON.stringify(v)],
      );
      await audit(user, p.id, "Updated generation and retention settings");
    } else if (b.action === "renameProject") {
      await db.query(
        "UPDATE epace_projects SET name=$3,updated_at=now() WHERE user_id=$1 AND id=$2",
        [user, p.id, text(b.name, 100, true)],
      );
      await audit(user, p.id, "Renamed project");
    } else if (b.action === "delete") {
      const r = await record(user, p.id, b.id);
      if (r.kind === "run")
        throw new PaceError(
          "Runs are kept until the retention period expires.",
        );
      const c = await db.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          "DELETE FROM epace_records WHERE user_id=$1 AND project_id=$2 AND id=$3",
          [user, p.id, r.id],
        );
        if (r.kind === "thread") {
          const active = await c.query(
            `SELECT 1 FROM epace_records WHERE user_id=$1 AND project_id=$2 AND kind='run' AND data->>'threadId'=$3 AND data->>'status'='pending' AND created_at>now()-interval '15 minutes'`,
            [user, p.id, r.id],
          );
          if (active.rowCount)
            throw new PaceError(
              "Wait for this conversation's active answer to finish before deleting it.",
              409,
            );
          await c.query(
            `DELETE FROM epace_records a WHERE a.user_id=$1 AND a.project_id=$2 AND a.kind='alert' AND a.data->>'runId' IN (SELECT id::text FROM epace_records WHERE user_id=$1 AND project_id=$2 AND kind='run' AND data->>'threadId'=$3)`,
            [user, p.id, r.id],
          );
          await c.query(
            `DELETE FROM epace_records WHERE user_id=$1 AND project_id=$2 AND kind='run' AND data->>'threadId'=$3`,
            [user, p.id, r.id],
          );
        }
        if (r.kind === "filter")
          await c.query(
            `UPDATE epace_projects SET settings=jsonb_set(settings,'{filterId}','""'::jsonb) WHERE id=$1 AND user_id=$2 AND settings->>'filterId'=$3`,
            [p.id, user, r.id],
          );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      await audit(user, p.id, `Deleted ${r.kind}`, r.id);
    } else if (b.action === "feedback") {
      const r = await record(user, p.id, b.id, "run");
      const scores: Record<string, number> = {};
      for (const k of ["groundedness", "relevance", "fluency", "coherence"]) {
        const v = b.scores?.[k];
        if (!Number.isInteger(v) || v < 1 || v > 5)
          throw new PaceError("Feedback scores must be 1–5.");
        scores[k] = v;
      }
      await put(user, p.id, "run", { ...r.data, feedback: scores }, r.id);
      await audit(user, p.id, "Submitted human feedback", r.id);
    } else if (b.action === "testAlert") {
      const id = await put(user, p.id, "alert", {
        name:"Test alert: ePACE in-app delivery", test:true,
        metrics:{}, thresholds:{}, context:[], resolved:false, delivery:"In-app",
        input:"User-requested alert delivery test.",
        output:"This is a test notification. No model evaluation, safety failure or service incident occurred.",
      });
      await audit(user, p.id, "Created test quality alert", id);
      return Response.json({id, test:true});
    } else if (b.action === "resolveAlert") {
      const r = await record(user, p.id, b.id, "alert");
      await put(user, p.id, "alert", { ...r.data, resolved: true }, r.id);
      await audit(user, p.id, "Acknowledged alert", r.id);
    } else if (b.action === "save") {
      const kind = b.kind as Kind;
      if (
        ![
          "filter",
          "component",
          "assessment",
          "prompt",
          "template",
          "radar",
        ].includes(kind)
      )
        throw new PaceError("Unsupported record type.");
      const v = b.data;
      if (!v || typeof v !== "object") throw new PaceError("Invalid record.");
      const data: Record<string, unknown> = { name: text(v.name, 100, true) };
      if (kind === "filter") {
        data.deployment = text(v.deployment || "", 200);
        data.blocklist = text(v.blocklist || "", 4000);
        data.input = {};
        data.output = {};
        for (const side of ["input", "output"])
          for (const cat of ["Violence", "Hate", "Sexual", "Self-harm"]) {
            const rule = v[side]?.[cat];
            if (
              !rule ||
              !["Annotate", "Block"].includes(rule.action) ||
              !["Low", "Medium", "High"].includes(rule.threshold)
            )
              throw new PaceError(
                "Set a valid threshold and action for every category.",
              );
            (data[side] as Record<string, unknown>)[cat] = {
              action: rule.action,
              threshold: rule.threshold,
            };
          }
      } else if (kind === "assessment") {
        const evidence: Record<string, { score: number; note: string }> = {};
        for (const key of [
          "Platform",
          "Observability / Monitoring",
          "Use-case onboarding",
          "Automation",
          "Operations",
          "Governance / AI ethics",
        ]) {
          const e = v.evidence?.[key];
          if (!e || !Number.isInteger(e.score) || e.score < 0 || e.score > 5)
            throw new PaceError("Assessment ratings must be 0–5.");
          if (e.score > 0 && (typeof e.note !== "string" || !e.note.trim()))
            throw new PaceError(`Add evidence for the ${key} rating.`);
          evidence[key] = {
            score: e.score,
            note: text(e.note, 2000, e.score > 0),
          };
        }
        data.evidence = evidence;
        data.stage = text(v.stage, 40, true);
        if (!["Design & build", "Onboard & stabilize", "Operate & improve"].includes(data.stage as string))
          throw new PaceError("Choose a valid lifecycle stage.");
      } else {
        for (const key of [
          "description",
          "owner",
          "category",
          "repo",
          "api",
          "docs",
          "stage",
          "lifecycle",
          "prompt",
          "model",
          "instructions",
          "ring",
        ])
          data[key] = text(
            v[key] || "",
            key === "prompt" || key === "instructions" ? 12000 : 2000,
          );
        for (const key of ["repo", "api", "docs"])
          if (data[key]) {
            let url: URL;
            try {
              url = new URL(data[key] as string);
            } catch {
              throw new PaceError("Use a valid HTTP or HTTPS URL.");
            }
            if (!["https:", "http:"].includes(url.protocol))
              throw new PaceError("Use an HTTP or HTTPS URL.");
          }
        data.starred = v.starred === true;
        if (kind === "component") {
          data.lifecycle = data.lifecycle || "Design & build";
          data.owner = text(v.owner, 100, true);
          if (
            ![
              "Design & build",
              "Onboard & stabilize",
              "Operate & improve",
            ].includes(String(data.lifecycle))
          )
            throw new PaceError("Choose a valid lifecycle stage.");
        }
        if (
          kind === "radar" &&
          !["Adopt", "Trial", "Assess", "Hold"].includes(String(data.ring))
        )
          throw new PaceError("Choose a valid adoption ring.");
        if (kind === "prompt" && !data.prompt)
          throw new PaceError("Prompt instructions are required.");
      }
      const id = b.id ? uuid(b.id) : randomUUID();
      if (b.id) await record(user, p.id, id, kind);
      await put(user, p.id, kind, data, id);
      await audit(user, p.id, `Saved ${kind}`, id);
      return Response.json({ id });
    } else throw new PaceError("Unknown action.");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
