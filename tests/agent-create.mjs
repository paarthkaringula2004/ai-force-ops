import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n in deps?deps[n]:require(n),m,m.exports);return m.exports;}
const graphs=load('lib/agent-studio-graph.ts'),normal=load('lib/workflow-graph.ts');
let role=true,signed=true,fail=false,statements=[],createdGraph;
const client={release(){},async query(sql,args){statements.push(sql);if(sql.includes('INSERT INTO agents'))return {rows:[{id:'11111111-1111-4111-8111-111111111111',name:args[2],purpose:args[3],modelId:args[4],instructions:args[5],createdAt:new Date(),updatedAt:new Date()}]};if(sql.includes('INSERT INTO agent_workflows')){createdGraph=JSON.parse(args[2]);if(fail)throw new Error('fixture failure');}return {rows:[]};}};
const route=load('app/api/agents/route.ts',{'@/lib/db':{db:{connect:async()=>client}},'@/lib/request-session':{getRequestSession:async()=>signed?{user:{id:'fixture-user'}}:null},'@/lib/agent-trash':{purgeExpiredAgentTrash:async()=>{}},'@/lib/agent-studio-graph':graphs,'@/lib/workflow-graph':normal,'@/lib/workspace-access':{workspaceAccess:async()=>({})},'@/lib/workspace-permissions':{permitted:()=>role},'@/lib/service-review/ingestion':{requireSameOrigin:r=>{if(r.headers.get('origin')!=='http://localhost')throw new Error('origin');}}});
const request=(mode,origin='http://localhost')=>new Request('http://localhost/api/agents',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({name:'New fixture',purpose:'test',instructions:'Help test',modelId:'gpt-4.1-mini',workflowMode:mode})});
for(const mode of ['actual','super']){statements=[];assert.equal((await route.POST(request(mode))).status,201);assert.equal(createdGraph.nodes[0].data.workflowMode,mode);assert.equal(createdGraph.nodes[0].draggable,false);assert.equal(createdGraph.nodes[0].deletable,false);assert.equal(createdGraph.nodes.some(n=>n.type==='AgentsNode'),mode==='super');assert.equal(createdGraph.nodes.some(n=>n.type==='EndNode'),false);if(mode==='actual'){assert.equal(createdGraph.nodes.length,1);assert.equal(createdGraph.edges.length,0);}assert.equal(statements.at(-1),'COMMIT');assert.ok(!statements.some(s=>s.startsWith('UPDATE agents')));}
assert.equal((await route.POST(request('invalid'))).status,400);
assert.equal((await route.POST(request('actual','http://foreign.invalid'))).status,403);
role=false;assert.equal((await route.POST(request('actual'))).status,403);role=true;
signed=false;assert.equal((await route.POST(request('actual'))).status,401);signed=true;
fail=true;statements=[];assert.equal((await route.POST(request('actual'))).status,503);assert.equal(statements.at(-1),'ROLLBACK');
console.log('PASS: Actual/Super creation, fixed Start, atomic workflow save, rollback, authentication, role and origin checks; no existing-agent updates. Mock database.');
