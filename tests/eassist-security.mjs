// Integration tests use two temporary PostgreSQL accounts and a local source fixture.
// They never contact an operator's configured integrations or alter their policies.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
registerHooks({
  resolve(specifier,context,next){
    let candidate;
    if(specifier.startsWith('@/'))candidate=resolve(root,specifier.slice(2));
    else if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts'))candidate=resolve(dirname(fileURLToPath(context.parentURL)),specifier);
    if(candidate){if(!extname(candidate)&&existsSync(`${candidate}.ts`))candidate+='.ts';if(existsSync(candidate))return {url:pathToFileURL(candidate).href,shortCircuit:true};}
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
    return next(url,context);
  },
});
const {db}=await import('../lib/db.ts');
const {action}=await import('../lib/eassist/actions.ts');
const {connection,snapshot}=await import('../lib/eassist/store.ts');
const {defaultSecurity,securityPolicy}=await import('../lib/eassist/security.ts');
const {remote,seal,unseal}=await import('../lib/eassist/transport.ts');
const {ingestAlerts}=await import('../lib/eassist/sync.ts');
const users=[`eassist-security-${randomUUID()}`,`eassist-security-${randomUUID()}`];
const tasks=new Map();let launches=0,sourceRequests=0;
const server=createServer(async(req,res)=>{
  sourceRequests++;
  let raw='';for await(const chunk of req)raw+=chunk;
  const input=raw?JSON.parse(raw):{};
  const path=new URL(req.url,'http://fixture').pathname;
  let result={};
  if(path==='/api/project/1/tasks'&&req.method==='POST'){
    const id=++launches;result={id,template_id:input.template_id,status:'running'};tasks.set(String(id),result);
  }else if(path.endsWith('/output'))result=[{time:new Date().toISOString(),output:'Fixture runner emitted this output.'}];
  else if(path.endsWith('/confirm')||path.endsWith('/reject')){const id=path.split('/').at(-2);tasks.set(id,{...tasks.get(id),status:path.endsWith('/confirm')?'running':'rejected'});}
  else if(path.endsWith('/stop')){const id=path.split('/').at(-2);tasks.set(id,{...tasks.get(id),status:'stopped'});}
  else if(path.includes('/tasks/'))result=tasks.get(path.split('/').at(-1))||{};
  else if(path==='/api/project/1/templates/7')result={id:7,name:'Fixture template',app:'ansible'};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
process.env.EASSIST_ALLOWED_ORIGINS=origin;
let checks=0;
async function rejects(fn,status){await assert.rejects(fn,e=>e.status===status);checks++;}
function check(value,message){assert.ok(value,message);checks++;}
async function policy(changes={}){const p={...defaultSecurity,require_https:false,...changes};await action(users[0],{action:'security.save',policy:p});return p;}
async function authorize(connectionId,id='7',user=users[0]){return (await action(user,{action:'task.authorize',connectionId,id})).approvalId;}
function run(connectionId,approvalId,id='7'){return {action:'task.run',connectionId,id,approvalId,requestKey:randomUUID()};}
try{
  for(const id of users)await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',[id,'Security integration test',`${id}@example.invalid`]);
  check((await securityPolicy(users[0])).require_https,'HTTPS defaults on');
  check(!(await securityPolicy(users[0])).allow_deletes,'Deletion defaults off');
  await rejects(()=>action(users[0],{action:'security.save',policy:{...defaultSecurity,max_concurrent:0}}),400);
  const before=await snapshot(users[0]);const p=await policy();
  assert.deepEqual((await snapshot(users[0])).security,p);checks++;
  check((await snapshot(users[0])).revision!==before.revision,'Security changes advance the live cursor');
  check((await securityPolicy(users[1])).require_https,'Other account policy is unchanged');
  const secret=`fixture-${randomUUID()}`;
  const saved=await action(users[0],{action:'connection.save',name:'Isolated runner',kind:'semaphore',base_url:origin,project_id:'1',auth_type:'bearer',secret});
  const c=await connection(users[0],saved.id);
  check(c.secret_cipher!==secret&&unseal(c.secret_cipher)===secret,'Credentials are encrypted and recoverable by server');
  check(!JSON.stringify(await snapshot(users[0])).includes(secret),'Browser snapshot contains no credential');
  const sealed=seal(secret);const parts=sealed.split('.');parts[1]=(parts[1][0]==='a'?'b':'a')+parts[1].slice(1);
  assert.throws(()=>unseal(parts.join('.')));checks++;
  await rejects(()=>connection(users[1],saved.id),404);
  await rejects(()=>action(users[1],{action:'task.authorize',connectionId:saved.id,id:'7'}),404);
  let count=sourceRequests;
  await rejects(()=>action(users[0],run(saved.id,undefined)),403);
  check(sourceRequests===count,'Unconfirmed launch never contacts the runner');
  const approval=await authorize(saved.id);const request=run(saved.id,approval);
  const launched=await action(users[0],request);
  assert.deepEqual(await action(users[0],request),launched);checks++;
  check(launches===1,'Replayed launch has one source side effect');
  await rejects(()=>action(users[0],run(saved.id,approval)),403);
  const output=await action(users[0],{action:'task.output',connectionId:saved.id,id:launched.id});
  check(output.output.lines[0].output==='Fixture runner emitted this output.','Terminal output comes from source API');
  const expired=await authorize(saved.id);
  await db.query("UPDATE eassist_run_approvals SET expires_at=now()-interval '1 second' WHERE id=$1",[expired]);
  await rejects(()=>action(users[0],run(saved.id,expired)),403);
  const wrongTemplate=await authorize(saved.id,'8');
  await rejects(()=>action(users[0],run(saved.id,wrongTemplate)),403);
  await policy({max_concurrent:1});
  await rejects(async()=>action(users[0],run(saved.id,await authorize(saved.id))),409);
  await policy({allow_runs:false});
  count=sourceRequests;
  await rejects(()=>authorize(saved.id),403);
  await rejects(()=>action(users[0],run(saved.id,undefined)),403);
  check(sourceRequests===count,'Disabling launches blocks source execution');
  await action(users[0],{action:'task.stop',connectionId:saved.id,id:launched.id,requestKey:randomUUID()});
  check(tasks.get(launched.id).status==='stopped','Operators can stop existing tasks when new launches are disabled');
  tasks.set(launched.id,{...tasks.get(launched.id),status:'waiting_confirmation'});
  const decision=(name,confirmed)=>({action:`task.${name}`,connectionId:saved.id,id:launched.id,confirmed,requestKey:randomUUID()});
  count=sourceRequests;
  await rejects(()=>action(users[0],decision('confirm',true)),403);
  check(sourceRequests===count,'Disabled task actions never reach source confirmation');
  await policy();
  await rejects(()=>action(users[0],decision('confirm',false)),400);
  await action(users[0],decision('confirm',true));
  check(tasks.get(launched.id).status==='running','Confirmation continues a paused source task');
  await rejects(()=>action(users[0],decision('confirm',true)),409);
  tasks.set(launched.id,{...tasks.get(launched.id),status:'waiting_confirmation'});
  await action(users[0],decision('reject',true));
  check(tasks.get(launched.id).status==='rejected','Rejection ends a paused source task');
  await policy({allow_writes:false});count=sourceRequests;
  await rejects(()=>action(users[0],{action:'resource.save',connectionId:saved.id,kind:'views',fields:{name:'Blocked category'},requestKey:randomUUID()}),403);
  check(sourceRequests===count,'Write policy is enforced before source mutation');
  await policy();
  await rejects(()=>action(users[0],{action:'resource.delete',connectionId:saved.id,kind:'templates',id:'7',requestKey:randomUUID()}),403);
  await policy({require_https:true});count=sourceRequests;
  await rejects(()=>remote(c,'/api/project/1/templates/7'),403);
  check(sourceRequests===count,'HTTPS policy also protects an existing HTTP connection');
  await rejects(()=>action(users[0],{action:'connection.save',name:'Blocked HTTP',kind:'prometheus',base_url:origin,auth_type:'none'}),400);
  await policy();
  process.env.EASSIST_ALLOWED_ORIGINS='';
  await rejects(()=>remote(c,'/api/project/1/templates/7'),403);
  process.env.EASSIST_ALLOWED_ORIGINS=origin;
  await db.query('UPDATE eassist_connections SET enabled=false WHERE id=$1',[saved.id]);
  await rejects(async()=>remote(await connection(users[0],saved.id),'/api/project/1/templates/7'),400);
  const alerts=await action(users[0],{action:'connection.save',name:'Isolated alerts',kind:'alertmanager',base_url:origin,auth_type:'none'});
  const ac=await connection(users[0],alerts.id);
  const alert={fingerprint:'fixture-alert',labels:{alertname:'Fixture signal'},status:'firing',startsAt:'2026-10-01T00:00:00Z'};
  await ingestAlerts(ac,[alert,alert]);
  check((await snapshot(users[0])).records.filter(r=>r.kind==='alerts').length===1,'Alert ingestion deduplicates');
  await ingestAlerts(ac,[{...alert,status:'resolved'}]);await ingestAlerts(ac,[alert]);
  check((await snapshot(users[0])).records.find(r=>r.kind==='alerts').data.state==='resolved','Delayed active event cannot undo resolved occurrence');
  check((await snapshot(users[1])).records.length===0,'Records are isolated across accounts');
  check((await snapshot(users[0])).activity.some(a=>a.action==='Security configuration updated'),'Policy changes are audited');
  await rejects(()=>action(users[1],{action:'connection.delete',connectionId:saved.id,confirmed:true}),404);
  await rejects(()=>action(users[0],{action:'connection.delete',connectionId:saved.id}),400);
  check((await snapshot(users[0])).connections.some(row=>row.id===saved.id),'Deletion requires explicit confirmation');
  // Removing a local integration must work even if it is disabled or its URL
  // is blocked. Source deletion restrictions govern source records only.
  await policy({require_https:true,allow_writes:false,allow_deletes:false});
  count=sourceRequests;
  const deleted=await action(users[0],{action:'connection.delete',connectionId:saved.id,confirmed:true});
  check(deleted.deleted===true,'Confirmed integration deletion succeeds');
  await rejects(()=>connection(users[0],saved.id),404);
  const remaining=await snapshot(users[0]);
  check(!remaining.connections.some(row=>row.id===saved.id),'Deleted integration remains absent on reload');
  check((await db.query('SELECT 1 FROM eassist_records WHERE connection_id=$1',[saved.id])).rowCount===0,'Cached records and output are permanently removed');
  check((await db.query('SELECT 1 FROM eassist_run_approvals WHERE connection_id=$1',[saved.id])).rowCount===0,'Launch approvals are permanently removed');
  check((await db.query('SELECT 1 FROM eassist_operations WHERE connection_id=$1',[saved.id])).rowCount===0,'Local execution tracking is removed');
  check(remaining.activity.some(row=>row.action==='Integration permanently deleted'&&row.target===saved.id),'Deletion retains its audit evidence');
  check(remaining.connections.some(row=>row.id===alerts.id),'Other integrations are retained');
  check(sourceRequests===count,'Deleting integration never calls the source system');
  console.log(`PASS: ${checks} eAssist security and persistence assertions.`);
}finally{
  // Delete dependent records before users so revision triggers have a valid owner.
  for(const table of ['eassist_run_approvals','eassist_operations','eassist_activity','eassist_records','eassist_connections','eassist_security','eassist_revisions'])await db.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`,[users]);
  await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);
  await new Promise(r=>server.close(r));await db.end();
}
