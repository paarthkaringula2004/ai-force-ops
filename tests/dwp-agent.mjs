import "../scripts/load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import { load } from "./helpers/load-ts.mjs";
import { renderToStaticMarkup } from "react-dom/server";

const db = new pg.Pool({ ...postgresConnectionOptions(), max: 2 });
const deps = { "./db": { db }, "@/lib/db": { db },
    "./mail-events": { queueLeaveEvent: async () => {} },
    "./model-usage": { recordModelUsage: async () => {} } };
const dwp = load("lib/dwp-tools.ts", deps);
const runtime = load("lib/agent-studio-runtime.ts", deps);
const { presetGraph, ensureDwpTools } = load("lib/agent-studio-presets.ts");
const { studioDependencies } = load("lib/agent-studio-graph.ts");
const user = randomUUID(), foreign = randomUUID(), agent = randomUUID();
let graph;
try {
    for (const id of [user, foreign]) {
        await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
            [id, "DWP fixture", id+"@example.invalid"]);
        await db.query("UPDATE workspace_members SET role='manager',permissions='{}',department='DWP test' WHERE user_id=$1",[id]);
    }
    const base = presetGraph("DWP-MAIN-AGENT", "Fixture instructions to preserve");
    base.nodes.find(n=>n.type==='AgentNode').position={x:480,y:250};
    graph = ensureDwpTools(base,"DWP-MAIN-AGENT");
    assert.equal(ensureDwpTools(graph,"DWP-MAIN-AGENT"),graph,"Installing twice is a no-op");
    assert.match(graph.nodes.find(n=>n.type==='AgentNode').data.instructions,/Fixture instructions to preserve/);
    assert.deepEqual(graph.nodes.find(n=>n.type==='AgentNode').position,{x:480,y:250});
    const refs=studioDependencies(graph).references;
    for(const tool of ['hr_knowledge','document_links','profile','employee_onboarding','workplace_services','requests','meeting_rooms'])
        assert.ok(refs.some(n=>n.data.referenceId===tool),`Connected ${tool}`);
    const memory=graph.nodes.find(n=>n.type==='MemoryNode');
    assert.ok(graph.edges.some(e=>e.source===memory.id && graph.nodes.find(n=>n.id===e.target)?.data.referenceId==='hr_knowledge'));
    await db.query("INSERT INTO agents(id,user_id,name,purpose,model_id,instructions) VALUES($1,$2,'DWP-MAIN-AGENT','fixture','gpt-4.1-mini','fixture')",[agent,user]);
    await db.query("INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3::jsonb)",[user,agent,JSON.stringify(graph)]);
    const node=refs.find(n=>n.data.referenceId==='workplace_services');
    let modelCalls = 0;
    const fakeClient = { chat: { completions: { create: async (request) => {
        modelCalls++;
        const tool=request.tools?.find(t=>t.function.description.startsWith('Workplace services:'));
        const calls=modelCalls===1 ? [0,1].map(i=>({id:'fixture-'+i,type:'function',function:{name:tool.function.name,arguments:JSON.stringify({request:'Invented answer must never be used'})}})) : undefined;
        return {model:'gpt-4.1-mini',usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20},choices:[{finish_reason:calls?'tool_calls':'stop',message:{role:'assistant',content:calls?null:'Which team are you joining?',tool_calls:calls}}]};
    } } } };
    await runtime.runStudioAgent(user,agent,[{role:'user',content:'Start onboarding'}],{client:fakeClient});
    const afterModel=(await db.query('SELECT draft FROM employee_playground_drafts WHERE user_id=$1',[user])).rows[0].draft;
    assert.equal(afterModel.kind,'onboarding');
    assert.deepEqual(afterModel.fields,{},'Repeated model tools never advance twice or invent employee answers');
    assert.match((await dwp.advanceDwpRequest(user,'Engineering')).reply,/start date/i);
    assert.match((await dwp.advanceDwpRequest(user,'1 November 2026, Hyderabad office')).reply,/equipment/i);
    assert.match((await dwp.advanceDwpRequest(user,'Laptop')).reply,/review/i);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM employee_service_requests WHERE user_id=$1",[user])).rows[0].n,0);
    const snapshot=await dwp.readDwpTool(user,'employee_onboarding','');
    assert.equal(snapshot.draft.kind,'onboarding');
    assert.equal(snapshot.draft.completed,3);
    assert.equal((await dwp.advanceDwpRequest(user,'Submit request')).needsApproval,true);
    const stale=await dwp.prepareDwpSubmission(user,agent,node.id,graph);
    await db.query("UPDATE employee_playground_drafts SET updated_at=updated_at+interval '1 second' WHERE user_id=$1",[user]);
    await assert.rejects(()=>runtime.approveStudioTool(user,agent,stale.approval.token),/changed/);
    const preview=await dwp.prepareDwpSubmission(user,agent,node.id,graph);
    await assert.rejects(()=>runtime.approveStudioTool(foreign,agent,preview.approval.token),/not found/);
    const submitted=await runtime.approveStudioTool(user,agent,preview.approval.token);
    assert.match(submitted.result.reply,/submitted/i);
    await assert.rejects(()=>runtime.approveStudioTool(user,agent,preview.approval.token),/expired|already/);
    const requests=(await db.query("SELECT kind,status,details FROM employee_service_requests WHERE user_id=$1",[user])).rows;
    assert.equal(requests.length,1); assert.equal(requests[0].kind,'onboarding');
    assert.equal(requests[0].status,'pending_approval'); assert.equal(requests[0].details.team,'Engineering');
    assert.equal((await dwp.readDwpTool(foreign,'employee_onboarding','')).requests.length,0);
    assert.equal((await dwp.readDwpTool(user,'hr_knowledge','leave')).mode,'not_configured');
    const projects=[];
    for(const [owner,name,marker] of [[user,'HR Collection',true],[foreign,'HR Collection',true],[user,'Private finance',false]]){
        const project=randomUUID(),document=randomUUID();projects.push({project,document});
        await db.query("INSERT INTO epace_projects(id,user_id,name,settings) VALUES($1,$2,$3,$4::jsonb)",[project,owner,name,JSON.stringify({dwpCollection:marker})]);
        await db.query("INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'document',$4::jsonb)",[document,owner,project,JSON.stringify({name:name+' handbook',content:owner===user && marker?'Fixture leave policy text':'PRIVATE MUST NOT LEAK'})]);
        await db.query("INSERT INTO epace_chunks(id,document_id,user_id,project_id,ordinal,content) VALUES($1,$2,$3,$4,0,$5)",[randomUUID(),document,owner,project,owner===user && marker?'Fixture leave policy text':'PRIVATE MUST NOT LEAK']);
    }
    const evidence=await dwp.readDwpTool(user,'hr_knowledge','leave policy');
    assert.equal(evidence.sources.length,1); assert.match(evidence.sources[0].content,/Fixture/);
    assert.ok(!JSON.stringify(evidence).includes('PRIVATE'));
    const docs=await dwp.readDwpTool(user,'document_links','');
    assert.equal(docs.documents.length,1);assert.match(docs.documents[0].url,/\/epace\/document\?/);
    const { default: DocumentPage }=load('app/service-review-center/epace/document/page.tsx',{
        ...deps, '@/lib/request-session':{getCurrentSession:async()=>({user:{id:user}})},
    });
    await db.query("UPDATE epace_records SET data=data||$2::jsonb WHERE id=$1",[projects[0].document,JSON.stringify({content:'<script>fixture</script> HR policy'})]);
    const html=renderToStaticMarkup(await DocumentPage({searchParams:Promise.resolve({project:projects[0].project,id:projects[0].document})}));
    assert.ok(html.includes('&lt;script&gt;fixture&lt;/script&gt;'));
    assert.ok(!html.includes('<script>fixture</script>'));
    await assert.rejects(()=>DocumentPage({searchParams:Promise.resolve({project:projects[1].project,id:projects[1].document})}),/404/);
    assert.equal((await dwp.readDwpTool(user,'hr_knowledge','unmatchedkeyword')).sources.length,0);
    await db.query("UPDATE workspace_members SET role='employee',permissions='{}' WHERE user_id=$1",[user]);
    await assert.rejects(()=>dwp.readDwpTool(user,'hr_knowledge','leave'),/Knowledge access/);
    await db.query("UPDATE workspace_members SET active=false WHERE user_id=$1",[foreign]);
    await assert.rejects(()=>dwp.advanceDwpRequest(foreign,'Start onboarding'),/active staff/);
    console.log('PASS DWP graph/idempotence, real onboarding draft to confirmed submission, stale/replayed/foreign approvals, HR scope, document links, empty knowledge and disabled access.');
} finally {
    await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[[user,foreign]]);
    await db.end();
}
