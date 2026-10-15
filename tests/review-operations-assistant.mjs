import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {reviewRouteFixture} from './helpers/review-routes.mjs';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),base='http://localhost:3000',users=[];
const fixture=reviewRouteFixture(pool);
async function signup(){const a=await fixture.identity();users.push(a);return a;}
async function api(a,path,body,status=200,origin=base){const r=await fixture.request(a,path,body,origin);const b=await r.json();assert.equal(r.status,status,JSON.stringify(b));return b;}
try{
 await api(null,'/api/service-review-center/operations',null,401);
 const a=await signup(),b=await signup(),c=randomUUID();
 await pool.query("INSERT INTO eassist_connections(id,user_id,name,kind,base_url,project_id,auth_type,username,secret_cipher,enabled,state,last_error,checked_at,sync_after,lease_until) VALUES($1,$2,'Semaphore','semaphore','https://semaphore.invalid','1','none','','',true,'error','Semaphore could not be reached or timed out.',now(),now()+interval '1 hour',now()+interval '1 hour')",[c,a.id]);
 await pool.query("INSERT INTO service_review_sync(connection_id,imported_at,last_error,reading_count) VALUES($1,now()-interval '10 minutes','',2)",[c]);
 await pool.query("INSERT INTO service_review_records(id,user_id,record_type,record_key,payload,observed_at,source_connection_id,source_kind,source_name,is_current) VALUES($1,$2,'health','test-health',$3::jsonb,now()-interval '10 minutes',$4,'semaphore','Semaphore',true)",[randomUUID(),a.id,JSON.stringify({device:'semaphore.invalid',status:'Healthy'}),c]);
 const task=async(kind,id,data)=>pool.query('INSERT INTO eassist_records(id,user_id,connection_id,kind,external_id,data) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[randomUUID(),a.id,c,kind,id,JSON.stringify(data)]);
 await task('templates','7',{name:'React deployment'});await task('tasks','23',{template_id:7,end:'2026-10-06T03:30:00Z',status:'error',message:'Build failed: dependency missing'});await task('output','23',{lines:[{output:'npm failed: missing package. token=private-credential-value'}]});
 await pool.query("INSERT INTO platform_events(user_id,source,action,status,summary) VALUES($1,'reactflow','React editor execution','error','Provider model access denied')",[a.id]);
 const result=await api(a,'/api/service-review-center/chat',{question:'what happened to semaphore?',requestId:randomUUID()});assert.match(result.answer,/connection failed/);assert.match(result.answer,/could not be reached/);assert.match(result.answer,/stale \/ last known/);assert.equal(result.actions[0].kind,'operations');assert.ok(result.evidence.some(e=>e.stale));
 const react=await api(a,'/api/service-review-center/chat',{question:'what happened to that react workflow? show logs',requestId:randomUUID()});assert.match(react.answer,/React deployment/);assert.match(react.answer,/React editor execution/);assert.match(react.answer,/Provider model access denied/);assert.match(react.answer,/dependency missing/);assert.doesNotMatch(react.answer,/private-credential-value/);assert.match(react.answer,/redacted/);
 const whole=await api(a,'/api/service-review-center/chat',{question:'what is the health of the entire website?',requestId:randomUUID()});assert.match(whole.answer,/things need attention/);assert.match(whole.answer,/Semaphore/);assert.match(whole.answer,/Next step/);
 for(const question of ['is everything good?','Everything okay?','Any issues?','anything wrong?']){const friendly=await api(a,'/api/service-review-center/chat',{question,requestId:randomUUID()});assert.match(friendly.answer,/things need attention/);assert.match(friendly.answer,/Summary as of .*IST/);assert.match(friendly.answer,/Run ended: 6 Oct 2026, 9:00:00 am IST/);assert.doesNotMatch(friendly.answer,/No matching|cannot infer|Latest output|```/);assert.equal(friendly.actions[0].autoOpen,false);assert.equal(friendly.actions[0].query,'');}
 const normal=await api(a,'/api/service-review-center/chat',{question:'what happened to that react workflow?',requestId:randomUUID()});assert.doesNotMatch(normal.answer,/```|Latest output|waiting_confirmation/);assert.match(normal.answer,/Next step/);assert.equal(normal.actions[0].autoOpen,false);
 const details=await api(a,'/api/service-review-center/chat',{question:'Show details',requestId:randomUUID()});assert.match(details.answer,/Workflow results/);
 const repair=await api(a,'/api/service-review-center/chat',{question:'recheck Semaphore connection',requestId:randomUUID()});assert.match(repair.answer,/Recovery is pending/);assert.doesNotMatch(repair.answer,/Verified: the source/);
 const other=await api(b,'/api/service-review-center/operations?query=react');assert.equal(other.tasks.length,0);assert.equal(other.connections.length,0);
 await api(b,'/api/service-review-center/operations',{action:'refresh',connectionId:c},404);
 await api(a,'/api/service-review-center/operations',{action:'refresh',connectionId:c},403,'https://untrusted.invalid');
 await api(a,'/api/service-review-center/operations',{action:'retry-workflow',connectionId:c,taskId:'23',requestKey:randomUUID()},400);
 const data=await api(a,'/api/service-review-center/operations?query=react');assert.equal(data.tasks[0].canRetry,false);assert.equal(data.tasks[0].stale,true);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM eassist_operations WHERE user_id=$1',[a.id])).rows[0].n,0);
 console.log('PASS: authoritative source errors override stale Healthy readings; named workflow diagnosis and redacted logs; whole-platform health; owner/origin isolation; explicit recovery confirmation and stale-source retry guard.');
}finally{for(const u of users)await pool.query('DELETE FROM "user" WHERE id=$1',[u.id]);await pool.end();}
