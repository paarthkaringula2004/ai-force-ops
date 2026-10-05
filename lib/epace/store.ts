import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  defaultSettings,
  type Settings,
  type Kind,
  type Project,
  type RecordRow,
} from "./types";
export class PaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const kinds: Kind[] = [
  "document",
  "thread",
  "run",
  "filter",
  "component",
  "assessment",
  "alert",
  "prompt",
  "template",
  "radar",
];
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new PaceError("Invalid record ID.");
  return value;
}
export function text(value: unknown, max = 12000, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new PaceError("Enter valid text within the field limit.");
  return value.trim();
}
export function settings(value: unknown): Settings {
  const v = value as Settings;
  if (!v || typeof v !== "object")
    throw new PaceError("Invalid project settings.");
  if (
    !["Hybrid", "Keyword", "Semantic"].includes(v.retrieval) ||
    typeof v.semanticRanker !== "boolean" ||
    typeof v.semanticCaptions !== "boolean" ||
    typeof v.contentSafety !== "boolean"
  )
    throw new PaceError("Invalid retrieval or safety settings.");
  for (const n of ["groundedness", "relevance", "fluency", "coherence"])
    if (
      !Number.isInteger(v.thresholds?.[n]) ||
      v.thresholds[n] < 1 ||
      v.thresholds[n] > 5
    )
      throw new PaceError("Quality thresholds must be 1–5.");
  if (
    !Number.isFinite(v.sampling) ||
    v.sampling < 0 ||
    v.sampling > 1 ||
    !Number.isInteger(v.retention) ||
    v.retention < 1 ||
    v.retention > 365
  )
    throw new PaceError("Invalid sampling rate or retention days.");
  if (!Array.isArray(v.tags) || v.tags.length > 20)
    throw new PaceError("Use at most 20 tags.");
  return {
    ...v,
    model: text(v.model, 200),
    evaluationModel: text(v.evaluationModel, 200),
    prompt: text(v.prompt),
    filterId: v.filterId ? uuid(v.filterId) : "",
    tags: v.tags.map((t) => text(t, 80, true)),
  };
}
export async function project(user: string, id: string): Promise<Project> {
  const { rows } = await db.query(
    "SELECT * FROM epace_projects WHERE user_id=$1 AND id=$2",
    [user, uuid(id)],
  );
  if (!rows[0]) throw new PaceError("Project not found.", 404);
  return { ...rows[0], settings: { ...defaultSettings, ...rows[0].settings } };
}
export async function record(
  user: string,
  projectId: string,
  id: string,
  kind?: Kind,
): Promise<RecordRow> {
  const { rows } = await db.query(
    "SELECT * FROM epace_records WHERE user_id=$1 AND project_id=$2 AND id=$3",
    [user, uuid(projectId), uuid(id)],
  );
  if (!rows[0] || (kind && rows[0].kind !== kind))
    throw new PaceError("Record not found.", 404);
  return rows[0];
}
export async function audit(
  user: string,
  pid: string,
  action: string,
  id?: string,
) {
  await db.query(
    "INSERT INTO epace_audit(id,user_id,project_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), user, pid, action, id || null],
  );
}
export async function put(
  user: string,
  pid: string,
  kind: Kind,
  data: unknown,
  id: string = randomUUID(),
): Promise<string> {
  const result = await db.query(
    `INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() WHERE epace_records.user_id=EXCLUDED.user_id AND epace_records.project_id=EXCLUDED.project_id AND epace_records.kind=EXCLUDED.kind RETURNING id`,
    [id, user, pid, kind, JSON.stringify(data)],
  );
  if (!result.rows.length) throw new PaceError("Record not found.", 404);
  return id;
}
export async function snapshot(user: string, pid?: string | null) {
  const { rows: projects } = await db.query(
    "SELECT * FROM epace_projects WHERE user_id=$1 ORDER BY created_at",
    [user],
  );
  const p = pid ? projects.find((p) => p.id === pid) : projects[0];
  if (pid && !p) throw new PaceError("Project not found.", 404);
  if (p) {
    p.settings = { ...defaultSettings, ...p.settings };
    await db.query(
      `DELETE FROM epace_records WHERE user_id=$1 AND project_id=$2 AND kind IN ('run','alert') AND created_at < now()-($3::int * interval '1 day')`,
      [user, p.id, p.settings.retention],
    );
    await db.query(
      `DELETE FROM epace_records t WHERE t.user_id=$1 AND t.project_id=$2 AND t.kind='thread' AND t.created_at < now()-($3::int * interval '1 day') AND NOT EXISTS (SELECT 1 FROM epace_records r WHERE r.user_id=t.user_id AND r.project_id=t.project_id AND r.kind='run' AND r.data->>'threadId'=t.id::text)`,
      [user, p.id, p.settings.retention],
    );
    await db.query(
      `UPDATE epace_records SET data=data || jsonb_build_object('status','error','error','The server was interrupted before this run completed.','end',now()),updated_at=now() WHERE user_id=$1 AND project_id=$2 AND kind='run' AND data->>'status'='pending' AND created_at < now()-interval '15 minutes'`,
      [user, p.id],
    );
  }
  const records = p
    ? (
        await db.query(
          "SELECT id,user_id,project_id,kind,CASE WHEN kind='document' THEN data-'content' ELSE data END AS data,created_at,updated_at FROM epace_records WHERE user_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 5000",
          [user, p.id],
        )
      ).rows
    : [];
  const logs = p
    ? (
        await db.query(
          "SELECT id,action,created_at FROM epace_audit WHERE user_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 100",
          [user, p.id],
        )
      ).rows
    : [];
  return {
    projects: projects.map((p) => ({
      ...p,
      settings: { ...defaultSettings, ...p.settings },
    })),
    project: p || null,
    records,
    audit: logs,
    providerReady: !!process.env.OPENAI_API_KEY,
    checkedAt: new Date().toISOString(),
  };
}
