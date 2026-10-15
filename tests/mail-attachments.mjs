import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import nodemailer from 'nodemailer';
const require=createRequire(import.meta.url);
process.env.MAIL_ENCRYPTION_KEY||='ab'.repeat(32);process.env.SMTP_USER||='fixture@example.invalid';process.env.SMTP_PASS||='fixture';
let encrypted,raw,sent=false;
const memory=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
const mockTransport={createTransport:()=>({sendMail:async content=>{
 assert.equal(content.attachments[0].filename,'onboarding-guide.txt');assert.equal(content.attachments[0].encoding,'base64');assert.equal(content.disableFileAccess,true);assert.equal(content.disableUrlAccess,true);
 const result=await memory.sendMail(content);raw=result.message.toString();return {...result,accepted:['recipient@example.com']};
},close(){}})};
const db={query:async(sql,args)=>{
 if(sql.startsWith('WITH selected'))return {rows:[{id:'fixture',recipient:'recipient@example.com',encrypted_content:encrypted,attempts:1}],rowCount:1};
 if(sql.includes("SET status='sent'"))sent=true;
 return {rows:[],rowCount:0};
}};
const module={exports:{}};
const code=ts.transpileModule(readFileSync('lib/mail.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
new Function('require','module','exports',code)(name=>name==='server-only'?{}:name==='./db'?{db}:name==='nodemailer'?mockTransport:require(name),module,module.exports);
const payload={subject:'Document attachment fixture',html:'<p>Fixture</p>',text:'Fixture',attachments:[{filename:'onboarding-guide.txt',contentType:'text/plain',size:18,content:Buffer.from('Fixture guide file').toString('base64')}]};
encrypted=module.exports.encryptMail(payload);
assert.ok(!encrypted.includes('Fixture guide file'));assert.deepEqual(module.exports.decryptMail(encrypted),payload);
const result=await module.exports.deliverMailBatch();assert.equal(result.processed,1);assert.equal(sent,true);
assert.match(raw,/Content-Disposition: attachment; filename=onboarding-guide.txt/);assert.match(raw,/Content-Type: multipart\/mixed/);assert.match(raw,/Rml4dHVyZSBndWlkZSBmaWxl/);
console.log('PASS: actual mail worker generates MIME attachment bytes, sends the reviewed payload, and marks delivery. In-memory transport only; no network or database side effects.');
