import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
let tail=Promise.resolve();
const query=(sql,args)=>{const pending=tail.then(()=>c.query(sql,args));tail=pending.catch(()=>{});return pending;};
const db={query,connect:async()=>({query:(sql,args)=>['BEGIN','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[],rowCount:0}):query(sql,args),release(){}})};
const access={workspaceAccess:async id=>(await query('SELECT * FROM workspace_members WHERE user_id=$1',[id])).rows[0]};
const permissions=load('lib/workspace-permissions.ts');
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const transport={InputError};
const org={organizationOwner:async()=>(await query('SELECT owner_id FROM organization_workspace WHERE id=true')).rows[0].owner_id};
const context=load('lib/eassist/organization-context.ts',{'@/lib/organization':org,'@/lib/workspace-access':access,'@/lib/workspace-permissions':permissions,'./transport':transport});
const alerts=load('lib/eassist/organization-alerts.ts',{'@/lib/db':{db},'@/lib/workspace-access':access,'@/lib/workspace-permissions':permissions,'./transport':transport});
const types=load('lib/eassist/types.ts');
const fullOrg=load('lib/organization.ts',{'@/lib/db':{db}});
const reviewRoute=load('app/api/service-review-center/records/route.ts',{'@/lib/db':{db},'@/lib/request-session':{getRequestSession:async request=>({user:{id:request.headers.get('x-fixture-user')}})},'@/lib/eassist/transport':{InputError},'@/lib/service-review/ingestion':{},'@/lib/workspace-access':access,'@/lib/organization':fullOrg,'@/lib/eassist/organization-context':context});
const policy={allow_runs:true,allow_writes:true,allow_deletes:false,require_confirmation:true,require_https:true,max_concurrent:3};
const store=load('lib/eassist/store.ts',{'./organization-context':context,'./organization-alerts':alerts,'@/lib/workspace-access':access,'@/lib/workspace-permissions':permissions,'@/lib/db':{db},'./transport':transport,'./types':types,'./security':{securityPolicy:async()=>policy}});
async function fixture(role){const id=randomUUID();await query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Organization test '+role,id+'@example.invalid']);await query("UPDATE workspace_members SET role=$2,department_code=1,qualification_code='B',employment_verified_at=CASE WHEN $2='employee' THEN now() ELSE NULL END WHERE user_id=$1",[id,role]);return id;}
try{
 await c.query('BEGIN');
 const adminA=await fixture('admin'),adminB=await fixture('admin'),employee=await fixture('employee'),manager=await fixture('manager'),user=await fixture('user'),quiet=await fixture('user');
 await query('UPDATE organization_workspace SET owner_id=$1 WHERE id=true',[adminA]);
 const connectionId=randomUUID();
 await query("INSERT INTO eassist_connections(id,user_id,name,kind,base_url,enabled,secret_cipher) VALUES($1,$2,'Shared test integration','semaphore','https://example.invalid',false,'ENCRYPTED_TEST')",[connectionId,adminA]);
 const kinds=['alerts','silences','incidents','templates','schedules','inventory','environment','keys','repositories','users','status'];
 for(const kind of kinds)await query("INSERT INTO eassist_records(id,user_id,connection_id,kind,external_id,data) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[randomUUID(),adminA,connectionId,kind,kind,JSON.stringify(kind==='alerts'?{labels:{alertname:'External test'},state:'active'}:{name:'Shared '+kind})]);
 const fixtureAlerts=[];
 for(const affected of [adminA,adminB,employee,manager,user])fixtureAlerts.push((await query("INSERT INTO platform_alerts(user_id,source,event_key,summary,affected_user_id) VALUES($1,'organization',$2,'Shared fixture alert',$3) RETURNING id",[adminA,randomUUID(),affected])).rows[0].id);
 const reviewKey='shared-review-fixture-'+randomUUID();
 await query("INSERT INTO service_review_records(id,user_id,record_type,record_key,payload) VALUES($1,$2,'health',$3,$4::jsonb)",[randomUUID(),adminA,reviewKey,JSON.stringify({label:'Shared fixture health',value:99,status:'Healthy',description:'Shared service description '+('x'.repeat(600)),enrichment:{state:'ready',descriptionSource:'OpenAI',checkedAt:'2026-10-08T10:00:00Z',error:'PRIVATE_DIAGNOSTIC',secret:'NOT_FOR_MANAGER'},operationalError:'PRIVATE_DIAGNOSTIC',privateDiagnostic:'NOT_FOR_MANAGER'})]);
 const readReview=async id=>reviewRoute.GET(new Request('http://localhost/api/service-review-center/records',{headers:{'x-fixture-user':id}}));
 const reviewA=await (await readReview(adminA)).json(),reviewB=await (await readReview(adminB)).json(),reviewManager=await (await readReview(manager)).json();
 const readingA=reviewA.records.find(r=>r.recordKey===reviewKey),readingB=reviewB.records.find(r=>r.recordKey===reviewKey),readingM=reviewManager.records.find(r=>r.recordKey===reviewKey);
 assert.equal(reviewA.organization.scope,'Organization');assert.deepEqual(reviewA.organization,reviewManager.organization);
 assert.deepEqual(readingA,readingB);assert.equal(readingM.payload.value,readingA.payload.value);assert.equal(readingM.payload.privateDiagnostic,undefined);
 assert.equal(readingM.payload.description,readingA.payload.description);assert.equal(readingM.payload.enrichment.state,readingA.payload.enrichment.state);assert.equal(readingM.payload.enrichment.checkedAt,readingA.payload.enrichment.checkedAt);assert.equal(readingM.payload.enrichment.descriptionSource,readingA.payload.enrichment.descriptionSource);assert.equal(readingM.payload.enrichment.error,undefined);assert.equal(readingM.payload.enrichment.secret,undefined);assert.equal(readingM.payload.operationalError,undefined);
 for(const viewer of [user,employee])assert.equal((await readReview(viewer)).status,403);
 const first=await store.snapshot(adminA),second=await store.snapshot(adminB);
 assert.deepEqual(first.connections,second.connections);
 for(const kind of kinds)assert.deepEqual(first.records.filter(r=>r.connection_id===connectionId&&r.kind===kind),second.records.filter(r=>r.connection_id===connectionId&&r.kind===kind));
 assert.ok(!('secret_cipher' in first.connections.find(x=>x.id===connectionId)));
 for(const id of fixtureAlerts){const a=first.records.find(r=>r.id===id),b=second.records.find(r=>r.id===id);assert.deepEqual(a,b);assert.equal(a.data.state,'active');}
 const employeeAlert=second.records.find(r=>r.id===fixtureAlerts[2]);assert.equal(employeeAlert.data.labels.account_user_id,employee);assert.equal(employeeAlert.data.labels.account_role,'employee');assert.ok(employeeAlert.data.labels.account_id.includes('E'));
 assert.ok(second.alertAccounts.some(a=>a.user_id===quiet));assert.equal(second.records.some(r=>r.kind==='alerts'&&r.data.labels?.account_user_id===quiet),false);
 for(const viewer of [manager,employee,user])await assert.rejects(store.snapshot(viewer),/Admin access/);
 await alerts.changeOrganizationAlert(adminB,fixtureAlerts[2],'acknowledged');
 let status=(await alerts.organizationAlertData(adminA)).alerts.find(a=>a.id===fixtureAlerts[2]);assert.equal(status.state,'acknowledged');
 await assert.rejects(alerts.changeOrganizationAlert(user,fixtureAlerts[2],'resolved','Verified fixture recovery'),/Admin access/);
 await alerts.changeOrganizationAlert(adminA,fixtureAlerts[2],'resolved','Verified fixture recovery');
 status=(await alerts.organizationAlertData(adminB)).alerts.find(a=>a.id===fixtureAlerts[2]);assert.equal(status.state,'resolved');
 const history=(await query('SELECT actor_id,new_state FROM platform_alert_status_history WHERE alert_id=$1 ORDER BY created_at,id',[fixtureAlerts[2]])).rows;
 assert.ok(history.some(x=>x.actor_id===adminB&&x.new_state==='acknowledged'));assert.ok(history.some(x=>x.actor_id===adminA&&x.new_state==='resolved'));
 await context.withOperationsActor(adminB,()=>store.audit(adminA,connectionId,'Shared fixture action'));
 assert.equal((await query("SELECT actor_id FROM eassist_activity WHERE action='Shared fixture action' AND user_id=$1",[adminA])).rows[0].actor_id,adminB);
 console.log('PASS: two Admins share connections and every operational record category, all account alerts, affected IDs, no-alert accounts, acknowledgement/resolution, true actor audit; Manager/Employee/User denied eAssist; Admins and Manager share overview readings with Manager-safe projection and User/Employee denied. Fixtures rolled back.');
}finally{await tail;await c.query('ROLLBACK');c.release();await pool.end();}

