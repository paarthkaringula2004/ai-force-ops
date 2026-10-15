import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import ExcelJS from 'exceljs';
import {writeFile} from 'node:fs/promises';
import {trivyFacts} from '../scripts/security-scanner.mjs';
const base='http://localhost:3000',pool=new Pool({connectionString:process.env.DATABASE_URL}),accounts=[];
async function signup(){const r=await fetch(base+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'Disposable scan test',email:`security-${randomUUID()}@example.invalid`,password:randomUUID()+'Aa1!'})});const data=await r.json();assert.equal(r.status,200);const a={id:data.user.id,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};accounts.push(a);return a;}
async function api(a,path,body,status=200,origin=base){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:a?.cookie||'',Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
try{
 const redacted=trivyFacts({Results:[{Target:'sample.env',Secrets:[{RuleID:'generic',Title:'Potential secret',Severity:'HIGH',StartLine:2,EndLine:2,Match:'NEVER_EXPORT_SECRET'}]}]},base);assert.ok(!JSON.stringify(redacted).includes('NEVER_EXPORT_SECRET'));
 await api(null,'/api/service-review-center/scans',undefined,401);
 const a=await signup(),b=await signup();
 await api(a,'/api/service-review-center/scans',{requestId:randomUUID()},403,'https://untrusted.invalid');
 const requestId=randomUUID(),first=await api(a,'/api/service-review-center/scans',{requestId});
 assert.equal((await api(a,'/api/service-review-center/scans',{requestId})).job.id,first.job.id);
 const start=Date.now();let job;
 while(Date.now()-start<900000){job=(await api(a,'/api/service-review-center/scans')).jobs.find(j=>j.id===first.job.id);console.log(`REAL SCAN: ${job.status} · ${job.progress}% · ${job.phase}`);if(job.status==='failed')throw new Error(job.error);if(job.status==='completed')break;await new Promise(r=>setTimeout(r,10000));}
 assert.equal(job.status,'completed');assert.ok(job.coverage.some(c=>c.tool==='ZAP'&&c.status==='Completed'));assert.ok(job.coverage.some(c=>c.tool==='Trivy'&&c.status==='Completed'));
 const path=`/api/service-review-center/scans?id=${job.id}&format=`;
 await api(b,path+'csv',undefined,404);assert.equal((await api(b,'/api/service-review-center/scans')).jobs.length,0);
 const csv=await fetch(base+path+'csv',{headers:{Cookie:a.cookie}});assert.equal(csv.status,200);const content=await csv.text();assert.match(content,/Record type/);assert.match(content,/Coverage/);assert.match(content,/ZAP/);assert.ok(!content.includes(process.env.OPENAI_API_KEY));
 const excel=await fetch(base+path+'xlsx',{headers:{Cookie:a.cookie}});assert.equal(excel.status,200);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await excel.arrayBuffer()));assert.deepEqual(book.worksheets.map(s=>s.name),['Summary','Findings','Analysis','Coverage','Remediation']);assert.equal(book.getWorksheet('Findings').rowCount,job.findingCount+1);
 await writeFile('docs/verification/localhost-security-scan.xlsx',Buffer.from(await book.xlsx.writeBuffer()));
 await writeFile('docs/verification/localhost-security-scan.csv',content);
 const chat=await api(a,'/api/service-review-center/chat',{question:'Show my security report',requestId:randomUUID()});assert.match(chat.answer,/Download CSV/);assert.match(chat.model,/no paid AI/);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM usage_events WHERE user_id=$1 AND source='review-chat'",[a.id])).rows[0].n,0);
 assert.equal((await api(a,'/api/service-review-center/scans',{requestId})).job.id,job.id);
 console.log(`PASS: real ZAP + Trivy localhost execution, ${job.findingCount} observations, progress, durable reports, owner isolation, idempotency, redaction, CSV/XLSX and free assistant.`);
}finally{for(const a of accounts)await pool.query('DELETE FROM "user" WHERE id=$1',[a.id]);await pool.end();}
