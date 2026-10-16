import assert from 'node:assert/strict';
import {load} from './helpers/load-ts.mjs';
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const conn={id:'connection-1',source_kind:'department',reference_id:'department_search',name:'Department Search',purpose:'Check department availability',enabled:true};
let connections=[conn],member={user_id:'viewer',role:'user',active:true},source={kind:'department',id:'department_search',available:true,purpose:'Read catalog'},pending=false,method='GET',write=false,providerCalls=0,networkCalls=0,modelCalls=0,summaryCalls=0,ledger=0;
let output={status:'completed',model:'gpt-4.1-mini',usage:{input_tokens:100,output_tokens:20,total_tokens:120},output:[{type:'function_call',name:'playground_read_0',arguments:'{"request":"SDE"}'}]};
const queries=[];
const db={query:async(sql,args)=>{queries.push([sql,args]);if(sql.startsWith('SELECT 1 FROM workspace_chat_actions'))return {rows:pending?[{}]:[]};if(sql.startsWith('SELECT method'))return {rows:[{method,endpoint_url:'https://public.example/items/{id}'}]};throw Error('Unexpected query '+sql);}};
const deps={
 './db':{db},'./workspace-access':{workspaceAccess:async()=>member},
 './playground-tools':{listPlaygroundTools:async()=>connections,playgroundConnectionSources:async()=>new Map(connections.map(c=>[c.id,source]))},
 './department-lookup':{readDepartmentLookup:async(m,name)=>{assert.equal(m.user_id,'viewer');return {reply:name==='SDE'?'No department named SDE was found.':'Company catalog',checkedAt:'fixture-check'};}},
 './agent-studio-runtime':{readProjectTool:async(user)=>{assert.equal(user,'viewer','Personal tools run as the recipient');return {value:'read'};}},
 './agent-tool-input':{resolveToolEndpoint:(_url,request)=>{const data=JSON.parse(request);assert.equal(data.id,'123');return 'https://public.example/items/123';}},
 './eassist/transport':{InputError,authorizeOrigin:()=>{}},'./integrations/transport':{external:async(_url,m)=>{assert.equal(m,'GET');networkCalls++;return {response:{status:200},content:'{"value":42}'};}},
 './integrations/project-tools':{resolveProjectBinding:async()=>({provider:'fixture',operation:'read',defaults:{}}),providerOperations:async()=>[{id:'fixture',operations:[{id:'read',write}]}]},
 './integrations/runtime':{prepareIntegration:async()=>{providerCalls++;return {status:'completed',data:42};}},
 './organization-security':{organizationExecutionAllowed:async()=>{}},
 './conversation-ai':{conversationResponse:async(_user,opts)=>{summaryCalls++;assert.match(opts.instructions,/untrusted data/);return {text:'Natural answer using '+opts.input,usage:{inputTokens:10,outputTokens:5,totalTokens:15}};}},
 './model-usage':{recordModelUsage:async()=>{ledger++;}},'./model-pricing':{tokenDetails:()=>({})},'./playground-models':{supportsPlaygroundModel:()=>true},
 openai:{__esModule:true,default:class{responses={create:async()=>{modelCalls++;return output;}}}},
};
const runtime=load('lib/playground-tool-runtime.ts',deps),saved=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
try{
 for(const role of ['user','employee','manager','admin']){
  member={...member,role};connections=[conn];source={kind:'department',id:'department_search',available:true,purpose:'Read catalog'};
  const answer=await runtime.connectedPlaygroundReply('viewer',member,'gpt-4.1-mini',[{role:'user',content:'Is SDE available in our company?'}],'');
  assert.match(answer.reply,/No department named SDE/);assert.match(answer.reply,/Source: Department Search/);assert.equal(answer.usage.totalTokens,135);
 }
 pending=true;let before=modelCalls;assert.equal(await runtime.connectedPlaygroundReply('viewer',member,'fixture',[{role:'user',content:'What about that?'}],''),null);assert.equal(modelCalls,before);pending=false;
 connections=[];assert.equal(await runtime.connectedPlaygroundReply('viewer',member,'fixture',[{role:'user',content:'Is SDE available?'}],''),null);connections=[{...conn,enabled:false}];await assert.rejects(()=>runtime.executePlaygroundTool('viewer',conn,'SDE'),/disabled/);
 connections=[{...conn,purpose:'Changed'}];await assert.rejects(()=>runtime.executePlaygroundTool('viewer',conn,'SDE'),/changed/);
 connections=[conn];source={...source,available:false};await assert.rejects(()=>runtime.executePlaygroundTool('viewer',conn,'SDE'),/unavailable/);
 member={...member,active:false};await assert.rejects(()=>runtime.executePlaygroundTool('viewer',conn,'SDE'),/disabled/);member={...member,active:true};
 const custom={...conn,source_kind:'tool',reference_id:'tool-1'};connections=[custom];source={kind:'tool',id:'tool-1',available:true};method='POST';await assert.rejects(()=>runtime.executePlaygroundTool('viewer',custom,'{"id":"123"}'),/Only an accessible GET/);assert.equal(networkCalls,0);
 method='GET';assert.equal((await runtime.executePlaygroundTool('viewer',custom,'{"id":"123"}')).data.value,42);assert.equal(networkCalls,1);
 const project={...conn,source_kind:'project',reference_id:'binding'};connections=[project];source={kind:'project',id:'binding',available:true};write=true;await assert.rejects(()=>runtime.executePlaygroundTool('viewer',project,'{}'),/approval/);assert.equal(providerCalls,0);write=false;await runtime.executePlaygroundTool('viewer',project,'{}');assert.equal(providerCalls,1);
 connections=[conn];source={kind:'department',id:'department_search',available:true};output={...output,output:[{type:'function_call',name:'ask_tool_question',arguments:'{"question":"Which department should I search?"}'}]};before=summaryCalls;assert.match((await runtime.connectedPlaygroundReply('viewer',member,'fixture',[{role:'user',content:'Check that department?'}],'')).reply,/Which department/);assert.equal(summaryCalls,before);
 output={...output,output:[{type:'function_call',name:'playground_read_0',arguments:'{"request":"SDE"}'}]};
 const followup=await runtime.connectedPlaygroundReply('viewer',member,'fixture',[{role:'user',content:'Check that department?'},{role:'assistant',content:'Which department should I search?'},{role:'user',content:'SDE'}],'');
 assert.match(followup.reply,/No department named SDE/,'A short answer to a clarification must continue the tool read');
 before=modelCalls;assert.equal(await runtime.connectedPlaygroundReply('viewer',member,'fixture',[{role:'user',content:'Hello'}],''),null);assert.equal(modelCalls,before,'Unrelated greetings do not need a tool selector');
 for(const request of ['[]','{"name":42}'])await assert.rejects(()=>runtime.executePlaygroundTool('viewer',conn,request),/Provide a department name/);
 for(const malformed of ['null','[]','{']){
  output={...output,output:[{type:'function_call',name:'playground_read_0',arguments:malformed}]};
  const answer=await runtime.connectedPlaygroundReply('viewer',member,'fixture',[{role:'user',content:'Check SDE?'}],'');assert.match(answer.reply,/No tool ran/);
 }
 // An Admin-owned GET uses the granted source, without reading the recipient's unrelated tool.
 const sharedApi={...custom,owner_user_id:'sharing-admin',shared:true};connections=[sharedApi];source={kind:'tool',id:'tool-1',available:true};method='GET';
 await runtime.executePlaygroundTool('viewer',sharedApi,'{"id":"123"}');
 assert.deepEqual(queries.filter(([sql])=>sql.startsWith('SELECT method')).at(-1)[1],['sharing-admin','tool-1']);
 const sharedProfile={...conn,source_kind:'builtin',reference_id:'profile',owner_user_id:'sharing-admin',shared:true};connections=[sharedProfile];source={kind:'builtin',id:'profile',available:true};
 await runtime.executePlaygroundTool('viewer',sharedProfile,'');
 connections=[];await assert.rejects(()=>runtime.executePlaygroundTool('viewer',sharedProfile,''),/disabled/,'A revoked grant cannot be reused');
 assert.ok(ledger>=5);assert.ok(queries.every(([sql])=>sql.startsWith('SELECT')));
 console.log('PASS: all-role natural tool selection and grounded answers, missing-input questions, usage accounting, draft isolation, disabled/changed/deleted connections, current permission checks, GET-only APIs and project write denial. No real provider calls.');
}finally{if(saved===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved;}
