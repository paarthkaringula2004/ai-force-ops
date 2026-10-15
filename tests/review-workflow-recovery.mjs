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

import {load} from './helpers/load-ts.mjs';
const {db}=load('lib/db.ts');
const fixtureContext={sharedOperationsOwner:async user=>user,operationsActor:user=>user};
const deps={'@/lib/db':{db},'./db':{db},'./organization-context':fixtureContext,'@/lib/eassist/organization-context':fixtureContext,'@/lib/organization':{organizationOwner:async()=>null,organizationEvent:async()=>{}}};

const {action}=load('lib/eassist/actions.ts',deps);
const {defaultSecurity}=load('lib/eassist/security.ts',deps);
const {syncTask}=load('lib/eassist/sync.ts',deps);
const {operationalSnapshot}=load('lib/service-review/assistant-operations.ts',deps);
const {executionFailure,startPlatformRun,finishPlatformRun}=load('lib/eassist/platform.ts',deps);
const users=[`workflow-recovery-${randomUUID()}`,`workflow-recovery-${randomUUID()}`];let sourceUnavailable=false;let recoveryStatus='running';const launchedTasks=new Map();let launches=0;
const server=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};const path=new URL(req.url,'http://fixture').pathname;let value=[];if(sourceUnavailable){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'temporary fixture outage'}));return;}
 if(path.endsWith('/templates'))value=[{id:7,name:'React fixture'}];
 else if(path.endsWith('/tasks/last'))value=[{id:23,template_id:7,status:'error',message:'Build failed'}];
 else if(path.endsWith('/tasks/23'))value={id:23,template_id:7,status:'error',message:'Build failed'};
 else if(/\/tasks\/24$/.test(path))value={...launchedTasks.get('24'),status:recoveryStatus};
 else if(path.endsWith('/output'))value=[{output:'Build failed: transient fixture dependency fetch error'}];
 else if(path.endsWith('/tasks')&&req.method==='POST'){value={id:++launches+23,template_id:body.template_id,status:'running',message:body.message};launchedTasks.set(String(value.id),value);}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));process.env.EASSIST_ALLOWED_ORIGINS=`http://127.0.0.1:${server.address().port}`;
try{
 for(const id of users)await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',[id,'Disposable recovery test',id+'@example.invalid']);
 for(const id of users)await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1",[id]);
 assert.match(executionFailure({status:401,message:'secret=never-show'}),/authentication/);assert.doesNotMatch(executionFailure({status:401,message:'secret=never-show'}),/never-show/);
 const event=await startPlatformRun(users[0],'reactflow');await finishPlatformRun(users[0],event,false,{status:429});assert.match((await operationalSnapshot(users[0],'react')).events[0].summary,/rate limit or quota/);
 await action(users[0],{action:'security.save',policy:{...defaultSecurity,require_https:false}});
 const c=(await action(users[0],{action:'connection.save',name:'Fixture workflow',kind:'semaphore',base_url:process.env.EASSIST_ALLOWED_ORIGINS,project_id:'1',auth_type:'none'})).id;
 await db.query("UPDATE eassist_connections SET state='connected',checked_at=now(),sync_after=now()+interval '1 hour',lease_until=now()+interval '1 hour' WHERE id=$1",[c]);
 await db.query("INSERT INTO eassist_records(id,user_id,connection_id,kind,external_id,data) VALUES($1,$2,$3,'templates','7','{\"id\":7,\"name\":\"React fixture\"}'::jsonb)",[randomUUID(),users[0],c]);
 const {connection}=load('lib/eassist/store.ts',deps);const privateC=await connection(users[0],c);await syncTask(privateC,'23');
 assert.equal((await operationalSnapshot(users[0],'react')).tasks[0].canRetry,true);
 assert.equal((await operationalSnapshot(users[1],'react')).tasks.length,0);
 const approval=await action(users[0],{action:'task.authorize',connectionId:c,id:'7'}),key=randomUUID();
 const run={action:'task.run',connectionId:c,id:'7',approvalId:approval.approvalId,requestKey:key,message:'Review Center recovery for failed task 23'};
 const result=await action(users[0],run);assert.equal(result.id,'24');assert.deepEqual(await action(users[0],run),result);assert.equal(launches,1);
 const {verifyRecovery,repairSource}=load('lib/service-review/recovery.ts',deps);
 assert.equal((await verifyRecovery(privateC,'24')).verified,false);
 recoveryStatus='error';const bad=await verifyRecovery(privateC,'24');assert.equal(bad.terminal,true);assert.equal(bad.verified,false);
 recoveryStatus='success';assert.equal((await verifyRecovery(privateC,'24')).verified,true);
 await assert.rejects(()=>verifyRecovery({...privateC,user_id:users[1]},'24'),e=>e.status===404);
 await assert.rejects(()=>verifyRecovery(privateC,'23'),e=>e.status===404);
 assert.equal((await repairSource(privateC)).pending,true);
 await db.query("UPDATE eassist_connections SET lease_until=NULL WHERE id=$1",[c]);
 const checked=await repairSource(privateC);assert.equal(checked.verified,true);
 sourceUnavailable=true;await db.query("UPDATE eassist_connections SET lease_until=NULL WHERE id=$1",[c]);assert.equal((await repairSource(privateC)).verified,false);
 await action(users[0],{action:'security.save',policy:{...defaultSecurity,require_https:false,allow_runs:false}});
 await assert.rejects(()=>action(users[0],{action:'task.authorize',connectionId:c,id:'7'}),e=>e.status===403);
 console.log('PASS: failed workflow log collection, named workflow lookup, owner isolation, approved recovery launch, idempotent replay, source task identity, and policy denial against a local runner fixture.');
}finally{for(const id of users)await db.query('DELETE FROM "user" WHERE id=$1',[id]);await new Promise(resolve=>server.close(resolve));await db.end();}
