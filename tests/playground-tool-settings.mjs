import assert from 'node:assert/strict';
import {load} from './helpers/load-ts.mjs';
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
class PolicyError extends Error{status=403;}
let actor='alice',role='user',active=true,session=true,blocked=false;
const rows=[],queries=[];
const client={query:async(sql,args)=>{
 queries.push([sql,args]);
 if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SELECT pg_advisory'))return {rows:[]};
 if(sql.startsWith('SELECT id,source_kind,reference_id FROM playground_tool_connections'))return {rows:rows.filter(r=>r.user_id===args[0])};
 if(sql.startsWith('INSERT INTO playground_tool_connections')){const [id,user,kind,ref,name,purpose,enabled,shared_roles]=args;const old=rows.find(r=>r.user_id===user&&r.source_kind===kind&&r.reference_id===ref);if(old)Object.assign(old,{name,purpose,enabled,shared_roles});else rows.push({id,user_id:user,source_kind:kind,reference_id:ref,name,purpose,enabled,shared_roles});return {rows:[]};}
 throw Error('Unexpected transaction SQL '+sql);
},release(){}};
const db={connect:async()=>client,query:async(sql,args)=>{
 queries.push([sql,args]);
 if(sql.includes('FROM tools WHERE user_id'))return {rows:[{id:'read-api',name:'Read API',purpose:'Read records',method:'GET',endpoint_url:'https://fixture.invalid/{id}'},{id:'write-api',name:'Write API',purpose:'Changes',method:'POST'}]};
 if(sql.includes('FROM playground_tool_connections c'))return {rows:rows.filter(r=>r.user_id===args[0]).map(r=>({...r,owner_user_id:r.user_id,shared:false}))};
 if(sql.startsWith('SELECT id,source_kind,reference_id,name'))return {rows:rows.filter(r=>r.user_id===args[0])};
 if(sql.startsWith('DELETE FROM playground_tool_connections')){for(let i=rows.length-1;i>=0;i--)if(rows[i].user_id===args[0]&&rows[i].id===args[1])rows.splice(i,1);return {rows:[]};}
 throw Error('Unexpected SQL '+sql);
}};
const policy={organizationWriteAllowed:async()=>{if(blocked)throw new PolicyError('Changes disabled');},OrganizationPolicyError:PolicyError};
const store=load('lib/playground-tools.ts',{'./db':{db},'./builtin-project-tool-settings':{builtinTools:async user=>{assert.equal(user,actor);return [{id:'profile',name:'Profile',purpose:'Own profile',capabilityPurpose:'Own profile',enabled:true},{id:'scan_reports',name:'Scans',purpose:'Scan data',capabilityPurpose:'Admin scans',enabled:true}];}},'./integrations/project-tools':{projectBindings:async()=>[{id:'read-binding',name:'Read binding',purpose:'Read',provider:'provider',operation:'read'},{id:'write-binding',name:'Write binding',purpose:'Write',provider:'provider',operation:'write'}],providerOperations:async()=>[{id:'provider',configured:true,operations:[{id:'read',write:false},{id:'write',write:true}]}]},'./eassist/transport':{InputError},'./organization-security':policy});
const route=load('app/api/tools/playground/route.ts',{'@/lib/db':{db},'@/lib/request-session':{getRequestSession:async()=>session?{user:{id:actor}}:null},'@/lib/workspace-access':{workspaceAccess:async()=>({role,active})},'@/lib/playground-tools':store,'@/lib/eassist/transport':{InputError,boundedJson:r=>r.json()},'@/lib/service-review/ingestion':{IngestionError:InputError,requireSameOrigin:r=>{if(r.headers.get('origin')!=='https://fixture.invalid')throw new InputError('Invalid origin',403);}},'@/lib/organization-security':policy});
const get=()=>route.GET(new Request('https://fixture.invalid/api/tools/playground'));
const post=(body,origin='https://fixture.invalid')=>route.POST(new Request('https://fixture.invalid/api/tools/playground',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)}));
const payload={action:'save',sourceKind:'department',referenceId:'department_search',name:'Department Search',purpose:'Read only department lookup',enabled:true};
session=false;assert.equal((await get()).status,401);assert.equal((await post(payload)).status,401);session=true;
for(role of ['user','employee','manager','admin']){
 const data=await(await get()).json();assert.ok(data.sources.some(s=>s.kind==='department'));assert.equal(data.sources.some(s=>s.id==='scan_reports'),role==='admin');assert.equal(data.sources.some(s=>s.id==='read-binding'),role==='admin');assert.ok(!data.sources.some(s=>s.id==='write-binding'||s.id==='write-api'));
 assert.equal((await post({...payload,name:role+' Department Search'})).status,200);assert.equal(rows.length,1);
}
assert.equal((await post(payload,'https://evil.invalid')).status,403);
assert.equal((await post({...payload,sourceKind:'tool',referenceId:'write-api'})).status,403);
assert.equal((await post({...payload,sourceKind:'sql',referenceId:'SELECT *'})).status,403);
role='user';assert.equal((await post({...payload,sharedRoles:['manager']})).status,403);
role='admin';assert.equal((await post({...payload,sharedRoles:['manager','employee','user']})).status,200);assert.deepEqual(rows[0].shared_roles,['manager','employee','user']);
assert.equal((await post({...payload,sourceKind:'builtin',referenceId:'scan_reports',sharedRoles:['user']})).status,403);
assert.equal((await post({...payload,sharedRoles:['admin']})).status,400);
actor='bob';assert.equal((await(await get()).json()).connections.length,0);await post({action:'remove',id:rows[0].id});assert.equal(rows.length,1);
actor='alice';await post({...payload,enabled:false});assert.equal(rows[0].enabled,false);
blocked=true;assert.equal((await post(payload)).status,403);blocked=false;
active=false;assert.equal((await get()).status,403);assert.equal((await post(payload)).status,403);active=true;
await post({action:'remove',id:rows[0].id});assert.equal(rows.length,0);
console.log('PASS: actual Playground tool settings handlers and store support all roles, owner isolation, CSRF, validation, source RBAC, write-tool denial, idempotent saves, disabling/disconnecting and organization policy.');
