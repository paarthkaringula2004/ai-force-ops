import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {db} from './db';
import {permitted,type WorkspaceAccess} from './workspace-permissions';
import {encryptMail,decryptMail,mailConfigured} from './mail';
import {customizedOfferMail} from './offer-customization';
import {loadDocumentAttachments} from './organization-mail-attachments';
import {readDocumentTemplate} from './organization-document-store';
import {detectDocumentCommand,isDocumentType,documentDefinition,documentField,documentFieldLabel,requiredDocumentFields,documentFieldError,validateDocumentDetails,fillDocumentTemplate,type DocumentType,type DocumentValues,type DocumentTemplate} from './organization-documents';
import type {OfferContact} from './guided-offer';

type Draft={type:'mail';guided:true;documentType:DocumentType;token:string;form:string;templateContent:string;attachmentIds?:string[];choices?:string[];to?:string;subject?:string;encrypted?:string};
const result=(reply:string,choices:string[]=[])=>({reply,choices,responseMode:'workspace',recordedAt:new Date().toISOString()});
const pack=(fields:DocumentValues)=>encryptMail({subject:'Document details',text:JSON.stringify(fields),html:''});
const unpack=(draft:Draft)=>JSON.parse(decryptMail(draft.form).text) as DocumentValues;
function templateOf(draft:Draft):DocumentTemplate{const content=decryptMail(draft.templateContent);return {markdown:content.text,subject:content.subject};}
function steps(draft:Draft){const template=templateOf(draft),required=requiredDocumentFields(draft.documentType,template);return [...required,...documentDefinition(draft.documentType).fields.filter(key=>documentField(key).optional&&template.markdown.includes('{{'+key+'}}'))];}
function missing(draft:Draft,fields:DocumentValues){return steps(draft).find(key=>fields[key]===undefined||!documentField(key).optional&&!fields[key]?.trim());}
const previewButtons=(draft:Draft)=>['Confirm send email '+draft.token,'Edit document details','Cancel email'];

async function prompt(draft:Draft,fields:DocumentValues,client:PoolClient){
 const key=missing(draft,fields)!,field=documentField(key),label=documentFieldLabel(draft.documentType,key);let choices=field.options??[];
 if(field.input==='department')choices=(await client.query('SELECT name FROM staff_departments ORDER BY code LIMIT 20')).rows.map(row=>row.name);
 if(field.input==='position')choices=(await client.query('SELECT DISTINCT name FROM staff_job_titles ORDER BY name LIMIT 20')).rows.map(row=>row.name);
 if(field.input==='manager')choices=(await client.query(`SELECT u.name,u.email FROM workspace_members m JOIN "user" u ON u.id=m.user_id WHERE m.active AND m.role IN ('admin','manager') ORDER BY u.name LIMIT 20`)).rows.map(row=>row.name+' ('+row.email+')');
 if(key==='location')choices=['Remote','Hybrid','On-site'];
 if(field.optional)choices=['No additional information'];
 const hint=field.input==='date'?' Enter YYYY-MM-DD.':field.input==='multiline'?' Provide the approved details; line breaks are preserved.':field.options?' Choose an option below.':'';
 return result(`**${documentDefinition(draft.documentType).label} · ${steps(draft).indexOf(key)+1} of ${steps(draft).length}**\n\nPlease provide **${label.toLowerCase()}**.${hint}`,[...choices,'Cancel email']);
}

export async function workspaceDocumentChatReply(user:string,input:string,member:WorkspaceAccess,initialFields?:DocumentValues){
 const text=input.trim(),command=detectDocumentCommand(text);
 if(command==='offer')return null;
 if(!permitted(member,'admin'))return command?result('Only an active Admin can prepare and send organization documents.'):null;
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`workspace-chat:${user}`]);
  const row=(await client.query('SELECT draft,expires_at FROM workspace_chat_actions WHERE user_id=$1 FOR UPDATE',[user])).rows[0];
  let draft=row?.draft?.guided&&isDocumentType(row.draft.documentType)&&row.draft.documentType!=='offer'&&new Date(row.expires_at)>new Date()?row.draft as Draft:undefined;
  if(!draft&&!command){await client.query('COMMIT');return null;}
  if(/^(Confirm send email |Cancel email$|Email status )/i.test(text)){await client.query('COMMIT');return null;}
  if(draft&&/^(new chat|about me|about aiforce\.ops|assign role|team requests|create department)$/i.test(text)){
   await client.query("DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'guided'='true'",[user]);await client.query('COMMIT');return null;
  }
  if(!(await client.query("SELECT 1 FROM workspace_members WHERE user_id=$1 AND role='admin' AND active FOR UPDATE",[user])).rowCount){await client.query('COMMIT');return result('Active Admin access is required.');}
  if(!mailConfigured()){await client.query('COMMIT');return result('Configure the organization mail service before starting a document email. Nothing was sent.');}
  let fields:DocumentValues=draft?unpack(draft):{},reply:ReturnType<typeof result>|undefined;
  if(command){
   const definition=documentDefinition(command),saved=await readDocumentTemplate(client,command),template=saved??definition;
   fields={};
   const name=text.match(/\bname\s*:\s*([^\n]+?)(?=\s+(?:role|email|department)\s*:|$)/im)?.[1].trim(),email=text.match(/[^\s<>]+@[^\s<>,]+\.[^\s<>,]+/)?.[0];
   if(name&&!documentFieldError(command,'name',name))fields.name=name;
   if(email&&!documentFieldError(command,'email',email))fields.email=email;
   for(const key of definition.fields){const value=initialFields?.[key];if(value!==undefined&&!documentFieldError(command,key,value))fields[key]=value;}
   if(command==='employment_change'&&/\bpromotion\b/i.test(text))fields.changeType='Promotion';
   draft={type:'mail',guided:true,documentType:command,token:randomUUID(),form:pack(fields),attachmentIds:saved?.attachments.map(file=>file.id)??[],templateContent:encryptMail({subject:template.subject,text:template.markdown,html:''})};
  }else if(draft&&/^Edit document details$/i.test(text))reply=result('Choose the detail to update. Your other answers will be kept.',steps(draft).map(key=>'Edit document '+documentFieldLabel(draft!.documentType,key)).concat('Cancel email'));
  else if(draft&&/^Edit document /i.test(text)){
   const label=text.replace(/^Edit document /i,''),key=steps(draft).find(field=>documentFieldLabel(draft!.documentType,field).toLowerCase()===label.toLowerCase());
   if(key){delete fields[key];draft.encrypted=undefined;draft.token=randomUUID();}
   else reply=result('Choose a detail from Edit document details.',['Edit document details','Cancel email']);
  }else if(draft&&!draft.encrypted){
   const key=missing(draft,fields);
   if(key){const value=documentField(key).optional&&text==='No additional information'?'':input,issue=documentFieldError(draft.documentType,key,value);
    if(issue)reply=result(issue,(await prompt(draft,fields,client)).choices);else fields[key]=value;
   }
  }
  if(!draft){await client.query('COMMIT');return null;}
  if(!reply&&missing(draft,fields))reply=await prompt(draft,fields,client);
  if(!reply){
   const contact=(await client.query('SELECT u.name,u.email,coalesce(p.phone,\'\') AS phone FROM "user" u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=$1',[user])).rows[0] as OfferContact;
   if(!contact.phone.trim())reply=result('Add your contact phone number in [Profile settings](/dashboard/settings). Your name and email are filled from your Admin profile.',['Continue document preview','Edit document details','Cancel email']);
   else{
    const template=templateOf(draft);validateDocumentDetails(draft.documentType,fields,template);
    const definition=documentDefinition(draft.documentType),filled=fillDocumentTemplate(draft.documentType,template,fields,contact,definition.prefix+'-'+draft.token.slice(0,8).toUpperCase());
    const content=draft.encrypted?decryptMail(draft.encrypted):customizedOfferMail(filled.markdown,filled.subject,contact,await loadDocumentAttachments(client,draft.documentType,draft.attachmentIds??[]));
    draft.encrypted=encryptMail(content);draft.to=fields.email;draft.subject=content.subject;
    reply=result(`**Review ${definition.label.toLowerCase()}**\n\n**To:** ${fields.email}\n\n**Subject:** ${content.subject}\n\n${content.text}\n\nReview the document and recipient, then confirm within 10 minutes.`,previewButtons(draft));
   }
  }
  draft.form=pack(fields);draft.choices=reply.choices;
  await client.query("INSERT INTO workspace_chat_actions(user_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET draft=excluded.draft,expires_at=now()+interval '10 minutes'",[user,JSON.stringify(draft)]);
  await client.query('COMMIT');return reply;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
