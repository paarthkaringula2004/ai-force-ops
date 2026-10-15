import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
import * as marked from 'marked';

const require=createRequire(import.meta.url),cache=new Map(),overrides=new Map();
function load(path){
 const full=resolve(path);if(overrides.has(full))return overrides.get(full);if(cache.has(full))return cache.get(full).exports;
 const module={exports:{}};cache.set(full,module);
 const code=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name==='server-only')return {};if(name==='marked')return marked;
  if(name.startsWith('.')||name.startsWith('@/')){let local=name.startsWith('@/')?resolve(name.slice(2)):resolve(dirname(full),name);if(!existsSync(local))local+='.ts';return load(local);}
  return require(name);
 },module,module.exports);return module.exports;
}
const docs=load('lib/organization-documents.ts'),custom=load('lib/offer-customization.ts');
const contact={name:'Fixture Admin',email:'admin@example.invalid',phone:'+91 9000000000'};
function valuesFor(type){
 const values={};for(const key of docs.documentDefinition(type).fields){const field=docs.documentField(key);values[key]=field.optional?'':field.options?.[0]??(field.input==='date'?'2026-11-01':'Approved '+field.label);}
 return {...values,name:'Fixture Recipient',email:'recipient@example.invalid',role:'Software Developer',department:'Engineering',employeeId:'TEST-EMPLOYEE',joiningDate:'2024-06-03',lastWorkingDate:'2026-10-08',reviewStart:'2026-11-01',reviewEnd:'2026-12-01',compensation:'INR 8 lakh per annum',currentCompensation:'INR 6 lakh per annum',grossPay:'INR 50,000',settlementAmount:'INR 45,000'};
}
assert.equal(docs.organizationDocuments.length,18);
assert.equal(new Set(docs.organizationDocuments.map(doc=>doc.id)).size,18);
for(const doc of docs.organizationDocuments){
 const template=docs.validateDocumentTemplate(doc.id,doc.markdown,doc.subject),values=valuesFor(doc.id);
 assert.equal(docs.detectDocumentCommand('Prepare a '+doc.label),doc.id);
 assert.equal(docs.detectDocumentCommand('Show current service health'),null);
 docs.validateDocumentDetails(doc.id,values,template);
 const filled=docs.fillDocumentTemplate(doc.id,template,values,contact,doc.prefix+'-TEST',new Date('2026-10-09T09:00:00Z'));
 assert.ok(!filled.markdown.includes('{{'),doc.label);assert.ok(!filled.subject.includes('{{'));
 assert.match(filled.markdown,/Fixture Recipient/);assert.match(filled.markdown,/Fixture Admin/);assert.match(filled.markdown,/Contact us/);
 const message=custom.customizedOfferMail(filled.markdown,filled.subject,contact);
 assert.equal(message.replyTo,contact.email);assert.match(message.html,/border-top:5px solid/);assert.match(message.html,/<table/);
 assert.throws(()=>docs.validateDocumentTemplate(doc.id,doc.markdown+' {{__proto__}}',doc.subject),/Unknown field/);
 assert.throws(()=>docs.validateDocumentDetails(doc.id,{...values,email:'invalid'},template),/valid recipient/);
 assert.throws(()=>docs.validateDocumentDetails(doc.id,{...values,name:''},template),/name/i);
}
assert.match(docs.fillDocumentTemplate('offer',docs.documentDefinition('offer'),valuesFor('offer'),contact,'OFR-TEST').markdown,/3 June 2024/);
assert.ok(docs.documentFieldError('relieving','lastWorkingDate','2026-02-30'));
assert.throws(()=>docs.validateDocumentDetails('performance_plan',{...valuesFor('performance_plan'),reviewEnd:'2026-01-01'},docs.documentDefinition('performance_plan')),/review end date/);
assert.throws(()=>docs.validateDocumentDetails('experience',{...valuesFor('experience'),lastWorkingDate:'2020-01-01'},docs.documentDefinition('experience')),/last working date/);
assert.throws(()=>docs.validateDocumentTemplate('salary_revision',docs.documentDefinition('salary_revision').markdown+' {{joiningDate}}','Salary'),/Unknown field/);
const escaped=docs.fillDocumentTemplate('employment_verification',docs.documentDefinition('employment_verification'),{...valuesFor('employment_verification'),name:'**Name** | <script>alert(1)</script>'},contact,'VER-TEST');
assert.match(escaped.markdown,/\\\*/);assert.ok(!custom.customizedOfferMail(escaped.markdown,escaped.subject,contact).html.includes('<script>'));
const reduced={...docs.documentDefinition('salary_revision'),markdown:docs.documentDefinition('salary_revision').markdown.replace('{{compensation}}','As separately approved')};
assert.ok(!docs.requiredDocumentFields('salary_revision',reduced).includes('compensation'));
for(const theme of ['white','black','purple']){
 const original=custom.customizedOfferMail('# AIForce.Ops\n\n## Contact us\n\nPhone: 123\n\n[Link](https://example.com/#fff)','Theme',contact,[{filename:'guide.txt',size:12,contentType:'text/plain',content:Buffer.from('fixture file').toString('base64')}]);
 const themed=custom.themedMailPreview(original.html,theme);
 assert.ok(themed.includes('https://example.com/#fff'));assert.match(themed,/guide.txt/);
 if(theme==='black')assert.match(themed,/background:#1c1c24/);if(theme==='purple')assert.match(themed,/background:#fbf9ff/);
 assert.equal(original.attachments[0].content,Buffer.from('fixture file').toString('base64'));
 assert.ok(original.html.indexOf('guide.txt')>original.html.indexOf('Phone: 123'));
}
console.log('PASS: three preview themes preserve wording/URLs; real attachment payload and filenames follow contact details.');
console.log('PASS: all 18 document schemas, command recognition, distinct fields, safe rendering, required values and date validation.');

process.env.MAIL_ENCRYPTION_KEY||='ab'.repeat(32);process.env.SMTP_USER||='fixture@example.invalid';process.env.SMTP_PASS||='fixture';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),connection=await pool.connect();
const client={query:(sql,args)=>/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)?Promise.resolve({rows:[]}):connection.query(sql.replaceAll("now()+interval '10 minutes'","clock_timestamp()+interval '10 minutes'"),args),release(){}};
const db={query:(sql,args)=>connection.query(sql,args),connect:async()=>client};
let actorId=randomUUID(),role='admin';
overrides.set(resolve('lib/db.ts'),{db});
overrides.set(resolve('lib/request-session.ts'),{getRequestSession:async()=>({user:{id:actorId,name:'Fixture Admin',email:actorId+'@example.invalid'}})});
overrides.set(resolve('lib/workspace-access.ts'),{workspaceAccess:async()=>({user_id:actorId,role,active:true,permissions:[]})});
overrides.set(resolve('lib/service-review/ingestion.ts'),{requireSameOrigin:request=>{if(request.headers.get('origin')!=='http://localhost:3000')throw new Error('Origin');}});
const chatOnly=process.argv.includes('--chat-only');
const api=load('app/api/workspace/admin/mail/customization/route.ts'),mailApi=load('app/api/workspace/admin/mail/route.ts');
const uploads=load('app/api/workspace/admin/mail/attachments/route.ts');
const attachmentStore=load('lib/organization-mail-attachments.ts');
const mail=load('lib/mail.ts'),store=load('lib/organization-document-store.ts'),chat=load('lib/workspace-document-chat.ts'),send=load('lib/workspace-mail-chat.ts');
const request=(method,body,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/workspace/admin/mail/customization',{method,headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function createAdmin(id){
 await connection.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Fixture Admin',id+'@example.invalid']);
 await connection.query("UPDATE workspace_members SET role='admin',active=true WHERE user_id=$1",[id]);
 await connection.query("INSERT INTO account_profiles(user_id,phone) VALUES($1,'+91 9000000000') ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone",[id]);
}
try{
 await connection.query('BEGIN');await createAdmin(actorId);await connection.query('DELETE FROM organization_mail_templates');
 for(const doc of docs.organizationDocuments){
  const template={markdown:doc.markdown+'\n\n**Template marker:** '+doc.id,subject:doc.subject};
  if(chatOnly){const id=randomUUID();await connection.query('INSERT INTO organization_mail_attachments(id,document_type,filename,content_type,size_bytes,encrypted_content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,doc.id,doc.id+'.txt','text/plain',('Fixture attachment '+doc.id).length,mail.encryptMail({subject:'file',text:Buffer.from('Fixture attachment '+doc.id).toString('base64'),html:''}),actorId]);await connection.query('INSERT INTO organization_mail_templates(kind,encrypted_content,updated_by,attachment_ids) VALUES($1,$2,$3,$4)',[doc.id,mail.encryptMail({subject:template.subject,text:template.markdown,html:''}),actorId,[id]]);continue;}
  const form=new FormData();form.set('documentType',doc.id);form.set('file',new File(['Fixture attachment '+doc.id],doc.id+'.txt',{type:'text/plain'}));
  const uploaded=await uploads.POST(new Request('http://localhost:3000/api/workspace/admin/mail/attachments',{method:'POST',headers:{origin:'http://localhost:3000'},body:form}));assert.equal(uploaded.status,200,await uploaded.clone().text());
  const attachment=(await uploaded.json()).attachment;const attachmentIds=[attachment.id];
  const saved=await api.PUT(request('PUT',{documentType:doc.id,...template,revision:0,attachmentIds}));assert.equal(saved.status,200,await saved.clone().text());
  const stale=await api.PUT(request('PUT',{documentType:doc.id,...template,revision:0}));assert.equal(stale.status,409);
  const preview=await api.POST(request('POST',{documentType:doc.id,template,details:valuesFor(doc.id),attachmentIds,reference:doc.prefix+'-TEST'}));
  assert.equal(preview.status,200,await preview.clone().text());const data=await preview.json();
  assert.equal(data.preview.attachments[0].filename,doc.id+'.txt');assert.equal(Buffer.from(data.preview.attachments[0].content,'base64').toString(),'Fixture attachment '+doc.id);
  assert.ok(data.preview.html.indexOf(doc.id+'.txt')>data.preview.html.indexOf('Phone:'));
  assert.equal(data.documentType,doc.id);assert.match(data.preview.html,/Fixture Recipient/);assert.match(data.preview.html,new RegExp('Template marker:'));assert.equal(data.preview.replyTo,actorId+'@example.invalid');
  const row=(await connection.query('SELECT kind,document_type,status,encrypted_content FROM mail_outbox WHERE id=$1',[data.id])).rows[0];
  assert.equal(row.document_type,doc.id);assert.equal(row.kind,doc.id==='offer'?'offer':'document');assert.equal(row.status,'draft');assert.ok(!row.encrypted_content.includes('Fixture Recipient'));
  const queued=await mailApi.POST(request('POST',{action:'confirm-document',id:data.id,confirm:true}));assert.equal(queued.status,200);
  assert.equal((await mailApi.POST(request('POST',{action:'confirm-document',id:data.id,confirm:true}))).status,400);
 }
 console.log(chatOnly?'Prepared saved template fixtures for all 18 document types.':'PASS: uploads, saves, exact previews and confirmations for all 18 document types.');
 const templates=await store.readDocumentTemplates(client);assert.equal(Object.keys(templates).length,18);
 for(const doc of docs.organizationDocuments){assert.ok(templates[doc.id].markdown.includes('Template marker:** '+doc.id));assert.equal(templates[doc.id].revision,1);assert.equal(templates[doc.id].attachments[0].filename,doc.id+'.txt');assert.equal(templates[doc.id].attachments[0].content,undefined);}
 assert.equal((await api.PUT(request('PUT',{documentType:'unknown',markdown:'x',subject:'x',revision:0}))).status,400);
 assert.equal((await api.PUT(request('PUT',{documentType:'offer',markdown:'x',subject:'x',revision:0},'http://other.invalid'))).status,403);
 role='manager';assert.equal((await api.GET(new Request('http://localhost:3000/api/workspace/admin/mail/customization'))).status,403);role='admin';
 actorId=randomUUID();await createAdmin(actorId);
 const shared=await api.GET(new Request('http://localhost:3000/api/workspace/admin/mail/customization'));assert.equal(Object.keys((await shared.json()).templates).length,18);
 const sharedDownload=await uploads.GET(new Request('http://localhost:3000/api/workspace/admin/mail/attachments?id='+templates.offer.attachments[0].id));assert.equal(sharedDownload.status,200);assert.equal(await sharedDownload.text(),'Fixture attachment offer');
 await assert.rejects(()=>attachmentStore.loadDocumentAttachments(client,'experience',[templates.offer.attachments[0].id],actorId),/unavailable/);
 assert.equal(attachmentStore.attachmentIds(Array.from({length:12},()=>randomUUID())).length,12);assert.throws(()=>attachmentStore.attachmentIds(['invalid']),/valid document attachments/);
 const member={user_id:actorId,role:'admin',active:true,permissions:[]};
 assert.match((await chat.workspaceDocumentChatReply(actorId,'Prepare a Salary Revision Letter',{...member,role:'manager'})).reply,/Only an active Admin/);
 for(const doc of docs.organizationDocuments.filter(doc=>doc.id!=='offer')){
  const template=templates[doc.id],fields={...valuesFor(doc.id),email:'recipient@example.com'},keys=[...docs.requiredDocumentFields(doc.id,template),...doc.fields.filter(key=>docs.documentField(key).optional&&template.markdown.includes('{{'+key+'}}'))];
  const initial=['salary_revision','performance_plan','onboarding'].includes(doc.id)?{name:fields.name,email:fields.email}:fields;
  let response=await chat.workspaceDocumentChatReply(actorId,'Prepare a '+doc.label,member,initial);
  if(['salary_revision','performance_plan','onboarding'].includes(doc.id)){
   for(const key of keys.filter(key=>!(key in initial))){response=await chat.workspaceDocumentChatReply(actorId,docs.documentField(key).optional?'No additional information':fields[key],member);}
  }
  assert.match(response.reply,/Review /,doc.label);assert.match(response.reply,new RegExp(doc.id));assert.ok(response.choices[0].startsWith('Confirm send email '));
  assert.equal(await chat.workspaceDocumentChatReply(actorId,response.choices[0],member),null);
  const sent=await send.workspaceMailChatReply(actorId,response.choices[0],member);assert.match(sent.reply,/Email queued/);
  const outbox=(await connection.query('SELECT kind,document_type,encrypted_content FROM mail_outbox WHERE actor_id=$1 ORDER BY created_at DESC,id DESC',[actorId])).rows.find(row=>row.document_type===doc.id);
  console.log('PASS: '+doc.label+' saved draft and confirmed queue with attachment.');
  assert.equal(outbox.kind,'document');assert.match(mail.decryptMail(outbox.encrypted_content).text,new RegExp(doc.id));assert.equal(mail.decryptMail(outbox.encrypted_content).attachments[0].filename,doc.id+'.txt');
 }
 console.log('PASS: shared Admin templates, encrypted drafts, Admin permissions and all 17 new chatbot/send flows. Fixtures rolled back; no external emails sent.');
}finally{await connection.query('ROLLBACK');connection.release();await pool.end();}
