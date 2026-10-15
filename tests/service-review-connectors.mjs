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
const {projectReadings}=await import('../lib/service-review/model.ts');
const {importConnection}=await import('../lib/service-review/bridge.ts');
const {validateReading,ingestReadings,collectorUser,requireSameOrigin}=await import('../lib/service-review/ingestion.ts');
const {createHash}=await import('node:crypto');
const users=[`review-test-${randomUUID()}`,`review-test-${randomUUID()}`];let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
const source={id:randomUUID(),user_id:users[0],name:'Fixture monitoring',kind:'prometheus'};
const base=Math.floor((Date.now()-600000)/60000)*60000;
const at=new Date(base).toISOString(), tick=(ms)=>new Date(base+ms).toISOString();
const snapshot={targets:[{labels:{job:'fixture',instance:'fixture:1'},health:'up',lastScrape:at}],metrics:{availability24h:[{metric:{job:'fixture',instance:'fixture:1'},value:[1,'0.95']}],samples24h:[{metric:{job:'fixture',instance:'fixture:1'},value:[1,'100']} ]}};
const projection=projectReadings(source,[{kind:'monitoring',external_id:'current',data:snapshot}],at);
check(projection.find(r=>r.recordType==='health').payload.country==='','Never invent a location');
check(projection.find(r=>r.recordType==='availability').payload.availability===95,'Uses actual healthy sample ratio');
check(projection.find(r=>r.recordType==='availability').payload.samples===100,'Preserves sample coverage');
check(!projection.some(r=>r.recordKey.endsWith(':criticalIncidents')),'Down targets are not incidents');
check(!projection.some(r=>r.recordKey.includes('financial')),'Never invent business savings');
const tasks=projectReadings({...source,kind:'semaphore'},[{kind:'tasks',external_id:'1',data:{id:1,status:'success'}},{kind:'tasks',external_id:'2',data:{id:2,status:'error'}},{kind:'tasks',external_id:'3',data:{id:3,status:'waiting_confirmation'}}],at);
check(tasks.find(r=>r.recordKey.endsWith(':automationSuccess')).payload.value===50,'Success rate excludes waiting tasks');
check(tasks.find(r=>r.recordKey.endsWith(':pendingTasks')).payload.value===1,'Approvals accurately counted');
check(!projectReadings({...source,kind:'semaphore'},[],at).some(r=>r.recordKey.endsWith(':automationSuccess')),'No tasks is not 100% success');
const alerts=projectReadings({...source,kind:'alertmanager'},[
 {kind:'alerts',external_id:'1',data:{state:'active',labels:{severity:'critical'},endsAt:tick(60000)}},
 {kind:'alerts',external_id:'2',data:{state:'resolved',labels:{severity:'critical'},endsAt:tick(60000)}},
 {kind:'alerts',external_id:'3',data:{state:'suppressed',labels:{severity:'warning'},endsAt:tick(60000)}},
 {kind:'alerts',external_id:'4',data:{state:'active',labels:{severity:'critical'},endsAt:tick(-60000)}}],at);
check(alerts.find(r=>r.recordKey.endsWith(':activeAlerts')).payload.value===2,'Inactive, resolved and expired alerts excluded');
check(alerts.find(r=>r.recordKey.endsWith(':criticalAlerts')).payload.value===1,'Only explicitly critical current alerts counted');
const incidents=projectReadings({...source,kind:'servicenow'},[{kind:'incidents',external_id:'1',data:{state:'2',priority:'1'}},{kind:'incidents',external_id:'2',data:{state:'7',priority:'1'}}],at);
check(incidents.find(r=>r.recordKey.endsWith(':openIncidents')).payload.value===1,'Closed incidents excluded');
check(projectReadings({...source,kind:'servicenow'},[{kind:'incidents',external_id:'1',data:{state:'2',priority:'1'}},{kind:'incident_scope',external_id:'current',data:{ids:[]}}],at).find(r=>r.recordKey.endsWith(':openIncidents')).payload.value===0,'Incidents outside the successfully collected scope are not counted');
const body={batchId:randomUUID(),sourceName:'Fixture finance',records:[{recordType:'metric',recordKey:'financial',payload:{label:'Verified savings',value:25,unit:'USD'},observedAt:at}]};
check(validateReading({...body.records[0],payload:{label:'Bad',value:Infinity}})===null,'Rejects non-finite values');
check(validateReading({recordType:'availability',recordKey:'bad',payload:{service:'Test',availability:101}})===null,'Availability must be between 0 and 100');
check(validateReading({recordType:'inventory',recordKey:'bad',payload:{region:'Test',category:'Server',count:-1}})===null,'Rejects negative inventory');
check(validateReading({recordType:'forecast',recordKey:'bad',payload:{environment:'Test',period:'Today',lowerBound:10,upperBound:5}})===null,'Rejects inverted forecast bounds');
assert.throws(()=>requireSameOrigin(new Request('https://app.test/api',{headers:{origin:'https://foreign.test'}})));checks++;
try {
 for(const id of users)await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',[id,'Review connector test',`${id}@example.invalid`]);
 await db.query(`INSERT INTO eassist_connections(id,user_id,name,kind,base_url,state,checked_at) VALUES($1,$2,$3,'prometheus','https://fixture.invalid','connected',now())`,[source.id,source.user_id,source.name]);
 await db.query(`INSERT INTO eassist_records(id,user_id,connection_id,kind,external_id,data) VALUES($1,$2,$3,'monitoring','current',$4::jsonb)`,[randomUUID(),source.user_id,source.id,JSON.stringify(snapshot)]);
 await importConnection(source,at);await importConnection(source,tick(10000));
 let rows=(await db.query('SELECT * FROM service_review_records WHERE user_id=$1',[users[0]])).rows;
 check(rows.length===projection.length,'Same-minute retries do not duplicate readings');
 check(rows.every(r=>r.source_connection_id===source.id),'Every reading retains source provenance');
 check(rows.find(r=>r.record_type==='health').observed_at.toISOString()===at,'Scrape timestamp retained');
 await importConnection(source,tick(60000));
 check((await db.query('SELECT count(*)::int AS n FROM service_review_records WHERE user_id=$1',[users[0]])).rows[0].n===projection.length*2,'Next minute preserves history');
 check((await db.query('SELECT count(*)::int AS n FROM service_review_records WHERE user_id=$1 AND is_current=true',[users[0]])).rows[0].n===projection.length,'Only newest snapshot marked current');
 await db.query(`UPDATE eassist_records SET data=$2::jsonb WHERE connection_id=$1`,[source.id,JSON.stringify({targets:[],metrics:{}})]);
 await importConnection(source,tick(120000));
 check((await db.query("SELECT 1 FROM service_review_records WHERE source_connection_id=$1 AND is_current=true AND record_type='health'",[source.id])).rowCount===0,'Removed targets never stay current');
 await importConnection(source,at);
 check((await db.query('SELECT imported_at FROM service_review_sync WHERE connection_id=$1',[source.id])).rows[0].imported_at.toISOString()===tick(120000),'Older projection cannot rewind history');
 await db.query('UPDATE eassist_connections SET enabled=false WHERE id=$1',[source.id]);await importConnection(source,tick(180000));
 check((await db.query('SELECT imported_at FROM service_review_sync WHERE connection_id=$1',[source.id])).rows[0].imported_at.toISOString()===tick(120000),'Disabled sources are not collected');
 check((await db.query('SELECT 1 FROM service_review_records WHERE user_id=$1',[users[1]])).rowCount===0,'Account isolation');
 await db.query('UPDATE eassist_connections SET enabled=true WHERE id=$1',[source.id]);
 await db.query("DELETE FROM eassist_records WHERE connection_id=$1 AND kind='monitoring'",[source.id]);
 await importConnection(source,tick(240000));
 const failure=(await db.query('SELECT imported_at,last_error FROM service_review_sync WHERE connection_id=$1',[source.id])).rows[0];
 check(failure.imported_at.toISOString()===tick(120000)&&failure.last_error.length>0,'Projection failure retains last successful time and reports separate error');
 check((await db.query('SELECT count(*)::int AS n FROM service_review_records WHERE source_connection_id=$1 AND is_current=true',[source.id])).rows[0].n===3,'Projection rollback retains previous current snapshot');

 check((await ingestReadings(users[0],body)).duplicate===false,'External data accepted');
 check((await ingestReadings(users[0],body)).duplicate===true,'Same batch retry is idempotent');
 await assert.rejects(()=>ingestReadings(users[0],{...body,sourceName:'Different'}),e=>e.status===409);checks++;
 const token='fixture-collector-'+randomUUID();await db.query('INSERT INTO service_review_tokens(user_id,token_hash) VALUES($1,$2)',[users[0],createHash('sha256').update(token).digest('hex')]);
 const request=new Request('https://app.test/api',{headers:{authorization:`Bearer ${token}`}});
 check(await collectorUser(request)===users[0],'Collector token scoped to owner');
 await assert.rejects(()=>collectorUser(request),e=>e.status===429);checks++;
 await db.query("UPDATE service_review_tokens SET expires_at=now()-interval '1 second' WHERE user_id=$1",[users[0]]);
 await assert.rejects(()=>collectorUser(request),e=>e.status===401);checks++;
 await db.query('DELETE FROM service_review_tokens WHERE user_id=$1',[users[0]]);
 await assert.rejects(()=>collectorUser(request),e=>e.status===401);checks++;
 const count=(await db.query('SELECT count(*)::int AS n FROM service_review_records WHERE user_id=$1',[users[0]])).rows[0].n;
 await assert.rejects(()=>ingestReadings(users[0],{...body,batchId:randomUUID(),records:[body.records[0],{recordType:'unknown'}]}));checks++;
 check((await db.query('SELECT count(*)::int AS n FROM service_review_records WHERE user_id=$1',[users[0]])).rows[0].n===count,'Invalid batch leaves no partial data');
 console.log(`PASS: ${checks} Review Center connector assertions.`);
}finally {
 for(const table of ['eassist_records','eassist_connections','eassist_revisions'])await db.query(`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`,[users]);
 await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);await db.end();
}
