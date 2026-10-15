import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();let tail=Promise.resolve();
const query=(sql,args)=>{const pending=tail.then(()=>c.query(sql,args));tail=pending.catch(()=>{});return pending;};
const db={query,connect:async()=>({query:(sql,args)=>/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)?Promise.resolve({rows:[]}):query(sql,args),release(){}})};
const permissions=load('lib/workspace-permissions.ts'),access={workspaceAccess:async id=>(await query('SELECT * FROM workspace_members WHERE user_id=$1',[id])).rows[0]};
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
class PaceError extends InputError{}
const org={organizationOwner:async()=>(await query('SELECT owner_id FROM organization_workspace WHERE id=true')).rows[0].owner_id};
const context=load('lib/eassist/organization-context.ts',{'@/lib/organization':org,'@/lib/workspace-access':access,'@/lib/workspace-permissions':permissions,'./transport':{InputError}});
const session=load('lib/organization-session.ts',{'@/lib/request-session':{getRequestSession:async r=>r.headers.has('x-fixture-user')?{user:{id:r.headers.get('x-fixture-user')}}:null},'@/lib/eassist/organization-context':context});
const scans=load('lib/vulnerabilities/scans.ts',{'@/lib/db':{db},'@/lib/workspace-access':access,'@/lib/workspace-permissions':permissions,'@/lib/epace/store':{PaceError}});
const bounded={boundedJson:r=>r.json()},ingestion={requireSameOrigin:()=>{},IngestionError:InputError};
const scanRoute=load('app/api/service-review-center/scans/route.ts',{'@/lib/organization-session':session,'@/lib/db':{db},'@/lib/epace/runtime':bounded,'@/lib/service-review/ingestion':ingestion,'@/lib/epace/store':{PaceError},'@/lib/vulnerabilities/scans':{...scans,expireScans:async()=>{}},'@/lib/vulnerabilities/files':{}});
const alerts=load('lib/eassist/organization-alerts.ts',{'@/lib/db':{db},'@/lib/workspace-access':access,'@/lib/workspace-permissions':permissions,'./transport':{InputError}});
const alertRoute=load('app/api/service-review-center/security-alerts/route.ts',{'@/lib/organization-session':session,'@/lib/db':{db},'@/lib/epace/runtime':bounded,'@/lib/service-review/ingestion':ingestion,'@/lib/eassist/transport':{InputError},'@/lib/eassist/organization-alerts':alerts,'@/lib/eassist/security':{securityPolicy:async()=>({allow_writes:true})}});
let bootstrapCalls=0;
const worker=load('app/api/service-review-center/scans/worker/route.ts',{'@/lib/db':{db},'@/lib/vulnerabilities/connections':{},'@/lib/epace/runtime':bounded,'@/lib/epace/store':{PaceError},'@/lib/vulnerabilities/schema':{},'@/lib/vulnerabilities/store':{},'@/lib/vulnerabilities/scans':{...scans,expireScans:async()=>{},ensureOrganizationMonitoring:async()=>{bootstrapCalls++;await scans.ensureOrganizationMonitoring();}}});
const request=(user,body)=>new Request('http://localhost/api/fixture',{method:body?'POST':'GET',headers:{...(user?{'x-fixture-user':user}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function fixture(role){const id=randomUUID();await query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Monitoring fixture '+role,id+'@example.invalid']);await query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[id,role]);return id;}
const oldTarget=process.env.SECURITY_SCAN_TARGET_URL,oldToken=process.env.SECURITY_SCAN_WORKER_TOKEN;
process.env.SECURITY_SCAN_TARGET_URL='http://localhost:3000';process.env.SECURITY_SCAN_WORKER_TOKEN='fixture-token-'+'a'.repeat(32);
try{
 await c.query('BEGIN');const adminA=await fixture('admin'),adminB=await fixture('admin'),employee=await fixture('employee');await query('UPDATE organization_workspace SET owner_id=$1 WHERE id=true',[adminA]);
 const claim=()=>worker.POST(new Request('http://localhost/api/service-review-center/scans/worker',{method:'POST',headers:{Authorization:'Bearer '+process.env.SECURITY_SCAN_WORKER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'claim',capabilities:{zap:false,trivy:false}})}));
 // Worker authenticates independently of any account session or browser registration.
 assert.equal((await worker.POST(request(null,{action:'claim',capabilities:{zap:false,trivy:false}}))).status,401);assert.equal(bootstrapCalls,0);
 assert.equal((await claim()).status,200);assert.equal(bootstrapCalls,1);
 let saved=(await query('SELECT frequency FROM security_scan_schedules WHERE user_id=$1',[adminA])).rows[0];assert.equal(saved.frequency,'continuous');
 const a=await (await scanRoute.GET(request(adminA))).json(),b=await (await scanRoute.GET(request(adminB))).json();assert.deepEqual(a,b);assert.equal(b.schedule.frequency,'continuous');assert.ok(b.worker.checkedAt);
 assert.equal((await scanRoute.GET(request(employee))).status,401);assert.equal((await scanRoute.GET(request(null))).status,401);
 assert.equal((await scanRoute.POST(request(adminB,{action:'schedule',frequency:'manual'}))).status,200);
 await claim();saved=(await query('SELECT frequency FROM security_scan_schedules WHERE user_id=$1',[adminA])).rows[0];assert.equal(saved.frequency,'manual','Worker restart preserves explicit pause');
 assert.equal((await query('SELECT 1 FROM security_scan_schedules WHERE user_id=$1',[adminB])).rowCount,0,'Second Admin does not create a personal schedule');
 assert.equal((await scanRoute.POST(request(adminA,{action:'schedule',frequency:'continuous'}))).status,200);assert.equal((await (await scanRoute.GET(request(adminB))).json()).schedule.frequency,'continuous');
 const alert=(await query("INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail) VALUES($1,'review-center',$2,'critical','Rollback monitoring fixture','Synthetic alert, not a security assessment') RETURNING id",[adminA,'vulnerability:'+randomUUID()])).rows[0].id;
 const feedA=await (await alertRoute.GET(request(adminA))).json(),feedB=await (await alertRoute.GET(request(adminB))).json();assert.deepEqual(feedA,feedB);assert.ok(feedB.alerts.some(x=>x.id===alert));
 assert.equal((await alertRoute.POST(request(adminB,{action:'acknowledge',id:alert}))).status,200);
 assert.equal((await (await alertRoute.GET(request(adminA))).json()).alerts.find(x=>x.id===alert).state,'acknowledged');
 assert.equal((await query('SELECT actor_id FROM platform_alert_status_history WHERE alert_id=$1',[alert])).rows[0].actor_id,adminB);
 console.log('PASS: authenticated server worker bootstraps monitoring without login/page visits, preserves pauses, and two Admin sessions share schedule, jobs, heartbeat, alerts and acknowledgement with the actual actor audited. All fixtures roll back.');
}finally{await tail;await c.query('ROLLBACK');c.release();await pool.end();if(oldTarget===undefined)delete process.env.SECURITY_SCAN_TARGET_URL;else process.env.SECURITY_SCAN_TARGET_URL=oldTarget;if(oldToken===undefined)delete process.env.SECURITY_SCAN_WORKER_TOKEN;else process.env.SECURITY_SCAN_WORKER_TOKEN=oldToken;}
