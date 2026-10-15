import {getRequestSession} from '@/lib/organization-session';
import {db} from '@/lib/db';
import {boundedJson} from '@/lib/epace/runtime';
import {requireSameOrigin,IngestionError} from '@/lib/service-review/ingestion';
import {PaceError} from '@/lib/epace/store';
import {scanProjection,scanTarget,expireScans,startScan,isUuid} from '@/lib/vulnerabilities/scans';
import {csvReport,excelReport} from '@/lib/vulnerabilities/files';
import type {Finding} from '@/lib/vulnerabilities/schema';
export const runtime='nodejs';
const fail=(e:unknown)=>Response.json({error:e instanceof PaceError||e instanceof IngestionError?e.message:'Scan storage is unavailable. Check migrations and retry.'},{status:e instanceof PaceError||e instanceof IngestionError?e.status:503});
export async function GET(request:Request){
 const user=(await getRequestSession(request))?.user?.id;if(!user)return Response.json({error:'Sign in required.'},{status:401});
 try{
  await expireScans();const url=new URL(request.url),id=url.searchParams.get('id'),format=url.searchParams.get('format');
  if(format){
   if(!isUuid(id)||!['csv','xlsx'].includes(format))throw new PaceError('Choose a scan and CSV or Excel.');
   const row=(await db.query('SELECT * FROM security_scan_jobs WHERE $1::text IS NOT NULL AND id=$2',[user,id])).rows[0];
   if(!row)throw new PaceError('Scan not found.',404);if(row.status!=='completed')throw new PaceError('This scan has not completed.',409);
   const findings:Finding[]=row.findings;
   const metadata={id:row.id,target:row.target,startedAt:row.started_at,completedAt:row.completed_at,coverage:row.coverage};
   const content=format==='csv'?csvReport(findings,metadata):Buffer.from(await excelReport(findings,metadata));
   return new Response(content,{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="aiforce-security-${row.id.slice(0,8)}.${format}"`,'Cache-Control':'no-store'}});
  }
  const jobs=await db.query(`SELECT ${scanProjection} FROM security_scan_jobs WHERE $1::text IS NOT NULL ORDER BY created_at DESC LIMIT 20`,[user]);
  const worker=await db.query("SELECT checked_at>now()-interval '90 seconds' AS online,checked_at AS \"checkedAt\",capabilities FROM security_scan_worker WHERE id=1");
  const schedule=(await db.query('SELECT frequency,next_run_at AS "nextRunAt" FROM security_scan_schedules WHERE user_id=$1',[user])).rows[0]||{frequency:'manual',nextRunAt:null};
  let target='';try{target=scanTarget();}catch{}
  return Response.json({jobs:jobs.rows,target,schedule,worker:worker.rows[0]||{online:false,capabilities:{}}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e);}
}
export async function POST(request:Request){
 const user=(await getRequestSession(request))?.user?.id;if(!user)return Response.json({error:'Sign in required.'},{status:401});
 try{requireSameOrigin(request);const body=await boundedJson(request,2000);
  if(body.action==='ensure-continuous'){
   scanTarget();await db.query("INSERT INTO security_scan_schedules(user_id,frequency,next_run_at) VALUES($1,'continuous',now()) ON CONFLICT DO NOTHING",[user]);return Response.json({ok:true});
  }
  if(body.action==='schedule'){
   if(!['continuous','manual','daily','weekly'].includes(String(body.frequency)))throw new PaceError('Choose continuous, paused, daily or weekly scans.');
   scanTarget();
   await db.query("INSERT INTO security_scan_schedules(user_id,frequency,next_run_at) VALUES($1,$2,now()+CASE WHEN $2='continuous' THEN interval '0 seconds' WHEN $2='manual' THEN interval '100 years' WHEN $2='daily' THEN interval '1 day' ELSE interval '7 days' END) ON CONFLICT(user_id) DO UPDATE SET frequency=excluded.frequency,next_run_at=excluded.next_run_at,updated_at=now()",[user,body.frequency]);
   return Response.json({ok:true});
  }
  return Response.json({job:await startScan(user,body.requestId)});
 }catch(e){return fail(e);}
}
