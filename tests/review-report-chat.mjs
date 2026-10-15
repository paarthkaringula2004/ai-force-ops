import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {reviewRouteFixture} from './helpers/review-routes.mjs';
const base=process.env.REPORT_TEST_URL||'http://localhost:3000',pool=new Pool({connectionString:process.env.DATABASE_URL});
let id,other;const fixture=reviewRouteFixture(pool);let actor;
try{
 actor=await fixture.identity();id=actor.id;
 const form=new FormData();form.set('file',new Blob(['IP,QID,Title,Severity,Status\n10.40.1.4,92094,SMB signing review,High,Active']),'chat-evidence.csv');
 const response=await fixture.request(actor,'/api/service-review-center/vulnerabilities',form);const preview=await response.json();assert.equal(response.status,200,preview.error);
 const save=await fixture.request(actor,'/api/service-review-center/vulnerabilities',{action:'save',id:preview.id,mapping:preview.mapping,scope:'Disposable chat evidence',scannedAt:'2026-10-01T00:00:00Z'});assert.equal(save.status,200);
 const chat=await fixture.request(actor,'/api/service-review-center/chat',{requestId:randomUUID(),question:'How many vulnerabilities are stored in my reports? Mention the SMB finding and distinguish this report from a current scan.'});
 const result=await chat.json();assert.equal(chat.status,200,result.error);assert.equal(result.status,'completed');assert.ok(result.evidence.some(e=>e.type==='vulnerability'&&e.facts.qid==='92094'));assert.ok(result.evidence.some(e=>e.type==='vulnerability-summary'&&e.facts.total===1));assert.match(result.answer,/SMB/i);assert.match(result.answer,/stored scanner observations, not a current scan/);
 const dated=await fixture.request(actor,'/api/service-review-center/chat',{requestId:randomUUID(),question:'How many vulnerabilities are in reports for 2026-10-02?'});const dateResult=await dated.json();assert.equal(dated.status,200);assert.equal(dateResult.evidence.find(e=>e.type==='vulnerability-summary').facts.total,0);assert.ok(!dateResult.evidence.some(e=>e.type==='vulnerability'));
 other=await fixture.identity();const isolated=await fixture.request(other,'/api/service-review-center/chat',{requestId:randomUUID(),question:'How many vulnerabilities are stored in reports?'});const isolatedResult=await isolated.json();assert.equal(isolated.status,200);assert.equal(isolatedResult.evidence.find(e=>e.type==='vulnerability-summary').facts.total,0);assert.ok(!isolatedResult.evidence.some(e=>e.type==='vulnerability'));
 console.log('PASS: Review Center assistant uses owner-scoped scanner facts, exact stored totals, historical scope and separate scan/import provenance.');
}finally{if(other)await pool.query('DELETE FROM "user" WHERE id=$1',[other.id]);if(id)await pool.query('DELETE FROM "user" WHERE id=$1',[id]);await pool.end();}
