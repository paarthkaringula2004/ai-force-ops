import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { array, object, terminalStates, type Json } from './types';
import { remote, projectPath, type PrivateConnection } from './transport';
import { putRecord, recordData } from './store';

export function alertIdentity(a:Json) {return String(a.fingerprint || createHash('sha256').update(JSON.stringify(Object.entries(object(a.labels)).sort(([a],[b])=>a.localeCompare(b)))).digest('hex'));}
export function normalizeAlert(a:Json,receiver=''):Json {
  const status=object(a.status),state=typeof a.status==='string'?a.status:String(status.state||'active');
  return {...a,labels:object(a.labels),annotations:object(a.annotations),state:state==='firing'?'active':state,
    receiver:receiver || array(a.receivers).map(r=>String(r.name)).join(', '),silencedBy:status.silencedBy||[],inhibitedBy:status.inhibitedBy||[]};
}
export async function ingestAlerts(c:PrivateConnection,values:Json[],receiver='') {
  for(const a of values){
    const normalized=normalizeAlert(a,receiver), id=alertIdentity(a);
    const previous=await recordData(c.user_id,c.id,'alerts',id);
    // A delayed notification for an older occurrence must not resolve a newer one.
    if(Date.parse(String(previous.startsAt))>Date.parse(String(normalized.startsAt)))continue;
    if(previous.state==='resolved' && normalized.state==='active' && previous.startsAt===normalized.startsAt)continue;
    await putRecord(c,'alerts',id,normalized);
  }
}
export function sanitizeResource(kind:string,value:Json):Json {
  if(kind==='keys') return Object.fromEntries(['id','name','type','project_id'].filter(k=>k in value).map(k=>[k,value[k]]));
  if(kind==='environment') return Object.fromEntries(['id','name','project_id'].filter(k=>k in value).map(k=>[k,value[k]]));
  const clean={...value}; for(const key of ['password','secret','private_key','token'])delete clean[key];
  return clean;
}
async function replaceCollection(c:PrivateConnection,kind:string,rows:Json[]) {
  const ids:string[]=[];
  for(const row of rows){const id=String(row.id??row.sys_id??'');if(!id)continue;ids.push(id);await putRecord(c,kind,id,sanitizeResource(kind,row));}
  await db.query('DELETE FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind=$3 AND NOT(external_id=ANY($4::text[]))',[c.user_id,c.id,kind,ids]);
}
export async function syncTask(c:PrivateConnection,id:string) {
  const base=projectPath(c),task=object(await remote(c,`${base}/tasks/${id}`));
  await putRecord(c,'tasks',id,task);
  const output=await remote(c,`${base}/tasks/${id}/output`);
  const rows=array(output).map(line=>({time:line.time??'',output:String(line.output??'').slice(0,32000)}));
  await putRecord(c,'output',id,{lines:rows.slice(-20000),truncated:rows.length>20000});
  return task;
}
export async function syncConnection(c:PrivateConnection,force=false) {
  const lease=await db.query(`UPDATE eassist_connections SET lease_until=now()+interval '120 seconds' WHERE id=$1 AND enabled=true
    AND (lease_until IS NULL OR lease_until<now()) AND ($2 OR sync_after<=now()) RETURNING id`,[c.id,force]);
  if(!lease.rowCount)return;
  try{
    if(c.kind==='alertmanager'){
      const alerts=array(await remote(c,'/api/v2/alerts?active=true&silenced=true&inhibited=true&unprocessed=true'));
      await ingestAlerts(c,alerts);
      // Missing from a successful source response means inactive, not verified resolution.
      await db.query(`UPDATE eassist_records SET data=jsonb_set(data,'{state}','"inactive"'),updated_at=now()
        WHERE user_id=$1 AND connection_id=$2 AND kind='alerts' AND NOT(external_id=ANY($3::text[])) AND data->>'state' IN ('active','suppressed','unprocessed')`,[c.user_id,c.id,alerts.map(alertIdentity)]);
      await replaceCollection(c,'silences',array(await remote(c,'/api/v2/silences')));
      const status=object(await remote(c,'/api/v2/status'));
      // Alertmanager configuration may contain credentials; expose cluster/version only.
      await putRecord(c,'status','current',{cluster:status.cluster,versionInfo:status.versionInfo,uptime:status.uptime});
    } else if(c.kind==='servicenow'){
      const fields='sys_id,number,opened_at,closed_at,short_description,description,state,urgency,impact,priority,caller_id,assignment_group,assigned_to,close_code,close_notes,sys_updated_on,correlation_id';
      // Fetch all pages before reporting a successful synchronization. Retain history.
      for(let offset=0;offset<10000;offset+=250){
        const response=object(await remote(c,`/api/now/table/incident?sysparm_limit=250&sysparm_offset=${offset}&sysparm_exclude_reference_link=true&sysparm_fields=${fields}&sysparm_query=ORDERBYDESCsys_updated_on`));
        const rows=array(response.result);for(const row of rows)await putRecord(c,'incidents',String(row.sys_id),row);
        if(rows.length<250)break;
        if(offset===9750)throw new Error('Incident sync reached 10,000 records. Scope the integration account to the intended services.');
      }
    } else if(c.kind==='semaphore'){
      const base=projectPath(c);
      // Use the API endpoint of each real resource. A rejected endpoint remains an error.
      for(const kind of ['templates','inventory','environment','repositories','keys','users','views']){
        const rows=array(await remote(c,`${base}/${kind}`));
        await replaceCollection(c,kind,rows);
        if(kind==='templates'){
          const schedules:Json[]=[];
          for(const t of rows) schedules.push(...array(await remote(c,`${base}/templates/${t.id}/schedules`)));
          await replaceCollection(c,'schedules',schedules);
        }
      }
      const tasks=array(await remote(c,`${base}/tasks/last`));
      for(const task of tasks){
        const id=String(task.id),previous=await recordData(c.user_id,c.id,'tasks',id);
        await putRecord(c,'tasks',id,task);
        if(!terminalStates.includes(String(task.status)) || (Object.keys(previous).length>0 && !terminalStates.includes(String(previous.status))))await syncTask(c,id);
      }
    } else if(c.kind==='prometheus'){
      const result=object(await remote(c,'/api/v1/status/buildinfo'));
      if(result.status!=='success')throw new Error('Prometheus did not return a successful health response.');
      await putRecord(c,'status','current',object(result.data));
      const targets=object(await remote(c,'/api/v1/targets'));
      const rules=object(await remote(c,'/api/v1/rules'));
      const metrics:Json={};
      for(const [name,query] of Object.entries({up:'up',samples:'scrape_samples_scraped',duration:'scrape_duration_seconds',alerts:'ALERTS'})){
        const response=object(await remote(c,`/api/v1/query?query=${encodeURIComponent(query)}`));
        if(response.status!=='success')throw new Error('Prometheus rejected the monitoring query.');
        metrics[name]=object(response.data).result||[];
      }
      await putRecord(c,'monitoring','current',{targets:array(object(targets.data).activeTargets).map(t=>({health:t.health,labels:t.labels,scrapeUrl:t.scrapeUrl,lastScrape:t.lastScrape,lastError:t.lastError,scrapeDuration:t.scrapeDuration})),rules:array(object(rules.data).groups).map(g=>({name:g.name,rules:array(g.rules).map(r=>({name:r.name,state:r.state,health:r.health,query:r.query,lastError:r.lastError}))})),metrics});
    }
    await db.query(`UPDATE eassist_connections SET state='connected',last_error='',checked_at=now(),sync_after=now()+interval '10 seconds',lease_until=NULL WHERE id=$1`,[c.id]);
  }catch(error){
    await db.query(`UPDATE eassist_connections SET state='error',last_error=$2,checked_at=now(),sync_after=now()+interval '15 seconds',lease_until=NULL WHERE id=$1`,[c.id,error instanceof Error?error.message:'Synchronization failed.']);
  }
}
export async function syncUser(user:string,force=false) {
  const c=await db.query<PrivateConnection>('SELECT * FROM eassist_connections WHERE user_id=$1 AND enabled=true',[user]);
  await Promise.allSettled(c.rows.map(c=>syncConnection(c,force)));
}
