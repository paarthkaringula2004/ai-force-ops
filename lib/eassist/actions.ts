import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { connection, audit, putRecord, recordData } from './store';
import { array, object, resourceFields, type Json } from './types';
import { externalId, InputError, projectPath, remote, seal, validateBaseUrl, UpstreamError, type PrivateConnection } from './transport';
import { sanitizeResource, syncConnection, syncTask } from './sync';
import { securityPolicy, consumeLaunch } from './security';

const uuid=(v:unknown)=>{const s=String(v??'');if(!/^[a-f0-9-]{36}$/i.test(s))throw new InputError('Invalid request identity.');return s;};
const str=(v:unknown,max=4000)=>{if(typeof v!=='string'||v.length>max)throw new InputError('A field is missing or too long.');return v.trim();};
function resourcePath(c:PrivateConnection,kind:string,id='') {
  if(c.kind==='servicenow' && kind==='incidents')return `/api/now/table/incident${id?`/${externalId(id)}`:''}`;
  if(c.kind==='semaphore' && Object.keys(resourceFields).filter(k=>k!=='incidents').includes(kind))return `${projectPath(c)}/${kind}${id?`/${externalId(id)}`:''}`;
  throw new InputError('This integration does not support that resource.');
}
export function validateFields(kind:string,input:Json,editing=false):Json {
  const fields=resourceFields[kind];if(!fields)throw new InputError('Unsupported resource.');
  const out:Json={};
  for(const field of fields){
    const value=input[field.key];
    if(value===undefined||value===''){if(field.required)throw new InputError(`${field.label} is required.`);if(value===''&&field.type!=='number')out[field.key]='';continue;}
    if(field.type==='number'){const number=Number(value);if(!Number.isSafeInteger(number)||number<0)throw new InputError(`${field.label} must be a positive integer.`);out[field.key]=number;}
    else if(field.type==='checkbox')out[field.key]=value===true;
    else {const s=str(value,32000);if(field.options&&!field.options.includes(s))throw new InputError(`Invalid ${field.label}.`);out[field.key]=s;}
  }
  if(kind==='environment')for(const name of ['json','env'])if(out[name]){try{const data=JSON.parse(String(out[name]));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error();}catch{throw new InputError(`${name} must be a JSON object.`);}}
  if(kind==='incidents' && ['6','7'].includes(String(out.state)) && (!out.close_notes||!out.close_code))throw new InputError('Resolution notes and a valid source-system resolution code are required.');
  if(kind==='keys'){
    const type=String(out.type),secret=String(out.secret||''),login=String(out.login||'');delete out.secret;delete out.login;
    if(type==='ssh'){if(!editing&&!secret)throw new InputError('A private key is required.');if(secret)out.ssh={login,private_key:secret};}
    if(type==='login_password'){if(!editing&&!secret)throw new InputError('A password is required.');if(secret)out.login_password={login,password:secret};}
    out.override_secret=Boolean(secret);
  }
  return out;
}
async function once(c:PrivateConnection,b:Json,target:string,fn:(operationId:string)=>Promise<Json>) {
  const requestKey=uuid(b.requestKey), id=randomUUID(),action=String(b.action);
  const hash=createHash('sha256').update(JSON.stringify(b)).digest('hex');
  const inserted=await db.query(`INSERT INTO eassist_operations(id,user_id,connection_id,request_key,action,target,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,request_key) DO NOTHING RETURNING id`,[id,c.user_id,c.id,requestKey,action,target,hash]);
  if(!inserted.rowCount){
    const prior=(await db.query('SELECT * FROM eassist_operations WHERE user_id=$1 AND request_key=$2',[c.user_id,requestKey])).rows[0];
    if(prior.request_hash!==hash)throw new InputError('This request identity was already used for different data.',409);
    if(prior.state==='completed')return prior.result as Json;
    throw new InputError(prior.state==='failed'?String(prior.result.error):'This operation is pending or its outcome is uncertain. Check the source system before retrying.',409);
  }
  try{
    const result=await fn(id);
    await db.query(`UPDATE eassist_operations SET state='completed',result=$2,updated_at=now() WHERE id=$1`,[id,JSON.stringify(result)]);
    await audit(c.user_id,c.id,action,target,'Completed in the source system.');
    return result;
  }catch(e){
    const definitive=e instanceof InputError || (e instanceof UpstreamError && e.definitive);
    const error=e instanceof Error?e.message:'The operation failed.';
    await db.query('UPDATE eassist_operations SET state=$2,result=$3,updated_at=now() WHERE id=$1',[id,definitive?'failed':'unknown',JSON.stringify({error})]);
    await audit(c.user_id,c.id,`${action}: ${definitive?'failed':'outcome unknown'}`,target,error);
    throw new InputError(error,e instanceof InputError?e.status:definitive?400:502);
  }
}
export async function action(user:string,b:Json):Promise<Json> {
  const name=String(b.action||'');
  if(name==='security.save'){
    const p=object(b.policy);for(const k of ['allow_runs','allow_writes','allow_deletes','require_confirmation','require_https'])if(typeof p[k]!=='boolean')throw new InputError('Invalid security configuration.');
    const max=Number(p.max_concurrent);if(!Number.isInteger(max)||max<1||max>20)throw new InputError('Concurrent runs must be between 1 and 20.');
    await db.query(`INSERT INTO eassist_security(user_id,allow_runs,allow_writes,allow_deletes,require_confirmation,require_https,max_concurrent) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(user_id) DO UPDATE SET allow_runs=EXCLUDED.allow_runs,allow_writes=EXCLUDED.allow_writes,allow_deletes=EXCLUDED.allow_deletes,require_confirmation=EXCLUDED.require_confirmation,require_https=EXCLUDED.require_https,max_concurrent=EXCLUDED.max_concurrent,updated_at=now()`,[user,p.allow_runs,p.allow_writes,p.allow_deletes,p.require_confirmation,p.require_https,max]);
    await audit(user,null,'Security configuration updated','',JSON.stringify(p));return {ok:true};
  }
  const policy=await securityPolicy(user);
  if(name==='connection.save'){
    const id=b.id?uuid(b.id):randomUUID(),old=b.id?await connection(user,id):null;
    const kind=str(b.kind,30),base=validateBaseUrl(str(b.base_url)),authType=str(b.auth_type,20);
    if(policy.require_https&&!base.startsWith('https://'))throw new InputError('HTTPS is required by your Security configurations.');
    if(!['alertmanager','servicenow','semaphore','prometheus'].includes(kind)||!['none','basic','bearer'].includes(authType))throw new InputError('Invalid connection type.');
    if(old&&(old.kind!==kind||old.base_url!==base||old.project_id!==String(b.project_id||'')))throw new InputError('Create a separate integration when changing its system, base URL, or project so existing history stays linked to its original source.');
    if(kind==='semaphore'&&!/^\d+$/.test(String(b.project_id)))throw new InputError('An automation project ID is required.');
    const secret=typeof b.secret==='string'&&b.secret?seal(str(b.secret,16000)):old?.secret_cipher||'';
    if(authType!=='none'&&!secret)throw new InputError('Enter the integration credential.');
    const connectionName=str(b.name,120);if(!connectionName)throw new InputError('A connection name is required.');
    await db.query(`INSERT INTO eassist_connections(id,user_id,name,kind,base_url,project_id,auth_type,username,secret_cipher,enabled)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,auth_type=EXCLUDED.auth_type,username=EXCLUDED.username,secret_cipher=EXCLUDED.secret_cipher,enabled=EXCLUDED.enabled,state='unverified',sync_after=now(),updated_at=now()`,[id,user,connectionName,kind,base,String(b.project_id||''),authType,String(b.username||''),secret,b.enabled!==false]);
    await audit(user,id,'Integration saved',connectionName);return {id};
  }
  const c=await connection(user,uuid(b.connectionId));
  if(name==='connection.delete'){
    if(b.confirmed!==true)throw new InputError('Confirm permanent deletion of this integration.');
    const client=await db.connect();
    try{
      await client.query('BEGIN');
      const deleted=await client.query('DELETE FROM eassist_connections WHERE user_id=$1 AND id=$2 RETURNING name',[user,c.id]);
      if(!deleted.rowCount)throw new InputError('Integration not found.',404);
      // Source records are untouched. Cascades remove local credentials, cached
      // records and approvals; audit entries survive without their connection FK.
      await client.query('INSERT INTO eassist_activity(user_id,action,target,detail) VALUES($1,$2,$3,$4)',[user,'Integration permanently deleted',c.id,deleted.rows[0].name]);
      await client.query('COMMIT');return {deleted:true};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  if(!c.enabled && name!=='connection.token')throw new InputError('This integration is disabled.');
  if(policy.require_https&&!c.base_url.startsWith('https://'))throw new InputError('This integration uses HTTP, which is blocked by Security configurations.',403);
  if(['resource.save','resource.delete','silence.create','silence.expire','incident.fromAlert'].includes(name)&&!policy.allow_writes)throw new InputError('Source-system changes are disabled in Security configurations.',403);
  if(name==='resource.delete'&&!policy.allow_deletes)throw new InputError('Source-system deletion is disabled in Security configurations.',403);
  if(name==='task.authorize'){
    if(!policy.allow_runs)throw new InputError('Task launches are disabled in Security configurations.',403);
    const id=randomUUID();await db.query('INSERT INTO eassist_run_approvals(id,user_id,connection_id,template_id) VALUES($1,$2,$3,$4)',[id,user,c.id,externalId(b.id)]);await audit(user,c.id,'Task launch confirmed',String(b.id));return {approvalId:id};
  }
  if(name==='connection.test'){await syncConnection(c,true);return {ok:true};}
  if(name==='connection.token'){
    if(c.kind!=='alertmanager')throw new InputError('Webhook tokens are available for Alertmanager.');
    const token=randomBytes(32).toString('hex');await db.query('UPDATE eassist_connections SET webhook_hash=$2 WHERE id=$1',[c.id,createHash('sha256').update(token).digest('hex')]);await audit(user,c.id,'Webhook credential rotated');return {token};
  }
  if(name==='resource.detail'){
    const kind=String(b.kind),id=externalId(b.id);
    const response=object(await remote(c,resourcePath(c,kind,id)));
    return {data:kind==='keys'?sanitizeResource(kind,response):c.kind==='servicenow'?object(response.result):response};
  }
  if(name==='incident.journal'){
    if(c.kind!=='servicenow')throw new InputError('Select a ServiceNow integration.');
    const id=externalId(b.id);
    const result=object(await remote(c,`/api/now/table/sys_journal_field?sysparm_query=element_id%3D${id}%5EORDERBYsys_created_on&sysparm_fields=sys_id,element,value,sys_created_on,sys_created_by&sysparm_limit=1000`));
    return {entries:array(result.result)};
  }
  if(name==='task.output'){
    if(c.kind!=='semaphore')throw new InputError('Select an automation integration.');
    const id=externalId(b.id);await syncTask(c,id);
    return {task:await recordData(user,c.id,'tasks',id),output:await recordData(user,c.id,'output',id)};
  }
  if(name==='monitor.query'){
    if(c.kind!=='prometheus')throw new InputError('Select a Prometheus integration.');
    const query=str(b.query,2000);if(!query)throw new InputError('Enter a PromQL query.');
    const response=object(await remote(c,`/api/v1/query?query=${encodeURIComponent(query)}`));
    if(response.status!=='success')throw new InputError('Prometheus rejected the query.');
    await audit(user,c.id,'Monitoring query',query,'Read-only query completed.');return response;
  }
  if(name==='resource.save'||name==='resource.delete'){
    const kind=str(b.kind,30),id=b.id?externalId(b.id):'';
    const path=resourcePath(c,kind,id);const fields=name==='resource.save'?validateFields(kind,object(b.fields),!!id):{};
    if(name==='resource.delete'&&!id)throw new InputError('Select a source record to delete.');
    return once(c,b,`${kind}/${id}`,async()=>{
      const body={...fields,...(id?{id:c.kind==='semaphore'?Number(id):id}:{}),...(c.kind==='semaphore'?{project_id:Number(c.project_id)}:{})};
      const response=object(await remote(c,path,name==='resource.delete'?'DELETE':id?(c.kind==='servicenow'?'PATCH':'PUT'):'POST',name==='resource.delete'?undefined:body));
      if(name==='resource.delete'){await db.query('DELETE FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind=$3 AND external_id=$4',[user,c.id,kind,id]);return {deleted:true};}
      const saved=c.kind==='servicenow'?object(response.result):response;
      const savedId=String(saved.id??saved.sys_id??id);
      if(savedId){const data=Object.keys(saved).length?saved:object(await remote(c,resourcePath(c,kind,savedId)));await putRecord(c,kind,savedId,sanitizeResource(kind,data));}
      // Some source APIs return 204/empty bodies. The next source sync supplies the authoritative record.
      await db.query('UPDATE eassist_connections SET sync_after=now() WHERE id=$1',[c.id]);return {id:savedId};
    });
  }
  if(name==='incident.fromAlert'){
    if(c.kind!=='servicenow')throw new InputError('Select a ServiceNow integration.');
    const alertConnection=await connection(user,uuid(b.alertConnectionId));
    const a=await recordData(user,alertConnection.id,'alerts',externalId(b.alertId));if(!a.labels)throw new InputError('Alert not found.',404);
    const correlation=`eassist:${alertConnection.id}:${String(b.alertId)}`;
    const prior=(await db.query(`SELECT state,result FROM eassist_operations WHERE user_id=$1 AND connection_id=$2 AND action='incident.fromAlert' AND target=$3 AND state IN ('pending','unknown','completed')`,[user,c.id,correlation])).rows[0];
    if(prior){if(prior.state==='completed')return prior.result;throw new InputError('An incident creation is already pending or uncertain for this alert. Check the source incident list before retrying.',409);}
    return once(c,b,correlation,async()=>{
      const existing=object(await remote(c,`/api/now/table/incident?sysparm_query=correlation_id%3D${encodeURIComponent(correlation)}&sysparm_limit=1`));
      let incident=array(existing.result)[0];
      if(!incident)incident=object(object(await remote(c,'/api/now/table/incident','POST',{short_description:String(object(a.labels).alertname||'Operational alert'),description:JSON.stringify({labels:a.labels,annotations:a.annotations,startsAt:a.startsAt},null,2),correlation_id:correlation})).result);
      if(!incident.sys_id)throw new UpstreamError('The incident source did not return an incident identity.');
      await putRecord(c,'incidents',String(incident.sys_id),incident);return {id:incident.sys_id};
    });
  }
  if(name==='silence.create'||name==='silence.expire'){
    if(c.kind!=='alertmanager')throw new InputError('Select an Alertmanager integration.');
    const id=b.id?externalId(b.id):'';
    const fields=object(b.fields);
    if(name==='silence.create'){
      const matchers=array(fields.matchers);if(!matchers.length||matchers.some(m=>!m.name||typeof m.value!=='string'))throw new InputError('Add at least one label matcher.');
      if(!fields.comment||!fields.createdBy||!(Date.parse(String(fields.endsAt))>Math.max(Date.now(),Date.parse(String(fields.startsAt)))))throw new InputError('Enter an author, reason, and valid future end time.');
    }
    return once(c,b,`silences/${id}`,async()=>{
      const result=object(await remote(c,name==='silence.expire'?`/api/v2/silence/${id}`:'/api/v2/silences',name==='silence.expire'?'DELETE':'POST',name==='silence.expire'?undefined:fields));
      await db.query('UPDATE eassist_connections SET sync_after=now() WHERE id=$1',[c.id]);return result;
    });
  }
  if(name==='task.run'||name==='task.stop'){
    if(c.kind!=='semaphore')throw new InputError('Select an automation integration.');
    const id=externalId(b.id),base=projectPath(c);
    return once(c,b,`${name}/${id}`,async(operationId)=>{
      if(name==='task.stop'){await remote(c,`${base}/tasks/${id}/stop`,'POST',{});await audit(user,c.id,'Stop requested',id,'Waiting for the runner to confirm termination.');return {id};}
      const unresolved=await db.query(`SELECT id FROM eassist_operations WHERE user_id=$1 AND connection_id=$2 AND action='task.run' AND target=$3 AND state IN ('pending','unknown') AND id<>$4`,[user,c.id,`task.run/${id}`,operationId]);
      if(unresolved.rowCount)throw new InputError('A previous launch has an uncertain outcome. Reconcile it from the Activity page before launching this template again.',409);
      await consumeLaunch(user,c.id,id,b.approvalId);
      const task=object(await remote(c,`${base}/tasks`,'POST',{template_id:Number(id),message:String(b.message||'Triggered from eAssist').slice(0,1000)}));
      if(task.id==null)throw new UpstreamError('The runner accepted the request without a task identity. Check its task history before retrying.');
      await putRecord(c,'tasks',String(task.id),task);return {id:String(task.id)};
    });
  }
  if(name==='operation.reconcile'){
    const operationId=uuid(b.operationId),taskId=externalId(b.taskId);
    const prior=(await db.query(`SELECT * FROM eassist_operations WHERE user_id=$1 AND connection_id=$2 AND id=$3 AND action='task.run' AND state IN ('pending','unknown')`,[user,c.id,operationId])).rows[0];
    if(!prior)throw new InputError('Uncertain task launch not found.');
    const task=await syncTask(c,taskId);
    if(`task.run/${task.template_id}`!==prior.target)throw new InputError('That task belongs to a different template.');
    await db.query(`UPDATE eassist_operations SET state='completed',result=$2,updated_at=now() WHERE id=$1`,[operationId,JSON.stringify({id:taskId,reconciled:true})]);
    await audit(user,c.id,'Task launch reconciled',taskId,'Source task identity confirmed by the operator.');return {id:taskId};
  }
  throw new InputError('Unsupported eAssist operation.');
}
