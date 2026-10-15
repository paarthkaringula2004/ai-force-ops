import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {PaceError} from '@/lib/epace/store';
export const scanProjection='id,target,status,phase,progress,error,coverage,created_at AS "createdAt",started_at AS "startedAt",completed_at AS "completedAt",jsonb_array_length(findings) AS "findingCount"';
export const isUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function scanTarget(){
 const raw=process.env.SECURITY_SCAN_TARGET_URL;
 if(!raw)throw new PaceError('The scanner target has not been configured by the operator.',503);
 const url=new URL(raw);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new PaceError('Configure a single project origin as the scanner target.',503);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new PaceError('Remote scanner targets require HTTPS.',503);
 return url.origin;
}
// Bootstrap from the authenticated worker, independently of page visits or login.
// An explicit organization pause/schedule remains authoritative.
export async function ensureOrganizationMonitoring(){
 scanTarget();
 await db.query(`INSERT INTO security_scan_schedules(user_id,frequency,next_run_at)
 SELECT o.owner_id,'continuous',now() FROM organization_workspace o
 JOIN workspace_members m ON m.user_id=o.owner_id
 WHERE o.id=true AND m.active=true AND m.role='admin'
 ON CONFLICT(user_id) DO NOTHING`);
}
export async function expireScans(){
 await db.query("UPDATE security_scan_jobs SET status='failed',phase='Scan interrupted',error='The scanner worker stopped responding. Start a new scan.',completed_at=now(),lease=NULL WHERE status='running' AND heartbeat_at<now()-interval '3 minutes'");
 await db.query("UPDATE security_scan_jobs SET status='failed',phase='Worker unavailable',error='The scanner worker did not pick up this job. Start the worker and retry.',completed_at=now() WHERE status='queued' AND created_at<now()-interval '10 minutes'");
}
export async function startScan(user:string,requestId:unknown){
 if(!permitted(await workspaceAccess(user), "security"))throw new PaceError("Security access is required.",403);

 if(!isUuid(requestId))throw new PaceError('A valid request ID is required.');
 const target=scanTarget();await expireScans();
 const c=await db.connect();
 try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['security-scan:'+user]);
  const duplicate=await c.query(`SELECT ${scanProjection} FROM security_scan_jobs WHERE user_id=$1 AND request_id=$2`,[user,requestId]);
  if(duplicate.rowCount){await c.query('COMMIT');return duplicate.rows[0];}
  const active=await c.query(`SELECT ${scanProjection} FROM security_scan_jobs WHERE user_id=$1 AND status IN ('queued','running')`,[user]);
  if(active.rowCount){await c.query('COMMIT');return active.rows[0];}
  const worker=await c.query("SELECT capabilities FROM security_scan_worker WHERE id=1 AND checked_at>now()-interval '90 seconds'");
  if(!worker.rowCount||!worker.rows[0].capabilities.zap||!worker.rows[0].capabilities.trivy)throw new PaceError('The scanner worker is offline or its tools are unavailable. Your operator must start the backend worker.',503);
  const count=await c.query("SELECT count(*)::int AS n FROM security_scan_jobs WHERE user_id=$1 AND created_at>now()-interval '24 hours'",[user]);
  if(count.rows[0].n>=8)throw new PaceError('Eight scans per account per day are supported. Try again later.',429);
  const added=await c.query(`INSERT INTO security_scan_jobs(id,user_id,request_id,target) VALUES($1,$2,$3,$4) RETURNING ${scanProjection}`,[randomUUID(),user,requestId,target]);
  await c.query('COMMIT');return added.rows[0];
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
