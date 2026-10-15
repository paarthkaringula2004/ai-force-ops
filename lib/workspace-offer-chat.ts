import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {db} from './db';
import {permitted,type WorkspaceAccess} from './workspace-permissions';
import {encryptMail,decryptMail,mailConfigured,validMailAddress} from './mail';
import {missingOfferField,offerFieldError,offerFields,offerLabels,offerQuestions,type GuidedOffer,type OfferContact,type OfferField} from './guided-offer';
import {loadDocumentAttachments} from './organization-mail-attachments';
import {readOfferTemplate} from './offer-template-store';
import {fillOfferTemplate,offerPositionOptions,defaultOfferTemplate,defaultOfferSubject} from './offer-template';
import {customizedOfferMail} from './offer-customization';

type Draft={type:'mail';guided:true;token:string;form:string;choices?:string[];to?:string;subject?:string;encrypted?:string};
const result=(reply:string,choices:string[]=[])=>({reply,choices,responseMode:'workspace',recordedAt:new Date().toISOString()});
const packed=(fields:GuidedOffer)=>encryptMail({subject:'Offer draft',text:JSON.stringify(fields),html:''});
const unpacked=(draft:Draft)=>JSON.parse(decryptMail(draft.form).text) as GuidedOffer;
const previewButtons=(draft:Draft)=>['Confirm send email '+draft.token,'Edit offer details','Cancel email'];
async function prompt(fields:GuidedOffer,client:PoolClient){
 const field=missingOfferField(fields)!;let choices:string[]=[];
 if(field==='employmentType')choices=['Full-time','Part-time','Fixed-term','Contract','Internship'];
 if(field==='location')choices=['Remote','Hybrid','On-site'];
 if(field==='note')choices=['No additional note'];
 if(field==='department')choices=(await client.query('SELECT name FROM staff_departments ORDER BY code LIMIT 12')).rows.map(r=>r.name);
 if(field==='role')choices=offerPositionOptions((await client.query('SELECT DISTINCT name FROM staff_job_titles ORDER BY name LIMIT 12')).rows).slice(0,12);
 if(field==='reportingManager')choices=(await client.query(`SELECT u.name,u.email FROM workspace_members m JOIN "user" u ON u.id=m.user_id WHERE m.active AND m.role IN ('admin','manager') ORDER BY u.name LIMIT 12`)).rows.map(r=>`${r.name} (${r.email})`);
 return result(`**Offer letter · ${offerFields.indexOf(field)+1} of ${offerFields.length}**\n\n${offerQuestions[field]}${field==='department'||field==='role'||field==='reportingManager'?' You can also type the full value.':''}`, [...choices,'Cancel email']);
}
async function contact(user:string,client:PoolClient):Promise<OfferContact>{return (await client.query('SELECT u.name,u.email,coalesce(p.phone,\'\') AS phone FROM "user" u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=$1',[user])).rows[0];}
export async function workspaceOfferChatReply(user:string,input:string,member:WorkspaceAccess,initialFields?:GuidedOffer){
 const text=input.trim();
 const command=/\boffer\s*(?:letter|email|mail)\b/i.test(text)&&/\b(want|give|send|compose|create|draft|prepare|issue)\b/i.test(text);
 const edit=/^Edit offer details$/i.test(text),editField=text.match(/^Edit offer (.+)$/i);
 if(!permitted(member,'admin'))return command||edit?result('Only an active Admin can prepare and send company offer letters.'):null;
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`workspace-chat:${user}`]);
  const row=(await client.query('SELECT draft,expires_at FROM workspace_chat_actions WHERE user_id=$1 FOR UPDATE',[user])).rows[0];
  let draft=row?.draft?.guided&&(!row.draft.documentType||row.draft.documentType==='offer')&&new Date(row.expires_at)>new Date()?row.draft as Draft:undefined;
  if(!draft&&!command&&!edit){await client.query('COMMIT');return null;}
  // The mail handler owns sending, cancellation and delivery status.
  if(/^(Confirm send email |Cancel email$|Email status )/i.test(text)){await client.query('COMMIT');return null;}
  if(draft&&/^(new chat|about me|about aiforce\.ops|assign role|team requests|create department)$/i.test(text)){await client.query("DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'guided'='true'",[user]);await client.query('COMMIT');return null;}
  if(!mailConfigured()){await client.query('COMMIT');return result('The mail service is not configured. Nothing was sent.');}
  let fields:GuidedOffer=draft?unpacked(draft):{};
  let reply:ReturnType<typeof result>|undefined;
  if(!draft&&command){
   const name=text.match(/\bname\s*:\s*([^\n]+?)(?=\s+(?:role|email|department)\s*:|$)/im)?.[1].trim();
   const role=text.match(/\brole\s*:\s*([^\n]+?)(?=\s+(?:name|email|department)\s*:|$)/im)?.[1].trim();
   const email=text.match(/[^\s<>]+@[^\s<>,]+\.[^\s<>,]+/)?.[0];
   fields={...(name?{name}:{}),...(role?{role}:{}),...(email&&validMailAddress(email)?{email}:{}),...initialFields};
   for(const field of offerFields){const value=fields[field];if(value!==undefined&&offerFieldError(field,value))delete fields[field];}
   draft={type:'mail',guided:true,token:randomUUID(),form:packed(fields)};
  }else if(draft&&edit){reply=result('Which detail would you like to change? Your other answers will be kept.',offerFields.map(f=>'Edit offer '+offerLabels[f]).concat('Cancel email'));}
  else if(draft&&editField){
   const field=offerFields.find(f=>offerLabels[f].toLowerCase()===editField[1].toLowerCase()) as OfferField|undefined;
   if(field){delete fields[field];draft.encrypted=undefined;draft.token=randomUUID();}
   else reply=result('Choose a detail from Edit offer details.',['Edit offer details','Cancel email']);
  }else if(draft&&!draft.encrypted){
   const field=missingOfferField(fields);
   if(field){const value=field==='note'&&text==='No additional note'?'':text;const error=offerFieldError(field,value);
    if(error)reply=result(error,(await prompt(fields,client)).choices);
    else fields[field]=value;
   }
  }
  if(!draft){await client.query('COMMIT');return result('Start with “I want to give an offer letter”.');}
  if(!reply&&missingOfferField(fields))reply=await prompt(fields,client);
  if(!reply){
   const sender=await contact(user,client);
   if(!sender.phone.trim())reply=result('Your name and email will be filled from your Admin profile. Add your phone number in [Profile settings](/dashboard/settings), save it, then choose Continue offer preview.',['Continue offer preview','Edit offer details','Cancel email']);
   else{
    const template=draft.encrypted?null:await readOfferTemplate(client);
    const filled=fillOfferTemplate(template??{markdown:defaultOfferTemplate,subject:defaultOfferSubject},fields,sender,'OFR-'+draft.token.slice(0,8).toUpperCase());
    const content=draft.encrypted?decryptMail(draft.encrypted):customizedOfferMail(filled.markdown,filled.subject,sender,await loadDocumentAttachments(client,'offer',template?.attachmentIds??[]));
    draft.encrypted=encryptMail(content);draft.to=fields.email;draft.subject=content.subject;
    reply=result(`**Review your offer letter**\n\n**To:** ${fields.email}\n\n**Subject:** ${content.subject}\n\n${content.text.replaceAll('\n','  \n')}\n\nNothing has been sent yet. Review and confirm within 10 minutes.`,previewButtons(draft));
   }
  }
  draft.form=packed(fields);draft.choices=reply.choices;
  await client.query("INSERT INTO workspace_chat_actions(user_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET draft=excluded.draft,expires_at=now()+interval '10 minutes'",[user,JSON.stringify(draft)]);
  await client.query('COMMIT');return reply;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
