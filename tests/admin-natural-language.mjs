import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import OpenAI from 'openai';
const require=createRequire(import.meta.url),cache=new Map(),overrides=new Map();
const calls=[];let savedRow=null,usageEvents=0;
const db={query:async(sql,args)=>{
 if(sql.startsWith('SELECT draft'))return {rows:savedRow?[{draft:savedRow}]:[]};
 if(sql.startsWith('DELETE')){calls.push(['delete',...args]);savedRow=null;return {rowCount:1,rows:[]};}
 if(sql.startsWith('SELECT name'))return {rows:[{name:'Fixture Admin'}]};
 throw new Error('Unexpected SQL: '+sql);
}};
const handler=name=>async(...args)=>{calls.push([name,...args]);return {reply:'Backend '+name,choices:[],responseMode:'workspace'};};
for(const [file,exports] of Object.entries({
 'lib/db.ts':{db},'lib/mail.ts':{decryptMail:text=>JSON.parse(text)},
 'lib/playground-models.ts':{supportsPlaygroundModel:()=>true,playgroundModelCatalog:async()=>({entries:[{id:'fixture-model',usable:true}]})},
 'lib/model-usage.ts':{recordModelUsage:async()=>{usageEvents++;}},'lib/model-pricing.ts':{tokenDetails:()=>({})},
 'lib/local-chat-usage.ts':{recordLocalChat:async()=>{}},'lib/eassist/platform.ts':{startPlatformRun:async()=> 'run',finishPlatformRun:async()=>{}},
 'lib/admin-router-config.ts':{adminRouterModel:model=>model},
 'lib/workspace-offer-chat.ts':{workspaceOfferChatReply:handler('offer')},
 'lib/workspace-document-chat.ts':{workspaceDocumentChatReply:handler('document')},
 'lib/workspace-mail-chat.ts':{workspaceMailChatReply:handler('mail')},
 'lib/workspace-chat.ts':{workspaceChatReply:handler('role')},
 'lib/workspace-catalog-chat.ts':{workspaceCatalogChatReply:handler('department')},
 'lib/workspace-request-chat.ts':{workspaceRequestChatReply:handler('request')},
 'lib/employee-playground.ts':{employeeReply:handler('employee')},
}))overrides.set(resolve(file),exports);
let providerResponse=null;
class FakeOpenAI{responses={create:async()=>providerResponse};}
function load(path){
 const full=resolve(path);if(overrides.has(full))return overrides.get(full);if(cache.has(full))return cache.get(full);
 const m={exports:{}};cache.set(full,m.exports);
 new Function('require','module','exports',ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
  if(name==='openai')return {default:FakeOpenAI,__esModule:true};
  if(name.startsWith('.')||name.startsWith('@/')){let local=name.startsWith('@/')?resolve(name.slice(2)):resolve(dirname(full),name);if(!existsSync(local))local+='.ts';return load(local);}
  return require(name);
 },m,m.exports);return m.exports;
}
const intents=load('lib/admin-playground-intent.ts'),router=load('lib/admin-playground-router.ts'),guide=load('lib/admin-playground-guide.ts'),docs=load('lib/organization-documents.ts');
const blank={mode:'chat',capability:'',documentType:'',fields:[],loginRole:'',requestAction:'',requestNumber:'',note:'',messageId:'',field:'',value:'',reply:''};
const intent=details=>intents.parseAdminIntent(JSON.stringify({...blank,...details}));
const member={role:'admin',active:true,user_id:'fixture',permissions:[]};
const user=content=>[{role:'user',content}];
const state=(kind,details={})=>({kind,token:'12345678-1234-1234-1234-123456789abc',ready:false,field:'email',values:{},choices:[],...details});
const dispatch=(i,m=user('hello'),s=null,access=member)=>router.dispatchAdminIntent('fixture',access,intent(i),m,s);
for(const c of guide.adminCapabilities){const result=await dispatch({mode:'guide',capability:c.name});assert.ok(result?.reply,c.name);}
for(const doc of docs.organizationDocuments){
 calls.length=0;await dispatch({mode:'document',documentType:doc.id,fields:[{key:'name',value:'Abhinav'},{key:'email',value:'abhinav@example.com'}]},user('Prepare this for Abhinav at abhinav@example.com'));
 assert.equal(calls[0][0],doc.id==='offer'?'offer':'document');assert.equal(calls[0][4].name,'Abhinav');assert.equal(calls[0][4].email,'abhinav@example.com');
 assert.equal(docs.detectDocumentCommand(calls[0][2]),doc.id);
}
calls.length=0;await dispatch({mode:'role',loginRole:'manager',fields:[{key:'email',value:'person@example.com'}]},user('Make person@example.com the manager'));
assert.deepEqual(calls[0].slice(0,3),['role','fixture','Assign role person@example.com manager']);
calls.length=0;await dispatch({mode:'department',fields:[{key:'department',value:'Threat Analysis'}]},user('We need a department called Threat Analysis'));
assert.equal(calls[0][2],'Create department Threat Analysis');
for(const text of ['SDE','"SDE" --> is the new Dept']){
 calls.length=0;await dispatch({mode:'department',fields:[]},user(text),state('department',{field:'department'}));
 assert.equal(calls.some(c=>c[0]==='delete'),false,'A misclassified continuation must not discard its draft');
 assert.equal(calls[0][0],'department');assert.ok(['SDE','Create department SDE'].includes(calls[0][2]));
}
calls.length=0;await dispatch({mode:'continue',value:'Invented department'},user('SDE'),state('department',{field:'department'}));assert.equal(calls[0][2],'SDE','A model cannot replace a supplied department name with invented text');
calls.length=0;await dispatch({mode:'department',fields:[]},user('As of now Create Department - Seniour Software Developer'));
assert.equal(calls[0][2],'Create department Seniour Software Developer');
calls.length=0;await dispatch({mode:'department',fields:[]},user('Create department'),state('department',{ready:true,field:undefined,values:{department:'SDE'}}));
assert.equal(calls.some(c=>c[0]==='delete'),false);assert.equal(calls[0][2],'Create department');
calls.length=0;await dispatch({mode:'edit',field:'department',value:'SDE'},user('"SDE" --> is the new Dept'),state('department',{ready:true,field:undefined,values:{department:'Old name'}}));assert.equal(calls[0][2],'Create department SDE');
calls.length=0;await dispatch({mode:'email',fields:[{key:'email',value:'person@example.com'}],value:'Approved update'},user('Email person@example.com with subject Approved update'));
assert.equal(calls[0][0],'mail');assert.equal(calls[0][4].subject,'Approved update');
calls.length=0;await dispatch({mode:'request',requestAction:'reject',requestNumber:'REQ-ABC123',note:'Insufficient details'},user('Decline REQ-ABC123 because Insufficient details'));
assert.equal(calls[0][2],'reject REQ-ABC123 because Insufficient details');
calls.length=0;await dispatch({mode:'request',requestAction:'approve',requestNumber:'REQ-INVENTED'},user('Approve his request'));
assert.equal(calls.length,0,'An invented request ID cannot reach an action handler');
calls.length=0;await dispatch({mode:'document',documentType:'offer',fields:[{key:'name',value:'Invented Person'},{key:'email',value:'guessed@example.com'}]},user('Give him an offer'));
assert.deepEqual(calls[0][4],{},'The backend asks instead of accepting fabricated recipient details');
for(const kind of ['offer','document','email','role','department','request']){
 calls.length=0;const previewConfirmation=await dispatch({mode:'confirm'},user('Go ahead with the preview'),state(kind,{ready:true}));
 assert.equal(calls.length,0,'Model interpretation never commits an action');
 assert.ok(previewConfirmation.choices[0].includes('12345678-1234-1234-1234-123456789abc'),'Confirmation button comes from server state');
 calls.length=0;await dispatch({mode:'confirm'},user('go ahead'),state(kind));assert.equal(calls.length,0,'Incomplete drafts never execute');
 calls.length=0;await dispatch({mode:'cancel'},user('Never mind, abandon this'),state(kind));assert.ok(calls[0][2].startsWith('Cancel'));
}
calls.length=0;await dispatch({mode:'confirm'},user('yes'));assert.equal(calls.length,0);
calls.length=0;await dispatch({mode:'continue',value:'rewritten'},user('Dear Abhinav,\n\n**Welcome**\n\nRegards,\nAdmin'),state('email',{field:'body'}));
assert.equal(calls[0][2],'Dear Abhinav,\n\n**Welcome**\n\nRegards,\nAdmin');
calls.length=0;await dispatch({mode:'continue',value:'rewritten'},user('1. Original\n2. Approved\n\n**Terms**'),state('document',{documentType:'employment_contract',field:'terms'}));
assert.equal(calls[0][2],'1. Original\n2. Approved\n\n**Terms**');
calls.length=0;await dispatch({mode:'continue',value:'abhinav@example.com'},user('His email is abhinav@example.com'),state('offer'));assert.equal(calls[0][2],'abhinav@example.com');
for(const mode of ['profile','organization','my_requests']){calls.length=0;await dispatch({mode});assert.equal(calls[0][0],'employee');}
calls.length=0;await dispatch({mode:'document',documentType:'offer'},user('offer'),null,{...member,role:'manager'});assert.equal(calls.length,0);
for(const invalid of [{mode:'execute_sql'},{capability:'Unknown'},{documentType:'invented'},{token:'forged'},{fields:[{key:'__proto__',value:'evil'}]},{fields:[{key:'name',value:'One'},{key:'name',value:'Two'}]}])assert.throws(()=>intent(invalid));
const validResponse=i=>({status:'completed',model:'fixture-model',output:[{type:'function_call',name:i.mode==='capabilities'?'show_admin_capabilities':i.mode==='confirm'?'request_saved_preview_confirmation':'answer_admin_question',arguments:JSON.stringify(i.mode==='capabilities'||i.mode==='confirm'?{}:{reply:i.reply??''})}],usage:{input_tokens:100,output_tokens:30,total_tokens:130}});
for(const output of [{status:'incomplete',output:[]},{...validResponse({mode:'confirm'}),output:[...validResponse({mode:'confirm'}).output,...validResponse({mode:'confirm'}).output]},{...validResponse({mode:'confirm'}),output:[{type:'function_call',name:'unknown',arguments:'{}'}]},{...validResponse({mode:'confirm'}),output:[{type:'function_call',name:'show_admin_capabilities',arguments:'{"token":"forged"}'}]}]){
 const result=await router.interpretAdminRequest({responses:{create:async()=>output}},'fixture-model',user('yes'),null);
 assert.equal(result.intent,null);
}
let createArguments;
await router.interpretAdminRequest({responses:{create:async args=>{createArguments=args;return validResponse({mode:'capabilities'});}}},'fixture-model',user('Which things can I do here?'),null,1);
assert.equal(createArguments.store,false);assert.equal(createArguments.tools[0].strict,true);assert.equal(createArguments.parallel_tool_calls,false);assert.ok(createArguments.max_output_tokens>=2048,'Router budget is independent of a tiny answer display limit');
// Exercise the actual API-first routing path, including usage and bypassing model calls for saved choices.
const previousKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
providerResponse=validResponse({mode:'capabilities'});
const natural=await router.adminNaturalLanguageReply('fixture',member,'fixture-model',user('What powers do I have in this workspace?'));
assert.match(natural.reply,/66\. \[Workspace settings\]/);assert.equal(natural.usage.totalTokens,130);assert.equal(usageEvents,1);
providerResponse={...validResponse({}),status:'incomplete'};
await router.adminNaturalLanguageReply('fixture',member,'fixture-model',user('Please help me with this'));assert.equal(usageEvents,2,'Incomplete inference usage is recorded');
assert.equal(await router.adminNaturalLanguageReply('fixture',member,'fixture-model',user('Offer emails')),null);
assert.equal(await router.adminNaturalLanguageReply('fixture',{...member,role:'manager'},'fixture-model',user('Give him an offer')),null);
if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
console.log('PASS: 66 capability destinations, 18 document adapters, sourced fields, actual workflow dispatch, confirmations from server state, incomplete/refused/invalid output, role isolation, exact body formatting, follow-up field answers and provider usage.');

if(process.argv.includes('--live')){
 if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY required for live interpreter verification');
 const model=process.env.ADMIN_INTENT_TEST_MODEL||'gpt-4.1-mini',client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:60000,maxRetries:0});
 let examples=[
  ['Just tell me what a Admin Can do in form of Points\n1.\n2.\nAnd can implement it','capabilities'],
  ['What powers do I have here, and can you walk me through using them?','capabilities'],
  ['Give Abhinav an offer for Software Development. His email is abhinav@example.com.','document','offer'],
  ['We are hiring Abhinav at abhinav@example.com as a developer. Please prepare his employment offer.','document','offer'],
  ['Send an experience certificate to Meena, meena@example.com.','document','experience'],
  ['Please write our salary hike notification for this employee.','document-or-clarify','salary_revision'],
  ['Can you issue a probation confirmation letter?','document','probation_confirmation'],
  ['Prepare a PIP for the employee.','document','performance_plan'],
  ['Make person@example.com responsible as a website manager.','role'],
  ['Give person@example.com full Admin access.','role'],
  ['Set up a new department named Threat Analysis.','department'],
  ['We need another department called Customer Success, can you add it?','department'],
  ['Please accept REQ-ABC123 for me.','request'],
  ['Turn down REQ-ABC123 because the budget was not approved.','request'],
  ['Mark REQ-ABC123 as fulfilled with note Equipment delivered today.','request'],
  ['Email person@example.com about the onboarding meeting.','email'],
  ['How do I revoke a disabled employee account?','guide'],
  ['Where do I change the letter templates that the bot uses?','guide'],
  ['Tell me is there any mailing system ?','guide'],
  ['Who am I and what is my Admin ID?','profile'],
  ['Show requests from my entire organization.','guide'],
  ['Hello good morning!','chat'],
  ['Please approve it and send him an offer and delete his account.','clarify'],
  ['His email address is abhinav@example.com.','continue',null,state('offer')],
  ['Go ahead and send the exact letter I just reviewed.','confirm',null,state('offer',{ready:true,field:undefined})],
  ['Should I send this or change the compensation first?','chat-or-clarify',null,state('offer',{ready:true,field:undefined})],
  ['Do not send it yet. I need to think.','not-confirm',null,state('offer',{ready:true,field:undefined})],
  ['Change the approved compensation to INR 8 lakh per annum.','edit',null,state('offer',{ready:true,field:undefined})],
  ['Never mind, discard the draft.','cancel',null,state('offer',{ready:true,field:undefined})],
 ];
 const filter=process.argv.find(arg=>arg.startsWith('--live-filter='))?.slice('--live-filter='.length);
 if(filter)examples=examples.filter(([prompt])=>new RegExp(filter,'i').test(prompt));
 let tokens=0,failures=[];
 for(let offset=0;offset<examples.length;offset+=4){
  const results=await Promise.allSettled(examples.slice(offset,offset+4).map(async([text,expected,doc,s])=>{
   const {intent:i,response}=await router.interpretAdminRequest(client,model,user(text),s??null);
   tokens+=response.usage?.total_tokens??0;
   assert.ok(i,'A complete intent is required: '+JSON.stringify({status:response.status,incomplete:response.incomplete_details,output:response.output.filter(item=>item.type==='function_call')}));
   if(expected==='document-or-clarify'&&i.mode==='clarify'){
    assert.ok(i.reply,'Clarification must ask a real question');
    const followup=await router.interpretAdminRequest(client,model,[{role:'user',content:text},{role:'assistant',content:i.reply},{role:'user',content:'The employee is Meena, meena@example.com. Her approved new salary is INR 8 lakh per annum.'}],s??null);
    tokens+=followup.response.usage?.total_tokens??0;
    assert.equal(followup.intent?.mode,'document','Clarifying a missing recipient must lead to the document workflow');
    assert.equal(followup.intent.documentType,doc);
    return {prompt:text,mode:'clarify → document',documentType:doc};
   }
   if(expected==='not-confirm')assert.notEqual(i.mode,'confirm');
   else if(expected==='chat-or-clarify')assert.ok(['chat','clarify','edit'].includes(i.mode),i.mode);
   else if(expected==='document-or-clarify')assert.equal(i.mode,'document');
   else assert.equal(i.mode,expected,text+' '+JSON.stringify(i));
   if(doc)assert.equal(i.documentType,doc,text);
   return {prompt:text,mode:i.mode,documentType:i.documentType,capability:i.capability};
  }));
  for(const [index,result] of results.entries()){
   if(result.status==='fulfilled')console.log('LIVE PASS:',JSON.stringify(result.value));
   else {failures.push({prompt:examples[offset+index][0],error:result.reason.message});console.log('LIVE FAIL:',JSON.stringify(failures.at(-1)));}
  }
 }
 console.log('Live inference tokens:',tokens,'No backend mutations or emails were executed.');
 assert.deepEqual(failures,[]);
}
