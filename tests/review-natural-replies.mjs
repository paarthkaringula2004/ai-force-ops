import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
import {load} from './helpers/load-ts.mjs';
const context=load('lib/service-review/reply-context.ts');
assert.ok(context.isCapabilityQuestion('What is your capability?'));
assert.ok(context.isDailyOverview('I want over all data of today 8-10-2026'));
const period=context.reviewPeriod('I want over all data of today 8-10-2026',new Date('2026-10-12T12:00:00Z'));
assert.equal(period.day,'2026-10-08');assert.equal(period.start,'2026-10-07T18:30:00.000Z');
assert.ok(!context.withinPeriod('2026-10-05T08:00:00Z',period));
assert.ok(context.withinPeriod('2026-10-08 10:00:00',period));
assert.equal(context.sourceDate('2026-10-08 10:00:00'),'2026-10-08T10:00:00.000Z');
assert.throws(()=>context.reviewPeriod('31-02-2026'));
assert.match(context.reviewFollowup('what is this?',[{question:'Missing Anti-clickjacking Header'}]),/clickjacking/);
assert.equal(context.reviewFollowup('fix this',[{question:'Missing Anti-clickjacking Header'}]),'fix this');
const display=load('lib/service-review/operational-display.ts'),now=new Date().toISOString();
const opsDb={query:async(sql,args=[])=>{
 assert.ok(!/^(?:INSERT|UPDATE|DELETE)/i.test(sql),'Read-only diagnosis unexpectedly mutated data.');
 if(sql.includes('FROM eassist_connections'))return {rows:[{id:'sn',name:'ServiceNow Development',kind:'servicenow',enabled:true,state:'connected',checked_at:now,imported_at:now,last_error:'',import_error:''}]};
 if(sql.includes('FROM service_review_records'))return {rows:[]};
 if(sql.includes("t.kind='tasks'"))return {rows:[{connection_id:'sn',external_id:'1',data:{status:'success',end:'2026-10-05T08:00:00Z'},template_name:'Old run',source:'Semaphore',state:'connected',enabled:true,checked_at:now,updated_at:now},{connection_id:'sn',external_id:'2',data:{status:'success',end:'2026-10-08T08:00:00Z'},template_name:'Requested day run',source:'Semaphore',state:'connected',enabled:true,checked_at:now,updated_at:now}]};
 if(sql.includes('max(updated_at)'))return {rows:[{active:0,urgent:0}]};
 if(sql.includes('FROM platform_alerts'))return {rows:[]};
 if(sql.includes('worker_health')||sql.includes('FROM security_scan_worker'))return {rows:[{checked_at:now}]};
 if(sql.includes('security_scan_jobs')||sql.includes('eassist_activity')||sql.includes('security_tool_connections'))return {rows:[]};
 if(sql.includes('FROM platform_events'))return {rows:[]};
 if(sql.includes("r.kind IN ('alerts','incidents')"))return {rows:[{kind:'incidents',name:'ServiceNow Development',state:'connected',checked_at:now,updated_at:now,data:{number:'INC-OLD',state:'3',short_description:'Old source incident',sys_updated_on:'2026-10-01 08:00:00'}},{kind:'incidents',name:'ServiceNow Development',state:'connected',checked_at:now,updated_at:now,data:{number:'INC-DAY',state:'2',short_description:'Requested day incident',sys_updated_on:'2026-10-08 08:00:00'}}]};
 throw new Error('Unhandled operations fixture query: '+sql.slice(0,80)+args.length);
}};
const ops=load('lib/service-review/assistant-operations.ts',{
 '@/lib/db':{db:opsDb},'@/lib/eassist/organization-context':{sharedOperationsOwner:async u=>u},'@/lib/workspace-access':{workspaceAccess:async()=>({role:'admin'})},'@/lib/workspace-permissions':{permitted:()=>true},'@/lib/epace/store':{PaceError:Error},'@/lib/eassist/store':{connection:async()=>{throw new Error('No recovery allowed');}},'./recovery':{repairSource:async()=>{throw new Error('No recovery allowed');}},'./operational-display':display,'@/lib/eassist/types':{array:v=>Array.isArray(v)?v:[],object:v=>v&&typeof v==='object'?v:{}},'./reply-context':context
});
const snapshot=await ops.operationalSnapshot('fixture','I want over all data of today 8-10-2026');
assert.equal(snapshot.tasks.length,1);assert.equal(snapshot.tasks[0].name,'Requested day run');
assert.equal(snapshot.sourceEvents.length,1);assert.equal(snapshot.sourceEvents[0].number,'INC-DAY');assert.equal(snapshot.sourceEvents[0].status,'In progress');
const daily=await ops.operationalAnswer('fixture','I want over all data of today 8-10-2026');
assert.match(daily.answer,/8 October 2026/);assert.match(daily.answer,/Requested day run/);assert.doesNotMatch(daily.answer,/Old run|INC-OLD/);
const findings=[{title:'OpenAI Project API Key',qid:'key:line1',url:'sample.ts',dns:'localhost',scanner:'Trivy',severity:'Critical',status:'Active'},{title:'OpenAI Project API Key',qid:'key:line1',url:'sample.ts',dns:'localhost',scanner:'Trivy',severity:'Critical',status:'Active'},{title:'Missing Anti-clickjacking Header',qid:'zap:10020',dns:'localhost',scanner:'ZAP',severity:'Medium',status:'Active',solution:'Review frame-ancestors.'}];
const secDb={query:async sql=>sql.includes("status='completed'")?{rows:[{findingCount:findings.length,findings,completedAt:'2026-10-08T08:00:00Z'}]}:sql.includes('vulnerability_findings')?{rows:[]}:{rows:[{status:'running',phase:'Starting baseline',progress:10}]}};
const sec=load('lib/service-review/security-reply.ts',{'@/lib/db':{db:secDb},'@/lib/vulnerabilities/scans':{scanProjection:'id'},'./reply-context':context,'./assistant-operations':ops,'./operational-display':display});
const xss=await sec.securityReviewReply('fixture','What about XSS?');
assert.match(xss.answer,/does not run active XSS/);assert.match(xss.answer,/No matching XSS/);assert.doesNotMatch(xss.answer,/OpenAI Project API Key —/);
const click=await sec.securityReviewReply('fixture','Missing Anti-clickjacking Header - what is this?');
assert.match(click.answer,/not XSS/);assert.match(click.answer,/frame-ancestors/);assert.equal(click.evidence.length,1);
const security=await sec.securityReviewReply('fixture','latest security update');assert.match(security.answer,/1 distinct critical\/high/);assert.equal(security.evidence.filter(e=>e.facts.title==='OpenAI Project API Key').length,1);
const natural=load('lib/service-review/natural-reply.ts',{'@/lib/model-usage':{recordModelUsage:async()=>{}},'@/lib/model-pricing':{tokenDetails:()=>({})},'./assistant-operations':ops});
console.log('PASS: capability recognition, date boundaries, event-vs-import dates, status labels, topic follow-ups, no inherited mutation, XSS/clickjacking separation and finding deduplication.');
if(process.argv.includes('--live')){
 assert.ok(process.env.OPENAI_API_KEY,'Configure OpenAI first.');
 const cases=[
  {q:'What is your capability?',result:{answer:'I can explain recorded incidents, scan findings and workflow results. I cannot automatically fix systems. Active XSS tests are not available through the continuous passive scanner.',evidence:[]},pattern:/incident|scan|workflow/i},
  {q:'What about XSS?',result:xss,pattern:/XSS|cross.site/i},
  {q:'What is this?',previous:[{question:'Missing Anti-clickjacking Header',answer:click.answer}],result:click,pattern:/clickjack|embed|frame/i},
  {q:'I want over all data of today 8-10-2026',result:daily,pattern:/8 October|8 Oct/i}
 ];
 for(const c of cases){const result=await natural.naturalReviewReply('fixture',c.q,c.previous||[],c.result);assert.ok(result);assert.match(result.answer,c.pattern);assert.doesNotMatch(result.answer,/I couldn.t find that service/);console.log(`PASS real OpenAI: ${c.q}\n${result.answer.slice(0,1400)}\n`);}
}
