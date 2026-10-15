import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { WorkspaceAccess } from './workspace-permissions';

export async function organizationOwner() {
 const row=(await db.query('SELECT owner_id FROM organization_workspace WHERE id=true')).rows[0];
 return row?.owner_id as string|null;
}
export async function organizationEvent(actor:string|null,role:string,kind:string,path:string,method:string,summary:string,severity='info') {
 await db.query('INSERT INTO organization_security_events(id,actor_id,actor_role,kind,severity,path,method,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),actor,role,kind,severity,path.slice(0,200),method.slice(0,12),summary.slice(0,500)]);
 // Send actual warning/error signals from every account into the organization's
 // existing Admin alert feed and connected Alertmanager delivery worker.
 if(severity!=='info') {
  const owner=await organizationOwner();
  if(owner)await db.query(`INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail,href,affected_user_id)
   VALUES($1,'organization',$2,$3,$4,$5,'/service-review-center/eassist?view=alerts',$6)
   ON CONFLICT(user_id,source,event_key) DO UPDATE SET state='active',affected_user_id=excluded.affected_user_id,detail=excluded.detail,updated_at=now()`,
   [owner,`${kind}:${actor||'anonymous'}:${path}:${new Date().toISOString().slice(0,13)}`,severity==='error'?'critical':'warning',summary,`Account: ${actor||'anonymous'} · Role: ${role} · ${method} ${path}`,actor]);
 }
}

// Share overview descriptions and their provenance, while excluding raw
// automation objects, connector credentials and diagnostic errors.
const overviewFields=['label','value','unit','scope','device','ipAddress','site','category','country','vendor','status','description','service','availability','period','samples','stage','count','region','successful','completed','lowerBound','upperBound','actual'];
const enrichmentFields=['state','descriptionSource','geographySource','siteSource','vendorSource','checkedAt','geoCheckedAt','aiGeneratedAt','model'];
export function overviewProjection(records:Record<string,unknown>[]):Record<string,unknown>[] {
 return records.filter(r=>!/(silence|templateCount|inventory|variable|key.?store|repositor)/i.test(String(r.recordKey))).map(r=>{
  const payload=r.payload as Record<string,unknown>;
  const projected:Record<string,unknown>=Object.fromEntries(overviewFields.filter(key=>payload?.[key]!==undefined).map(key=>[key,typeof payload[key]==='string'?String(payload[key]).slice(0,key==='description'?1600:500):payload[key]]));
  if(payload?.enrichment&&typeof payload.enrichment==='object') {
   const metadata=payload.enrichment as Record<string,unknown>;
   projected.enrichment=Object.fromEntries(enrichmentFields.filter(key=>typeof metadata[key]==='string').map(key=>[key,String(metadata[key]).slice(0,500)]));
  }
  return {...r,payload:projected};
 });
}
export async function organizationSummary(member:WorkspaceAccess) {
 if(!member.active||!['admin','manager'].includes(member.role))throw new Error('Review Center access required.');
 const [events,failures]=await Promise.all([db.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE severity<>'info')::int AS attention,max(created_at) AS latest
  FROM organization_security_events WHERE created_at>now()-interval '24 hours'`),
 db.query("SELECT count(*)::int AS total FROM platform_alerts WHERE state IN ('active','acknowledged')")]);
 return {...events.rows[0],runtimeAttention:failures.rows[0].total,scope:'Organization'};
}
