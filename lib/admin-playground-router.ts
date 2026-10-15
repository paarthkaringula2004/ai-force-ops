import OpenAI from 'openai';
import {db} from './db';
import type {WorkspaceAccess} from './workspace-permissions';
import {adminCapabilities,adminPlaygroundGuide} from './admin-playground-guide';
import {adminIntentToolsForState,adminIntentFromTool,availableAdminModes,adminIntentInstructions,groundedAdminFields,type AdminIntent,type AdminConversationState,type AdminChatMessage} from './admin-playground-intent';
import {decryptMail} from './mail';
import {missingOfferField,offerLabels,type GuidedOffer,type OfferField} from './guided-offer';
import {organizationDocuments,documentDefinition,documentFields,documentField,documentFieldLabel,isDocumentType,requiredDocumentFields,type DocumentFieldKey} from './organization-documents';
import {supportsPlaygroundModel,playgroundModelCatalog} from './playground-models';
import {recordModelUsage} from './model-usage';
import {recordLocalChat} from './local-chat-usage';
import {tokenDetails} from './model-pricing';
import {startPlatformRun,finishPlatformRun} from './eassist/platform';
import {workspaceOfferChatReply} from './workspace-offer-chat';
import {workspaceDocumentChatReply} from './workspace-document-chat';
import {workspaceMailChatReply} from './workspace-mail-chat';
import {workspaceChatReply} from './workspace-chat';
import {workspaceCatalogChatReply} from './workspace-catalog-chat';
import {suppliedDepartmentName} from './department-name';
import {workspaceRequestChatReply} from './workspace-request-chat';
import {employeeReply} from './employee-playground';
import {adminRouterModel} from './admin-router-config';
import {isStandaloneGreeting} from './chat-efficiency';

const answer=(reply:string,choices:string[]=[])=>({reply,choices,responseMode:'workspace',recordedAt:new Date().toISOString()});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function readAdminConversationState(user:string):Promise<AdminConversationState|null>{
 const row=(await db.query('SELECT draft FROM workspace_chat_actions WHERE user_id=$1 AND expires_at>now()',[user])).rows[0];
 if(!row)return null;
 const d=row.draft;
 if(!d||typeof d.token!=='string'||!uuid.test(d.token))return null;
 const choices=Array.isArray(d.choices)?d.choices.filter((s:unknown):s is string=>typeof s==='string'):[];
 if(d.type==='mail'){
  if(d.guided){
   const values=JSON.parse(decryptMail(d.form).text) as Record<string,string>;
   if(d.documentType&&d.documentType!=='offer'&&isDocumentType(d.documentType)){
    const template=decryptMail(d.templateContent),required=requiredDocumentFields(d.documentType,{subject:template.subject,markdown:template.text});
    const fields=[...required,...documentDefinition(d.documentType).fields.filter(key=>documentField(key).optional&&template.text.includes('{{'+key+'}}'))];
    return {kind:'document',documentType:d.documentType,token:d.token,ready:!!d.encrypted,field:fields.find(key=>values[key]===undefined||!documentField(key).optional&&!values[key]?.trim()),choices,values};
   }
   return {kind:'offer',documentType:'offer',token:d.token,ready:!!d.encrypted,field:missingOfferField(values),choices,values};
  }
  const ready=!!d.encrypted&&!!d.to&&!!d.subject;
  return {kind:'email',token:d.token,ready,field:!d.to?'email':!d.subject?'subject':!d.encrypted?'body':undefined,choices:ready?['Confirm send email '+d.token,'Edit email message','Cancel email']:['Cancel email'],values:{...(d.to?{email:d.to}:{}),...(d.subject?{subject:d.subject}:{})}};
 }
 if(d.type==='department')return {kind:'department',token:d.token,ready:!!d.name,field:d.name?undefined:'department',choices:d.name?['Confirm department creation '+d.token,'Cancel department creation']:['Cancel department creation'],values:d.name?{department:d.name}:{}};
 if(d.type==='decision')return {kind:'request',token:d.token,ready:!!d.decision,choices:['Confirm request decision '+d.token,'Cancel decision'],values:{requestNumber:d.number}};
 if(d.email!==undefined||d.role!==undefined||d.update!==undefined||!d.type)return {kind:'role',token:d.token,ready:!!d.update,field:!d.email?'email':!d.role?'loginRole':d.department===undefined?'department':d.awaitingQualification?'qualifications':undefined,choices:d.update?['Confirm role change '+d.token,'Cancel role change']:['User','Employee','Manager','Admin','Keep current department','Cancel role change'],values:{...(d.email?{email:d.email}:{}),...(d.role?{loginRole:d.role}:{}),...(d.department?{department:d.department}:{})}};
 return null;
}

export async function interpretAdminRequest(client:OpenAI,model:string,messages:AdminChatMessage[],state:AdminConversationState|null,maxTokens?:number){
 const response=await client.responses.create({model,store:false,instructions:adminIntentInstructions(state),input:messages,
  tools:adminIntentToolsForState(state),tool_choice:'required',parallel_tool_calls:false,
  ...(/^gpt-4(?:\.1|o)(?:-|$)/.test(model)?{temperature:0}:{}),
  ...(/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)?{reasoning:{effort:'low' as const}}:{}),
  // Reasoning and structured arguments share this budget. A tiny answer setting must not cut a workflow selection in half.
  max_output_tokens:Math.max(8000,maxTokens??0),
 });
 // Do not execute partial, refused, parallel, or unknown tool calls.
 const calls=response.output.filter(item=>item.type==='function_call');
 let intent:AdminIntent|null=null;
 if(response.status==='completed'&&calls.length===1){
  try{
   const parsed=adminIntentFromTool(calls[0].name,calls[0].arguments,state);
   // Supplying the field currently being asked is a continuation, even if the model calls it an edit.
   if(parsed.mode==='edit'&&state?.field===parsed.field&&!state.values[parsed.field])parsed.mode='continue';
   if(isStandaloneGreeting(messages.at(-1)!.content)){parsed.mode='chat';parsed.reply='Hello! What would you like to work on?';}
   if(availableAdminModes(state).includes(parsed.mode))intent=parsed;
  }catch{/* Record provider usage even when arguments fail validation. */}
 }
 return {intent,response};
}

function draftCommand(state:AdminConversationState,confirm:boolean){
 if(state.kind==='offer'||state.kind==='document'||state.kind==='email')return confirm?'Confirm send email '+state.token:'Cancel email';
 if(state.kind==='role')return confirm?'Confirm role change '+state.token:'Cancel role change';
 if(state.kind==='department')return confirm?'Confirm department creation '+state.token:'Cancel department creation';
 return confirm?'Confirm request decision '+state.token:'Cancel decision';
}
async function continueDraft(user:string,text:string,member:WorkspaceAccess,state:AdminConversationState){
 switch(state.kind){
  case 'offer':return workspaceOfferChatReply(user,text,member);
  case 'document':return workspaceDocumentChatReply(user,text,member);
  case 'email':return workspaceMailChatReply(user,text,member);
  case 'role':return workspaceChatReply(user,text,member);
  case 'department':return workspaceCatalogChatReply(user,text,member);
  case 'request':return workspaceRequestChatReply(user,text,member);
 }
}
async function replaceDraft(user:string,state:AdminConversationState|null){
 if(!state)return;
 const removed=await db.query("DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'token'=$2 AND expires_at>now()",[user,state.token]);
 if(!removed.rowCount)throw new Error('The saved draft changed. Refresh the chat before starting another action.');
}

export async function dispatchAdminIntent(user:string,member:WorkspaceAccess,intent:AdminIntent,messages:AdminChatMessage[],state:AdminConversationState|null){
 if(member.role!=='admin'||!member.active)return answer('Active Admin access is required.');
 const input=messages.at(-1)!.content,fields=groundedAdminFields(intent,messages,state);
 const userSource=messages.filter(m=>m.role==='user').map(m=>m.content).concat(Object.values(state?.values??{})).join('\n').toLowerCase();
 switch(intent.mode){
  case 'capabilities':return adminPlaygroundGuide('What can an admin do?',member);
  case 'guide':{
   if(intent.capability==='Team requests')return workspaceRequestChatReply(user,'Team requests',member);
   if(intent.capability==='My Customization')return answer('Edit, preview and save the organization’s 18 document templates and attachments in [My Customization](/dashboard/my-customization). Document emails prepared here reuse the saved template and your Admin profile contact details. Choose a document to prepare.',organizationDocuments.map(d=>'Prepare '+d.label));
   if(intent.capability)return adminPlaygroundGuide(intent.capability,member);
   if(isDocumentType(intent.documentType)){const d=documentDefinition(intent.documentType);return answer(`**${d.label}**\n\nI can prepare this from your organization’s saved template, collect its required details and show the exact email before you confirm sending. [Edit the template](/dashboard/my-customization).`,['Prepare '+d.label]);}
   return answer('Which area would you like to explore?',adminPlaygroundGuide('Admin actions',member)!.choices);
  }
  case 'document':{
   if(!isDocumentType(intent.documentType))return answer('Which organization document would you like to prepare?',['Send offer email','My Customization']);
   await replaceDraft(user,state);
   if(intent.documentType==='offer')return workspaceOfferChatReply(user,'Prepare offer letter',member,fields as GuidedOffer);
   return workspaceDocumentChatReply(user,'Prepare '+documentDefinition(intent.documentType).label,member,fields);
  }
  case 'role':{
   if(state?.kind==='role'&&state.field&&!/\b(assign|promote|demote|make|set|change|add|allocate|appoint)\b/i.test(input))return continueDraft(user,intent.value&&input.toLowerCase().includes(intent.value.toLowerCase())?intent.value:input,member,state);
   await replaceDraft(user,state);
   // Seed only sourced values. The existing handler asks for missing fields and validates the exact account.
   return workspaceChatReply(user,'Assign role'+(fields.email?' '+fields.email:'')+(intent.loginRole?' '+intent.loginRole:''),member,{department:fields.department});
  }
  case 'department':{
   // A repeated preparation intent must not erase the name question/preview.
   // Prefer a name in the current message over a field copied from older turns.
   const currentFields=groundedAdminFields(intent,[messages.at(-1)!],state);
   const name=suppliedDepartmentName(input)||currentFields.department;
   if(state?.kind==='department')return workspaceCatalogChatReply(user,name?'Create department '+name:state.field==='department'?input:'Create department',member);
   await replaceDraft(user,state);
   return workspaceCatalogChatReply(user,'Create department'+(name?' '+name:''),member);
  }
  case 'email':{
   await replaceDraft(user,state);
   return workspaceMailChatReply(user,'Send email'+(fields.email?' to '+fields.email:''),member,{subject:intent.value&&userSource.includes(intent.value.toLowerCase())?intent.value:undefined});
  }
  case 'request':{
   if(!intent.requestAction||!/^REQ-[A-Z0-9-]+$/i.test(intent.requestNumber)||!userSource.includes(intent.requestNumber.toLowerCase()))return answer('Which request should I review? Enter its request number from [Team Requests](/dashboard/team-requests).',['Team requests']);
   if(intent.note&&!userSource.includes(intent.note.toLowerCase()))return answer('Please provide the exact reason or fulfilment evidence for this decision.',['Team requests']);
   // The decision handler owns permission/status checks and creates a preview; it never executes on this call.
   return workspaceRequestChatReply(user,`${intent.requestAction} ${intent.requestNumber}${intent.note?(intent.requestAction==='reject'?' because ':' with note ')+intent.note:''}`,member);
  }
  case 'email_status':{
   const supplied=userSource.includes(intent.messageId.toLowerCase());
   const issued=messages.some(m=>m.role==='assistant'&&m.content.includes('**Email queued**')&&m.content.includes(intent.messageId));
   if(!uuid.test(intent.messageId)||!supplied&&!issued)return answer('Which email should I check? Use the message ID shown when it was queued.');
   return workspaceMailChatReply(user,'Email status '+intent.messageId,member);
  }
  case 'confirm':{
   if(!state?.ready)return answer('There is no complete saved preview to confirm. Tell me what you want to prepare first.',['Send offer email','Assign role','Create department']);
   const command=draftCommand(state,true);
   // A semantic interpretation is not execution authorization. Only the existing exact server-issued UI command commits.
   return answer('Your saved preview is ready. Use its confirmation button to proceed with the exact details.',[command,draftCommand(state,false)]);
  }
  case 'cancel':{
   if(!state)return answer('There is no active draft to cancel.');
   const command=draftCommand(state,false);
   if(['offer','document','email'].includes(state.kind))return workspaceMailChatReply(user,command,member);
   return continueDraft(user,command,member,state);
  }
  case 'continue':{
   if(!state?.field)return answer(state?.ready?'Your preview is ready. Would you like to confirm it, edit it or cancel?':'There is no active question to answer.',state?.choices??[]);
   const multiline=state.field==='body'||state.field in documentFields&&documentField(state.field as DocumentFieldKey).input==='multiline';
   const value=state.kind==='department'?(suppliedDepartmentName(input)||((intent.value&&input.toLowerCase().includes(intent.value.toLowerCase()))?intent.value:input)):multiline?input:intent.value||input;
   return continueDraft(user,value,member,state);
  }
  case 'edit':{
   if(!state)return answer('There is no saved draft to edit. Tell me which document or action you want to prepare.');
   if(state.kind==='department'){
    const name=suppliedDepartmentName(input)||fields.department||(intent.value&&input.toLowerCase().includes(intent.value.toLowerCase())?intent.value:'');
    return name?workspaceCatalogChatReply(user,'Create department '+name,member):answer('What should the new department name be?',state.choices);
   }
   let command='';
   if(state.kind==='offer')command=intent.field&&intent.field in offerLabels?'Edit offer '+offerLabels[intent.field as OfferField]:'Edit offer details';
   else if(state.kind==='document'&&isDocumentType(state.documentType))command=intent.field&&documentDefinition(state.documentType).fields.includes(intent.field as DocumentFieldKey)?'Edit document '+documentFieldLabel(state.documentType,intent.field as DocumentFieldKey):'Edit document details';
   else if(state.kind==='email')command=intent.field==='email'?'Edit email recipient':intent.field==='subject'?'Edit email subject':'Edit email message';
   else return answer('To change this action, cancel the preview and provide the replacement details.',[draftCommand(state,false)]);
   const changed=await continueDraft(user,command,member,state);
   // A subsequent field update reloads server state so an old preview token cannot be reused.
   const canFill=state.kind==='offer'||state.kind==='document'||state.kind==='email'&&['email','subject'].includes(intent.field);
   if(intent.value&&intent.field&&canFill){
    const next=await readAdminConversationState(user);
    if(next?.field===intent.field)return continueDraft(user,intent.value,member,next);
   }
   return changed;
  }
  case 'clarify':return answer(intent.reply||'Which task would you like me to handle first?',state?.choices??[]);
  case 'profile':case 'organization':case 'my_requests':{
   const name=(await db.query('SELECT name FROM "user" WHERE id=$1',[user])).rows[0]?.name??'Admin';
   return employeeReply(user,name,intent.mode==='profile'?'About me':intent.mode==='organization'?'About AIForce.Ops':'My requests',member);
  }
  case 'chat':return answer(intent.reply||'What would you like to work on?',state?.choices??[]);
 }
}
type NaturalReply={reply?:string;choices?:string[];responseMode?:string;recordedAt?:string;warning?:string;continueToModel?:boolean;routerModel?:string;usage?:{inputTokens:number;outputTokens:number;totalTokens:number}|null};
export async function adminNaturalLanguageReply(user:string,member:WorkspaceAccess,model:string,messages:AdminChatMessage[],maxTokens?:number):Promise<NaturalReply|null>{
 if(member.role!=='admin'||!member.active)return null;
 const text=messages.at(-1)!.content.trim();
 const state=await readAdminConversationState(user);
 if(state?.choices.includes(text))return null;
 // Custom mail bodies are data, including text that looks like a command. Preserve all formatting.
 if(state?.kind==='email'&&state.field==='body'){
  const result=await workspaceMailChatReply(user,messages.at(-1)!.content,member);
  await recordLocalChat(user,'playground');
  return {...result,usage:{inputTokens:0,outputTokens:0,totalTokens:0}};
 }
 // Exact UI choices retain their server protocol; free text always goes through the interpreter when configured.
 if(text==='My Customization')return {...answer('Edit and save your organization’s document templates in [My Customization](/dashboard/my-customization). The chatbot reuses saved wording and attachments.'),usage:{inputTokens:0,outputTokens:0,totalTokens:0}};
 if(adminCapabilities.some(c=>c.name.toLowerCase()===text.toLowerCase())||/^(Admin (?:actions|capabilities|Email|Requests|People|Security|Review Center|Operations|Agent Studio)|About me|About AIForce\.Ops|Employee services|My requests|New chat|Assign role|Create department|Send offer email)$/i.test(text)||/^(?:Confirm (?:send email|role change|request decision|department creation)|Email status) [a-f0-9-]{36}$/i.test(text))return null;
 if(!process.env.OPENAI_API_KEY)return null;
 const routingModel=adminRouterModel(model);
 if(!supportsPlaygroundModel(routingModel))return {...answer('The Admin interpreter model is not configured correctly. Exact action buttons remain available.'),warning:'No model request was made.'};
 const catalog=await playgroundModelCatalog();
 if(!catalog.entries.some(entry=>entry.id===routingModel&&entry.usable))return {...answer('The configured Admin interpreter model is unavailable for this API account. Check OPENAI_ADMIN_ROUTER_MODEL on the server. Exact action buttons remain available.'),warning:'No model request was made.'};
 const run=await startPlatformRun(user,'agent-studio','');
 try{
  const {intent,response}=await interpretAdminRequest(new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:60000,maxRetries:0}),routingModel,messages,state,maxTokens);
  const usage=response.usage;
  if(usage)await recordModelUsage(user,'playground',{modelId:response.model,inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,totalTokens:usage.total_tokens,...tokenDetails(usage.input_tokens_details),serviceTier:response.service_tier});
  const result=intent?await dispatchAdminIntent(user,member,intent,messages,state):answer('I could not identify a complete action from that response. Please try again; nothing was changed.',state?.choices??['Admin actions']);
  await finishPlatformRun(user,run,!!intent,{code:intent?'admin_intent':'incomplete_intent'});
  return {...result,continueToModel:intent?.mode==='chat'&&!isStandaloneGreeting(text),routerModel:response.model,usage:usage?{inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,totalTokens:usage.total_tokens}:null};
 }catch(error){await finishPlatformRun(user,run,false,error).catch(()=>{});throw error;}
}
