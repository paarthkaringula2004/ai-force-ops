import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n in deps?deps[n]:require(n),m,m.exports);return m.exports;}
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
class IngestionError extends InputError{}
const seal=v=>Buffer.from(v).toString('base64'),unseal=v=>Buffer.from(v,'base64').toString();
const transport={InputError,seal,unseal,boundedJson:r=>r.json()};
const catalog=load('lib/integrations/catalog.ts'),templates=load('lib/integrations/templates.ts');
const projectTools=load('lib/agent-project-tools.ts',{'./integrations/catalog':catalog});
const graph=load('lib/agent-studio-graph.ts');
let admin=true,session={user:{id:'fixture-admin'}},old=false,createdGraphs=[],queryLog=[];
const db={query:async(sql,args=[])=>{
 queryLog.push({sql,args});
 if(sql.startsWith('SELECT id FROM agents'))return {rows:old?[{id:'preserved-agent'}]:[],rowCount:old?1:0};
 if(sql.startsWith('INSERT INTO agent_workflows'))createdGraphs.push(JSON.parse(args[2]));
 return {rows:[],rowCount:1};
},connect:async()=>({...db,release(){}})};
const requireIntegrationAdmin=async()=>{if(!admin)throw new InputError('Administrator access required',403);};
const installer=load('lib/integrations/install.ts',{'../db':{db},'../eassist/transport':transport,'./templates':templates,'../agent-project-tools':projectTools,'../agent-studio-graph':graph,'./runtime':{requireIntegrationAdmin}});
for(const t of templates.demoAgentTemplates){const result=await installer.installIntegrationTemplate('fixture-admin',t.id);assert.equal(result.created,true);const g=createdGraphs.at(-1);assert.equal(graph.studioDependencies(g).references.length,t.providers.length+(t.builtins?.length||0));assert.match(g.nodes.find(n=>n.id==='main').data.instructions,/Never put credentials/);}
const before=createdGraphs.length;old=true;assert.equal((await installer.installIntegrationTemplate('fixture-admin','qualys')).created,false);assert.equal(createdGraphs.length,before);assert.ok(!queryLog.some(q=>/^UPDATE (agents|agent_workflows)/.test(q.sql)));
admin=false;await assert.rejects(()=>installer.installIntegrationTemplate('fixture-admin','qualys'),e=>e.status===403);admin=true;
const requireSameOrigin=r=>{if(r.headers.get('origin')==='https://evil.example')throw new IngestionError('Cross-site changes are not allowed.',403);};
const templateRoute=load('app/api/agents/integration-templates/route.ts',{'@/lib/request-session':{getRequestSession:async()=>session},'@/lib/service-review/ingestion':{requireSameOrigin,IngestionError},'@/lib/eassist/transport':transport,'@/lib/integrations/templates':templates,'@/lib/integrations/install':installer});
const req=body=>new Request('http://localhost:3000/api/agents/integration-templates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
session=null;assert.equal((await templateRoute.POST(req({template:'all'}))).status,401);session={user:{id:'fixture-admin'}};
admin=false;assert.equal((await templateRoute.POST(req({template:'all'}))).status,403);admin=true;
assert.equal((await templateRoute.POST(new Request('http://localhost:3000/api/agents/integration-templates',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}))).status,403);
assert.equal((await templateRoute.POST(req({template:'missing'}))).status,400);
const bulk=await (await templateRoute.POST(req({template:'all'}))).json();assert.equal(bulk.preserved,18);assert.equal(bulk.created,0);

let monitorSaved,monitorRow=null,monitorJobs=[],executionCount=0,readOnly=true,configured=true,monitorFailure=false;
const monitorDb={query:async(sql,args=[])=>{
 if(sql.startsWith('INSERT INTO integration_monitors'))monitorSaved=args;
 if(sql.startsWith('WITH due'))return {rows:monitorJobs};
 if(sql.startsWith('UPDATE integration_monitors SET result_cipher'))monitorRow={operation:'list',enabled:true,interval_seconds:300,last_status:'completed',last_checked_at:'2026-10-14T00:00:00Z',result_cipher:args[2]};
 if(sql.startsWith("UPDATE integration_monitors SET last_status='failed'"))monitorRow={...monitorRow,last_status:'failed'};
 if(sql.startsWith('SELECT operation'))return {rows:monitorRow?[monitorRow]:[]};
 return {rows:[],rowCount:1};
}};
const monitor=load('lib/integrations/monitor.ts',{'./access':{requireIntegrationAccess:requireIntegrationAdmin},'../db':{db:monitorDb},'../eassist/transport':transport,'./runtime':{requireIntegrationAdmin,integrationCapabilities:async()=>({configured,operations:[{id:'list',requiresApproval:!readOnly}]}),prepareIntegration:async()=>{executionCount++;if(monitorFailure)throw new InputError('Unavailable');return {status:'completed',result:{items:['fixture']}};}}});
configured=false;await assert.rejects(()=>monitor.configureMonitor('fixture-admin','soc','list',{},300,true),/Save.*first/);configured=true;
readOnly=false;await assert.rejects(()=>monitor.configureMonitor('fixture-admin','soc','list',{},300,true),/Only read/);readOnly=true;
await assert.rejects(()=>monitor.configureMonitor('fixture-admin','soc','list',{},1,true),/interval/);
await monitor.configureMonitor('fixture-admin','soc','list',{},300,true);assert.equal(monitorSaved[5],300);assert.ok(monitorSaved[3]!=='{}');
monitorJobs=[{user_id:'fixture-admin',provider:'soc',operation:'list',inputs_cipher:seal('{}')}];await monitor.maintainIntegrationMonitors();assert.equal(executionCount,1);assert.equal((await monitor.monitorSnapshot('fixture-admin','soc')).lastRecordedResult.result.items[0],'fixture');
const priorCipher=monitorRow.result_cipher;monitorFailure=true;await monitor.maintainIntegrationMonitors();assert.equal(monitorRow.last_status,'failed');assert.equal(monitorRow.result_cipher,priorCipher);
readOnly=false;const beforeExec=executionCount;await monitor.maintainIntegrationMonitors();assert.equal(executionCount,beforeExec);

let capabilities={operations:[{id:'read',requiresApproval:false},{id:'write',requiresApproval:true}]};
const integrationRoute=load('app/api/tools/integrations/route.ts',{'@/lib/integrations/access':{requireIntegrationAccess:requireIntegrationAdmin,requireIntegrationCreate:requireIntegrationAdmin},'@/lib/request-session':{getRequestSession:async()=>session},'@/lib/service-review/ingestion':{requireSameOrigin,IngestionError},'@/lib/eassist/transport':transport,'@/lib/integrations/registry':{listProviders:async()=>catalog.integrationCatalog,createProvider:async()=>({}),archiveProvider:async()=>{}},'@/lib/integrations/catalog':catalog,'@/lib/integrations/store':{saveConnection:async()=>{}},'@/lib/integrations/runtime':{requireIntegrationAdmin,integrationCapabilities:async()=>capabilities,prepareIntegration:async()=>({status:'completed'}),approveIntegration:async()=>({status:'completed'})},'@/lib/db':{db},'@/lib/integrations/monitor':monitor});
session=null;assert.equal((await integrationRoute.GET(new Request('http://localhost:3000/api/tools/integrations'))).status,401);session={user:{id:'fixture-admin'}};
admin=false;assert.equal((await integrationRoute.GET(new Request('http://localhost:3000/api/tools/integrations'))).status,403);admin=true;
assert.equal((await integrationRoute.POST(req({action:'check',provider:'soc',operation:'write'}))).status,400);
assert.equal((await integrationRoute.POST(req({action:'check',provider:'soc',operation:'read'}))).status,200);
assert.equal((await integrationRoute.POST(req({action:'run',provider:'soc',operation:'read',inputs:[]}))).status,400);
assert.equal((await integrationRoute.POST(req({action:'unsupported'}))).status,400);
const response=await integrationRoute.GET(new Request('http://localhost:3000/api/tools/integrations'));assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(await response.json()).includes('secret_cipher'));
console.log('PASS: all 18 template graphs have connected tool references; existing agents preserved; single/bulk installation authorization and CSRF; read-only monitor validation, encrypted snapshots, failed/latest check semantics and mutation rejection; integration API authentication, check/read boundaries, invalid input handling and no-store responses. Isolated fixtures only.');
