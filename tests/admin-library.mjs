import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import { load } from "./helpers/load-ts.mjs";

const db = new pg.Pool({ ...postgresConnectionOptions(), max: 2 });
const first=randomUUID(),second=randomUUID(),newAdmin=randomUUID(),ordinary=randomUUID();
const users=[first,second,newAdmin,ordinary];
let actor=first;
const dbDeps={"@/lib/db":{db},"./db":{db},"../db":{db}};
const realLibrary=load("lib/admin-library.ts",dbDeps);
// Isolate configuration edits from the real operator's settings. Access to
// agents/tools uses the real database function and real ownership resolvers.
const library={...realLibrary,adminLibrarySettingsOwner:async user=>users.slice(0,3).includes(user)?first:user};
const deps={...dbDeps,
    "@/lib/admin-library":library,"./admin-library":library,"../admin-library":library,
    "@/lib/request-session":{getRequestSession:async()=>({user:{id:actor,name:'Fixture '+actor}})},
    "@/lib/agent-trash":{purgeExpiredAgentTrash:async()=>0},
    "./mail-events":{queueLeaveEvent:async()=>{}},
    "./model-usage":{recordModelUsage:async user=>{assert.equal(user,second);}},
    "./agent-servicenow":{serviceNowStatus:async()=>({configured:false})},
};
const agents=load('app/api/agents/route.ts',deps),tools=load('app/api/tools/route.ts',deps);
const detail=load('app/api/agents/[agentId]/route.ts',deps);
const workflow=load('app/api/agents/[agentId]/workflow/route.ts',deps);
const restore=load('app/api/agents/[agentId]/restore/route.ts',deps);
const toolDetail=load('app/api/tools/[toolId]/route.ts',deps);
const runtime=load('lib/agent-studio-runtime.ts',deps);
const settings=load('lib/builtin-project-tool-settings.ts',deps);
const registry=load('lib/integrations/registry.ts',deps);
const store=load('lib/integrations/store.ts',deps);
const bindings=load('lib/integrations/project-tools.ts',deps);
const dwp=load('lib/dwp-tools.ts',deps);
const {studioGraph}=load('lib/agent-studio-graph.ts');
const req=(path,method='GET',body)=>new Request('https://fixture.test'+path,{method,headers:{origin:'https://fixture.test','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const context=id=>({params:Promise.resolve({agentId:id})});
const list=async()=> (await (await agents.GET(req('/api/agents'))).json()).agents;
try{
    for(const user of users)await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[user,'Fixture '+user,user+'@example.invalid']);
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1",[first]);
    const made=await agents.POST(req('/api/agents','POST',{name:'Shared fixture',purpose:'Shared library test',modelId:'gpt-4.1-mini',instructions:'Fixture',workflowMode:'super'}));
    assert.equal(made.status,201); const agent=(await made.json()).agent;
    const madeTool=await tools.POST(req('/api/tools','POST',{name:'Shared API fixture',purpose:'Fixture',method:'GET',endpointUrl:'https://example.invalid/items'}));
    assert.equal(madeTool.status,201);const tool=(await madeTool.json()).tool;
    actor=second;
    assert.ok(!(await list()).some(a=>a.id===agent.id),'Ordinary users cannot see Admin resources');
    assert.equal((await detail.GET(req('/api/agents/'+agent.id),context(agent.id))).status,404);
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1",[second]);
    const secondList=await list();assert.ok(secondList.some(a=>a.id===agent.id));
    actor=first;const firstList=await list();
    assert.deepEqual(firstList.map(a=>a.id).sort(),secondList.map(a=>a.id).sort(),'Admins see the same records without copying');
    actor=second;
    const edited=await detail.PATCH(req('/api/agents/'+agent.id,'PATCH',{...agent,name:'Edited by second Admin'}),context(agent.id));
    assert.equal(edited.status,200);
    assert.equal((await db.query('SELECT user_id,name FROM agents WHERE id=$1',[agent.id])).rows[0].user_id,first);
    const graph=studioGraph('Shared fixture');
    for(const [index,id] of ['profile','workplace_services'].entries()){
        graph.nodes.push({id,type:'ReferenceNode',position:{x:1000,y:200+index*120},data:{label:id,referenceKind:'builtin',referenceId:id,purpose:id}});
        graph.edges.push({id:'tools-'+id,source:'tools',target:id});
    }
    assert.equal((await workflow.PUT(req('/api/agents/'+agent.id+'/workflow','PUT',graph),context(agent.id))).status,200);
    assert.equal((await workflow.GET(req('/api/agents/'+agent.id+'/workflow'),context(agent.id))).status,200);
    const toolContext={params:Promise.resolve({toolId:tool.id})};
    assert.ok((await (await tools.GET(req('/api/tools'))).json()).tools.some(t=>t.id===tool.id));
    assert.equal((await toolDetail.PUT(req('/api/tools/'+tool.id,'PUT',{...tool,name:'Edited shared tool'}),toolContext)).status,200);
    assert.equal((await db.query('SELECT name FROM tools WHERE user_id=$1 AND id=$2',[first,tool.id])).rows[0].name,'Edited shared tool');
    const secondMade=(await (await agents.POST(req('/api/agents','POST',{name:'Second Admin fixture'}))).json()).agent;
    actor=first;assert.ok((await list()).some(a=>a.id===secondMade.id));
    await db.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1",[newAdmin]);
    actor=newAdmin;assert.ok((await list()).some(a=>a.id===agent.id));assert.ok((await list()).some(a=>a.id===secondMade.id));
    await settings.changeBuiltinTool(second,'save_builtin',{id:'profile',name:'Shared profile',purpose:'Fixture',enabled:false});
    await assert.rejects(()=>settings.builtinTool(first,'profile'),/disabled/);
    await settings.changeBuiltinTool(first,'save_builtin',{id:'profile',name:'My profile',purpose:'Fixture',enabled:true});
    const provider=await registry.createProvider(second,{name:'Shared provider fixture',auth:'none'});
    assert.ok((await registry.listProviders(first)).some(p=>p.id===provider.id));
    await store.saveConnection(second,provider.id,{config:{baseUrl:'https://example.invalid',mapping:JSON.stringify([{id:'read',label:'Read',method:'GET',path:'/items'}])},enabled:false});
    assert.equal((await store.loadConnection(first,provider.id)).enabled,false);
    const binding=await bindings.saveProjectBinding(second,{name:'Shared project tool',purpose:'Fixture',provider:provider.id,operation:'read'});
    assert.ok((await bindings.projectBindings(first)).some(t=>t.id===binding));
    let calls=0;
    const model={chat:{completions:{create:async request=>{
        calls++;const tool=request.tools.find(t=>t.function.description.startsWith('profile:'));
        const toolCalls=calls===1?[{id:'fixture',type:'function',function:{name:tool.function.name,arguments:JSON.stringify({request:''})}}]:undefined;
        if(calls>1)assert.ok(request.messages.some(m=>m.role==='tool'&&m.content.includes('Fixture '+second)),'Personal profile is the acting Admin');
        return {model:'gpt-4.1-mini',usage:{prompt_tokens:5,completion_tokens:5,total_tokens:10},choices:[{finish_reason:toolCalls?'tool_calls':'stop',message:{role:'assistant',content:toolCalls?null:'Fixture response',tool_calls:toolCalls}}]};
    }}}};
    assert.equal((await runtime.runStudioAgent(second,agent.id,[{role:'user',content:'My profile'}],{client:model})).reply,'Fixture response');
    for(const input of ['Start onboarding','Engineering','1 November 2026, Hyderabad','Laptop'])await dwp.advanceDwpRequest(second,input);
    const preview=await dwp.prepareDwpSubmission(second,agent.id,'workplace_services',(await runtime.loadStudioAgent(second,agent.id)).graph);
    await assert.rejects(()=>runtime.approveStudioTool(first,agent.id,preview.approval.token),/expired/);
    await runtime.approveStudioTool(second,agent.id,preview.approval.token);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM employee_service_requests WHERE user_id=$1',[second])).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM employee_service_requests WHERE user_id=$1',[first])).rows[0].n,0);
    actor=second;
    assert.equal((await detail.DELETE(req('/api/agents/'+agent.id,'DELETE'),context(agent.id))).status,200);
    assert.equal((await restore.POST(req('/api/agents/'+agent.id+'/restore','POST'),context(agent.id))).status,200);
    actor=ordinary;assert.equal((await detail.GET(req('/api/agents/'+agent.id),context(agent.id))).status,404);
    await db.query('UPDATE workspace_members SET active=false WHERE user_id=$1',[second]);actor=second;
    assert.equal((await list()).length,0);
    console.log('PASS same shared Admin library, future promotion/new Admins, cross-Admin create/edit/workflow/trash/restore/tools/settings/providers/bindings, actor-scoped profile/usage/requests/confirmations, and non-Admin/disabled isolation. No paid AI or external API calls.');
}finally{await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);await db.end();}
