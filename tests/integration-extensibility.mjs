import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n in deps?deps[n]:require(n),m,m.exports);return m.exports;}
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const seal=v=>Buffer.from(v).toString('base64'),unseal=v=>Buffer.from(v,'base64').toString();
const transport={InputError,seal,unseal};const catalog=load('lib/integrations/catalog.ts');
const definitions=[],connections=[],bindings=[],queries=[];
const db={query:async(sql,a=[])=>{
 queries.push(sql);
 if(sql.startsWith('SELECT id,definition'))return {rows:definitions.filter(r=>r.user===a[0])};
 if(sql.startsWith('SELECT definition'))return {rows:definitions.filter(r=>r.user===a[0]&&r.id===a[1])};
 if(sql.startsWith('INSERT INTO integration_definitions')){const old=definitions.find(r=>r.user===a[0]&&r.id===a[1]);if(old)old.deleted_at='now';else definitions.push({user:a[0],id:a[1],definition:a[2]?JSON.parse(a[2]):null,deleted_at:a[2]?null:'now'});return {rows:[]};}
 if(sql.startsWith('UPDATE integration_definitions')){const row=definitions.find(r=>r.user===a[0]&&r.id===a[1]);if(row)row.deleted_at=null;return {rows:[]};}
 if(sql.startsWith('UPDATE integration_connections SET enabled')){for(const c of connections.filter(r=>r.user===a[0]&&r.provider===a[1])){c.enabled=false;c.revision++;}return {rows:[]};}
 if(sql.startsWith('SELECT secret_cipher'))return {rows:connections.filter(r=>r.user===a[0]&&r.provider===a[1])};
 if(sql.startsWith('SELECT config'))return {rows:connections.filter(r=>r.user===a[0]&&r.provider===a[1])};
 if(sql.startsWith('SELECT provider,config'))return {rows:connections.filter(r=>r.user===a[0])};
 if(sql.startsWith('INSERT INTO integration_connections')){let row=connections.find(r=>r.user===a[0]&&r.provider===a[1]);const value={user:a[0],provider:a[1],config:JSON.parse(a[2]),secret_cipher:a[3],enabled:a[4],revision:(row?.revision||0)+1};if(row)Object.assign(row,value);else connections.push(value);return {rows:[]};}
 if(sql.startsWith('INSERT INTO project_tool_bindings')){bindings.push({id:a[0],user:a[1],name:a[2],purpose:a[3],provider:a[4],operation:a[5],defaults:JSON.parse(a[6]),revision:1});return {rows:[]};}
 if(sql.startsWith('SELECT id,name,purpose,provider'))return {rows:bindings.filter(r=>r.user===a[0]&&(!a[1]||r.id===a[1])&&!r.deleted_at)};
 if(sql.startsWith('UPDATE project_tool_bindings SET name')){const row=bindings.find(r=>r.user===a[0]&&r.id===a[1]);Object.assign(row,{name:a[2],purpose:a[3],provider:a[4],operation:a[5],defaults:JSON.parse(a[6]),revision:row.revision+1});return {rows:[]};}
 return {rows:[],rowCount:1};
},connect:async()=>({...db,release(){}})};
const registry=load('lib/integrations/registry.ts',{'../db':{db},'../eassist/transport':transport,'./catalog':catalog});
const store=load('lib/integrations/store.ts',{'../db':{db},'../eassist/transport':transport,'./registry':registry});
const project=load('lib/integrations/project-tools.ts',{'../db':{db},'../eassist/transport':transport,'./registry':registry,'./store':store});
for(const auth of ['none','basic','bearer','oauth2']){
 const p=await registry.createProvider('owner',{name:`Fixture ${auth}`,description:'Reusable fixture API',category:'Custom',auth});assert.ok(p.id.startsWith('custom_'));assert.equal(p.auth,auth);assert.equal((await registry.resolveProvider('other',p.id)),undefined);
 assert.ok((await registry.listProviders('owner')).some(r=>r.id===p.id));assert.ok(!(await registry.listProviders('other')).some(r=>r.id===p.id));
}
await assert.rejects(()=>registry.createProvider('owner',{name:'',auth:'bearer'}),/integration name/);await assert.rejects(()=>registry.createProvider('owner',{name:'Fixture',auth:'unknown'}),/authentication/);
const clone=await registry.createProvider('owner',{name:'Second AWS account',templateId:'lambda',category:'Cloud & automation'});assert.equal(clone.auth,'aws');assert.equal(clone.adapter,'lambda');assert.equal(clone.operations[0].id,'functions');
const custom=(await registry.listProviders('owner')).find(p=>p.name==='Fixture none');
await store.saveConnection('owner',custom.id,{enabled:false,config:{}});assert.equal((await store.loadConnection('owner',custom.id)).enabled,false);
await assert.rejects(()=>store.saveConnection('owner',custom.id,{enabled:true,config:{}}),/Complete API base URL/);
await store.saveConnection('owner',custom.id,{enabled:true,config:{baseUrl:'https://fixture.example.com',mapping:'[{"id":"read","label":"Read assets","path":"/assets"},{"id":"write","label":"Create asset","method":"POST","path":"/assets"}]'}});
const id=await project.saveProjectBinding('owner',{name:'Asset lookup',purpose:'Read assets',provider:custom.id,operation:'read',defaults:{limit:10}});
assert.match(id,/^[a-f\d-]{36}$/);const binding=await project.resolveProjectBinding('owner',id);assert.equal(binding.defaults.limit,10);assert.equal(project.bindingTool(binding).referenceKind,'builtin');assert.ok(project.bindingTool(binding).id.startsWith('project:'));
await assert.rejects(()=>project.resolveProjectBinding('other',id),e=>e.status===404);
await assert.rejects(()=>project.saveProjectBinding('owner',{name:'Bad',provider:custom.id,operation:'unknown'}),/Choose an integration/);
await project.saveProjectBinding('owner',{id,name:'Asset updater',provider:custom.id,operation:'write',defaults:{body:{name:'fixture'}}});assert.equal((await project.resolveProjectBinding('owner',id)).revision,2);
await registry.archiveProvider('owner',custom.id);assert.equal(await registry.resolveProvider('owner',custom.id),undefined);assert.equal((await store.loadConnection('owner',custom.id)).enabled,false);assert.ok((await registry.listProviders('owner',true)).some(p=>p.id===custom.id));
await registry.archiveProvider('owner',custom.id,true);assert.ok(await registry.resolveProvider('owner',custom.id));assert.equal((await store.loadConnection('owner',custom.id)).enabled,false);
await registry.archiveProvider('owner','lambda');assert.equal(await registry.resolveProvider('owner','lambda'),undefined);assert.ok(await registry.resolveProvider('other','lambda'));await registry.archiveProvider('owner','lambda',true);assert.ok(await registry.resolveProvider('owner','lambda'));assert.ok(queries.includes('COMMIT'));
bindings[0].deleted_at='now';await assert.rejects(()=>project.resolveProjectBinding('owner',id),e=>e.status===404);assert.equal((await project.projectBindings('owner')).length,0);
const form=store.parseMappings('[{"id":"form","label":"Form","method":"POST","path":"/submit","contentType":"application/x-www-form-urlencoded","form":{"name":"{name}"},"headers":{"X-Tenant":"lab"}}]')[0];assert.equal(form.form.name,'{name}');assert.equal(form.write,true);
assert.throws(()=>store.parseMappings('[{"id":"bad","label":"Bad","path":"/x","headers":{"Authorization":"secret"}}]'),/Credentials belong/);
assert.throws(()=>store.parseMappings('[{"id":"bad","label":"Bad","path":"/x","headers":{"Host":"other"}}]'),/Credentials belong/);
let member={role:'admin',active:true},session={user:{id:'owner'}};
const permissions=load('lib/workspace-permissions.ts');
const projectCatalog=load('lib/agent-project-tools.ts',{'./integrations/catalog':catalog});
const builtinSettings=load('lib/builtin-project-tool-settings.ts',{'./db':{db},'./eassist/transport':{InputError},'./agent-project-tools':projectCatalog});
const projectRoute=load('app/api/tools/project/route.ts',{'@/lib/db':{db},'@/lib/request-session':{getRequestSession:async()=>session},'@/lib/service-review/ingestion':{requireSameOrigin:r=>{if(r.headers.get('origin')==='https://evil.example')throw new InputError('Cross-site changes are not allowed.',403);},IngestionError:InputError},'@/lib/eassist/transport':{...transport,boundedJson:r=>r.json()},'@/lib/builtin-project-tool-settings':builtinSettings,'@/lib/integrations/project-tools':project,'@/lib/integrations/runtime':{requireIntegrationAdmin:async()=>{if(!permissions.permitted(member,'admin'))throw new InputError('Admin required',403);}},'@/lib/workspace-access':{workspaceAccess:async()=>member},'@/lib/workspace-permissions':permissions});
const request=body=>new Request('http://localhost:3000/api/tools/project',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
session=null;assert.equal((await projectRoute.GET(new Request('http://localhost:3000/api/tools/project'))).status,401);session={user:{id:'owner'}};member={role:'employee',active:true};assert.equal((await projectRoute.POST(request({action:'save',name:'No access'}))).status,403);const employeeView=await(await projectRoute.GET(new Request('http://localhost:3000/api/tools/project'))).json();assert.equal(employeeView.canManage,false);assert.deepEqual(employeeView.tools,[]);assert.deepEqual(employeeView.integrations,[]);
member={role:'admin',active:true};assert.equal((await projectRoute.POST(request(null))).status,400);assert.equal((await projectRoute.POST(request({action:'save',name:'New API project tool',provider:custom.id,operation:'read',defaults:{}}))).status,200);
assert.equal((await projectRoute.POST(new Request('http://localhost:3000/api/tools/project',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}))).status,403);
console.log('PASS: custom integration creation with four auth modes, owner isolation, disabled partial setup, configured validation, custom project-tool creation/editing/defaults/bindings, invalid-operation rejection, recoverable custom/built-in integration deletion and disabled restore, deleted-tool execution denial, XML/form/header mapping validation. Fixture database only.');
