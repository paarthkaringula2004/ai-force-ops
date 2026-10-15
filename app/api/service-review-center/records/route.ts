import {sharedOperationsOwner} from '@/lib/eassist/organization-context';
import { db } from '@/lib/db';
import { getRequestSession } from '@/lib/request-session';
import { boundedJson, InputError } from '@/lib/eassist/transport';
import { collectorUser, ingestReadings, IngestionError, requireSameOrigin } from '@/lib/service-review/ingestion';
import { workspaceAccess } from '@/lib/workspace-access';
import { organizationOwner, organizationSummary, overviewProjection } from '@/lib/organization';
export const runtime='nodejs';
export async function GET(request:Request) {
 const session=await getRequestSession(request);
 if(!session?.user)return Response.json({error:'Sign in to view Review Center.'},{status:401});
 try {
  const member=await workspaceAccess(session.user.id);
  if(!member.active||!['admin','manager'].includes(member.role))return Response.json({error:'Review Center access required.'},{status:403});
  const manager=member.role==='manager';
  const owner=await organizationOwner();
  if(!owner)return Response.json({error:'The organization integration owner has not been configured by an Admin.'},{status:503});
  const [records,sources,worker]=await Promise.all([
   db.query(`WITH ranked AS (
    SELECT r.*,row_number() OVER(PARTITION BY r.record_type,r.record_key ORDER BY r.observed_at DESC,r.created_at DESC) AS rn
    FROM service_review_records r LEFT JOIN eassist_connections c ON c.id=r.source_connection_id
    WHERE r.user_id=$1 AND (r.source_connection_id IS NULL OR c.enabled=true)
     AND (r.source_connection_id IS NULL OR r.is_current OR r.record_type='metric')
   ) SELECT id,record_type AS "recordType",record_key AS "recordKey",payload,observed_at AS "observedAt",source_connection_id AS "sourceId",source_kind AS "sourceKind",source_name AS "sourceName",is_current AS "isCurrent"
    FROM ranked WHERE rn<=CASE WHEN record_type='metric' THEN 12 ELSE 1 END ORDER BY observed_at DESC`,[owner]),
   db.query(`SELECT c.id,c.name,c.kind,c.enabled,c.state,c.last_error AS "sourceError",c.checked_at AS "checkedAt",s.imported_at AS "importedAt",s.last_error AS "importError",COALESCE(s.reading_count,0) AS "readingCount"
    FROM eassist_connections c LEFT JOIN service_review_sync s ON s.connection_id=c.id WHERE c.user_id=$1 ORDER BY c.name`,[owner]),
   db.query('SELECT checked_at AS "checkedAt" FROM integration_worker_health WHERE id=true')
  ]);
  return Response.json({organization:await organizationSummary(member),worker:{active:Boolean(worker.rows[0]?.checkedAt&&Date.now()-new Date(worker.rows[0].checkedAt).getTime()<120000),checkedAt:worker.rows[0]?.checkedAt||null,configured:Boolean(process.env.EASSIST_WORKER_TOKEN&&process.env.EASSIST_WORKER_TOKEN.length>=32)},records:manager?overviewProjection(records.rows):records.rows,sources:sources.rows.map(s=>({...s,sourceError:manager?'':s.sourceError,importError:manager?null:s.importError,stale:!s.enabled||s.state!=='connected'||Boolean(s.importError)||!s.importedAt||Date.now()-new Date(s.importedAt).getTime()>120000})),checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Review Center storage is unavailable. Check the database and migrations.'},{status:503});}
}
export async function POST(request:Request) {
 try {
  const collector=await collectorUser(request);
  if(!collector)requireSameOrigin(request);
  const actor=collector||(await getRequestSession(request))?.user?.id;
  if(!actor)return Response.json({error:'Sign in or provide a collector token.'},{status:401});
  const user=await sharedOperationsOwner(actor);
  const result=await ingestReadings(user,await boundedJson(request));
  return Response.json({...result,receivedAt:new Date().toISOString()},{status:result.duplicate?200:201});
 }catch(error){return Response.json({error:error instanceof IngestionError||error instanceof InputError?error.message:'Could not save readings. Check the database.'},{status:error instanceof IngestionError||error instanceof InputError?error.status:503,headers:error instanceof IngestionError&&error.status===429?{'Retry-After':'1'}:undefined});}
}
