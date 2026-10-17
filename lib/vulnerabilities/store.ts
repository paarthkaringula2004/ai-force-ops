import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { PaceError } from "@/lib/epace/store";
import { fields, type Facts, type Mapping } from "./schema";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function normalizeSeverity(value: string) {
    const levels = ["Informational", "Low", "Medium", "High", "Critical"];
    if (/^[1-5]$/.test(value)) return levels[Number(value) - 1];
    return (
        levels.find((s) => s.toLowerCase() === value.toLowerCase()) ||
        (/moderate/i.test(value)
            ? "Medium"
            : /info|none/i.test(value)
              ? "Informational"
              : "Unknown")
    );
}
const uuid = (v: unknown): v is string =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function saveReport(user: string, body: Record<string, unknown>) {
    if (!uuid(body.id)) throw new PaceError("A report preview is required.");
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";
    const stamp = typeof body.scannedAt === "string" ? new Date(body.scannedAt) : new Date(NaN);
    if (!scope || scope.length > 80)
        throw new PaceError("Enter a scan source / scope up to 80 characters.");
    if (!Number.isFinite(stamp.getTime()) || stamp.getTime() > Date.now() + 300000)
        throw new PaceError(
            "Enter the actual scan timestamp; future timestamps are not supported.",
        );
    if (!body.mapping || typeof body.mapping !== "object" || Array.isArray(body.mapping))
        throw new PaceError("Column mapping is required.");
    const mapping = body.mapping as Mapping,
        c = await db.connect();
    try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            "vulnerabilities:" + user,
        ]);
        const result = await c.query(
            "SELECT * FROM vulnerability_imports WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [body.id, user],
        );
        const preview = result.rows[0];
        if (!preview) throw new PaceError("Preview not found.", 404);
        if (preview.status === "saved") {
            await c.query("COMMIT");
            return Response.json(preview.result);
        }
        if (Date.now() - new Date(preview.created_at).getTime() > 86400000)
            throw new PaceError("Preview expired. Upload the file again.", 410);
        const headers = preview.headers as string[],
            rows = preview.rows as string[][];
        for (const [key, value] of Object.entries(mapping)) {
            if (
                !fields.some((f) => f[0] === key) ||
                typeof value !== "string" ||
                (value && !headers.includes(value))
            )
                throw new PaceError("The column mapping contains an invalid selection.");
        }
        if (!mapping.title || (!mapping.ip && !mapping.dns))
            throw new PaceError("Map a finding title and an IP address or hostname.");
        const seen = new Map<string, { facts: Facts; hash: string; row: number }>();
        let duplicates = 0;
        rows.forEach((row, index) => {
            const facts = {
                ...Object.fromEntries(
                    fields.map(([k]) => [
                        k,
                        mapping[k] ? row[headers.indexOf(mapping[k]!)] || "" : "",
                    ]),
                ),
                raw: Object.fromEntries(headers.map((h, i) => [h, row[i] || ""])),
            } as Facts;
            if (!facts.title || (!facts.ip && !facts.dns))
                throw new PaceError(`Row ${index + 2}: finding title and asset are required.`, 422);
            facts.severity = normalizeSeverity(facts.severity);
            facts.status = /^(fixed|resolved|closed)$/i.test(facts.status)
                ? "Fixed"
                : /^(active|open|new|reopened)$/i.test(facts.status)
                  ? "Active"
                  : facts.status || "Unknown";
            const identity = hash(
                JSON.stringify([
                    (facts.ip || facts.dns).toLowerCase(),
                    facts.qid || facts.cve || facts.title.toLowerCase(),
                    facts.port,
                    facts.protocol.toLowerCase(),
                ]),
            );
            // A new scan time does not change an otherwise identical Nmap observation.
            const comparable = { ...facts, raw: { ...facts.raw } };
            delete comparable.raw["Scan timestamp"];
            const factHash = hash(JSON.stringify(comparable));
            const prior = seen.get(identity);
            if (prior && prior.hash !== factHash)
                throw new PaceError(
                    `Rows ${prior.row} and ${index + 2} conflict for the same finding. Resolve the conflict before importing.`,
                    422,
                );
            if (prior) duplicates++;
            else seen.set(identity, { facts, hash: factHash, row: index + 2 });
        });
        const existingRows = await c.query(
            "SELECT id,identity,facts_hash,scanned_at FROM vulnerability_findings WHERE user_id=$1 AND scope=$2 AND identity=ANY($3::text[])",
            [user, scope, [...seen.keys()]],
        );
        const byIdentity = new Map(existingRows.rows.map((r) => [r.identity, r]));
        const total = await c.query(
            "SELECT count(*)::int AS count FROM vulnerability_findings WHERE user_id=$1",
            [user],
        );
        if (total.rows[0].count + seen.size - existingRows.rows.length > 50000)
            throw new PaceError("Account finding limit reached. Contact your administrator.", 413);
        const counts = { created: 0, updated: 0, unchanged: 0, older: 0, duplicates };
        const changes: { id: string; identity: string; facts: Facts; facts_hash: string }[] = [],
            unchanged: string[] = [];
        for (const [identity, item] of seen) {
            const existing = byIdentity.get(identity);
            if (existing && new Date(existing.scanned_at) > stamp) {
                counts.older++;
                continue;
            }
            if (existing && existing.facts_hash === item.hash) {
                counts.unchanged++;
                unchanged.push(existing.id);
                continue;
            }
            if (existing) counts.updated++;
            else counts.created++;
            changes.push({
                id: existing?.id || randomUUID(),
                identity,
                facts: item.facts,
                facts_hash: item.hash,
            });
        }
        if (unchanged.length)
            await c.query(
                "UPDATE vulnerability_findings SET scanned_at=$2,import_id=$3 WHERE user_id=$1 AND id=ANY($4::uuid[])",
                [user, stamp, body.id, unchanged],
            );
        if (changes.length) {
            const payload = JSON.stringify(changes);
            await c.query(
                `INSERT INTO vulnerability_findings(id,user_id,scope,identity,facts,facts_hash,scanned_at,import_id)
    SELECT x.id,$1,$2,x.identity,x.facts,x.facts_hash,$3,$4 FROM jsonb_to_recordset($5::jsonb) AS x(id uuid,identity text,facts jsonb,facts_hash text)
    ON CONFLICT(user_id,scope,identity) DO UPDATE SET facts=excluded.facts,facts_hash=excluded.facts_hash,scanned_at=excluded.scanned_at,import_id=excluded.import_id,analysis=NULL,analysis_hash=NULL,analysis_model=NULL,analyzed_at=NULL,analysis_started_at=NULL,updated_at=now()`,
                [user, scope, stamp, body.id, payload],
            );
            await c.query(
                "INSERT INTO vulnerability_revisions(finding_id,import_id,facts,scanned_at) SELECT x.id,$1,x.facts,$2 FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,facts jsonb)",
                [body.id, stamp, payload],
            );
            await c.query(
                `INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail,href)
    SELECT $1,'review-center','vulnerability:'||x.id,CASE WHEN x.facts->>'severity'='Critical' THEN 'critical' ELSE 'warning' END,left(x.facts->>'title',250),$2||' · '||coalesce(nullif(x.facts->>'ip',''),x.facts->>'dns')||' · Scanner severity: '||(x.facts->>'severity'),'/service-review-center/eassist?view=automated-alerts'
    FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,facts jsonb) WHERE x.facts->>'severity' IN ('Critical','High') AND x.facts->>'status'<>'Fixed'
    ON CONFLICT(user_id,source,event_key) DO UPDATE SET severity=excluded.severity,summary=excluded.summary,detail=excluded.detail,state=CASE WHEN platform_alerts.state='acknowledged' AND platform_alerts.detail=excluded.detail AND platform_alerts.summary=excluded.summary AND platform_alerts.severity=excluded.severity THEN 'acknowledged' ELSE 'active' END,updated_at=now()`,
                [user, scope, payload],
            );
            await c.query(
                `UPDATE platform_alerts SET state='resolved',updated_at=now() WHERE user_id=$1 AND source='review-center' AND event_key IN
    (SELECT 'vulnerability:'||x.id FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,facts jsonb) WHERE x.facts->>'status'='Fixed' OR x.facts->>'severity' NOT IN ('Critical','High','Unknown'))`,
                [user, payload],
            );
        }
        await c.query(
            "UPDATE vulnerability_imports SET status='saved',scope=$2,mapping=$3::jsonb,result=$4::jsonb,rows=NULL WHERE id=$1",
            [body.id, scope, JSON.stringify(mapping), JSON.stringify(counts)],
        );
        if (counts.created || counts.updated)
            await c.query(
                "INSERT INTO platform_events(user_id,source,action,resource_id,status,summary,href) VALUES($1,'review-center','Vulnerability report imported',$2,'success',$3,'/service-review-center/eassist?view=automated-alerts')",
                [
                    user,
                    body.id,
                    `${preview.filename}: ${counts.created} new, ${counts.updated} updated findings.`,
                ],
            );
        await c.query("COMMIT");
        return Response.json(counts);
    } catch (error) {
        await c.query("ROLLBACK");
        throw error;
    } finally {
        c.release();
    }
}
