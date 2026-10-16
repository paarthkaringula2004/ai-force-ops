import '../scripts/load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {load} from './helpers/load-ts.mjs';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
const client=await pool.connect();
const db={query:(sql,args)=>client.query(sql,args),connect:async()=>({query:(sql,args)=>/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)?Promise.resolve({rows:[],rowCount:0}):client.query(sql,args),release(){}})};
const transport=load('lib/eassist/transport.ts');
const catalog=load('lib/integrations/catalog.ts');
const workspaceAccess=async user=>(await client.query('SELECT * FROM workspace_members WHERE user_id=$1',[user])).rows[0];
const access=load('lib/integrations/access.ts',{'../db':{db},'../workspace-access':{workspaceAccess},'../eassist/transport':transport,'./catalog':catalog});
const registry=load('lib/integrations/registry.ts',{'../db':{db},'../eassist/transport':transport,'./catalog':catalog,'./access':access});
const store=load('lib/integrations/store.ts',{'../db':{db},'../eassist/transport':transport,'./registry':registry});
let calls=0;
const runtime=load('lib/integrations/runtime.ts',{'../db':{db},'./access':access,'../eassist/transport':transport,'../workspace-access':{workspaceAccess},'../eassist/security':{securityPolicy:async()=>({allow_runs:true,allow_writes:true,allow_deletes:false,max_concurrent:3})},'./registry':registry,'./store':store,'./transport':{external:async()=>{calls++;return {response:new Response(null,{status:200}),content:'{"items":[]}'}}}});
try {
 await client.query('BEGIN');
 const users={};
 for(const role of ['admin','manager','employee','user']){
  const id=randomUUID();users[role]=id;
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Sharing fixture',`${id}@example.invalid`]);
  await client.query('INSERT INTO workspace_members(user_id,role,active) VALUES($1,$2,true) ON CONFLICT(user_id) DO UPDATE SET role=$2,active=true',[id,role]);
 }
 // Other real Admin grants must not influence isolated role fixtures.
 await client.query('DELETE FROM integration_role_shares');
 for(const role of ['manager','employee','user']){
  assert.equal((await access.integrationAccess(users[role])).canCreate,false);
  assert.equal((await registry.listProviders(users[role])).length,0);
  await assert.rejects(()=>access.requireIntegrationCreate(users[role]),e=>e.status===403);
  await assert.rejects(()=>access.saveIntegrationShare(users[role],'*',['user']),e=>e.status===403);
 }
 await assert.rejects(()=>access.saveIntegrationShare(users.admin,'*',['admin']),e=>e.status===400);
 await assert.rejects(()=>access.saveIntegrationShare(users.admin,'unknown',['user']),e=>e.status===403);
 await access.saveIntegrationShare(users.admin,'servicenow',['manager']);
 assert.deepEqual((await registry.listProviders(users.manager)).map(p=>p.id),['servicenow']);
 await assert.rejects(()=>access.requireIntegrationAccess(users.employee,'servicenow'),e=>e.status===403);
 await assert.rejects(()=>access.requireIntegrationAccess(users.manager,'lambda'),e=>e.status===403);
 await store.saveConnection(users.admin,'servicenow',{enabled:true,config:{baseUrl:'https://admin-fixture.invalid',username:'admin',password:'admin-private-secret'}});
 assert.equal(await store.loadConnection(users.manager,'servicenow'),null);
 await store.saveConnection(users.manager,'servicenow',{enabled:true,config:{baseUrl:'https://manager-fixture.invalid',username:'manager',password:'manager-private-secret'}});
 assert.equal((await store.loadConnection(users.manager,'servicenow')).secrets.password,'manager-private-secret');
 assert.equal((await store.loadConnection(users.admin,'servicenow')).secrets.password,'admin-private-secret');
 assert.equal((await runtime.prepareIntegration(users.manager,'servicenow','incidents',{})).status,'completed');
 assert.equal(calls,1);
 const pending=await runtime.prepareIntegration(users.manager,'servicenow','create',{body:{short_description:'Fixture only'}});
 await access.saveIntegrationShare(users.admin,'servicenow',[]);
 await assert.rejects(()=>runtime.prepareIntegration(users.manager,'servicenow','incidents',{}),e=>e.status===403);
 await assert.rejects(()=>runtime.approveIntegration(users.manager,pending.token),e=>e.status===403);
 assert.equal(calls,1,'revoked approval must not contact provider');
 const custom=await registry.createProvider(users.admin,{name:'Shared fixture',description:'No credentials in definition',auth:'none'});
 await access.saveIntegrationShare(users.admin,custom.id,['employee']);
 assert.equal((await registry.resolveProvider(users.employee,custom.id)).name,'Shared fixture');
 assert.equal(await registry.resolveProvider(users.user,custom.id),undefined);
 await assert.rejects(()=>registry.archiveProvider(users.employee,custom.id),e=>e.status===403);
 await assert.rejects(()=>registry.archiveProvider(users.employee,custom.id,true),e=>e.status===403);
 await access.saveIntegrationShare(users.admin,'*',['manager','employee','user']);
 await access.saveIntegrationShare(users.admin,'dnr_mail',['manager']);
 for(const role of ['manager','employee','user']){
  await access.requireIntegrationCreate(users[role]);
  assert.ok(!(await registry.listProviders(users[role])).some(p=>p.id==='lambda'));
  await assert.rejects(()=>access.requireIntegrationAccess(users[role],'lambda'),e=>e.status===403);
 }
 assert.deepEqual((await registry.listProviders(users.manager)).map(p=>p.id),['dnr_mail']);
 await assert.rejects(()=>registry.archiveProvider(users.manager,'dnr_mail'),e=>e.status===403);
 const own=await registry.createProvider(users.manager,{name:'Manager own fixture',auth:'none'});
 await registry.archiveProvider(users.manager,own.id);
 assert.equal(await registry.resolveProvider(users.manager,own.id),undefined);
 await registry.archiveProvider(users.manager,own.id,true);
 assert.equal((await registry.resolveProvider(users.manager,own.id)).name,'Manager own fixture');
 assert.equal((await registry.resolveProvider(users.admin,custom.id)).name,'Shared fixture');
 await client.query('UPDATE workspace_members SET active=false WHERE user_id=$1',[users.admin]);
 assert.equal((await access.integrationAccess(users.user)).canCreate,false);
 assert.equal(await registry.resolveProvider(users.employee,custom.id),undefined);
 await client.query('UPDATE workspace_members SET active=false WHERE user_id=$1',[users.manager]);
 await assert.rejects(()=>access.requireIntegrationAccess(users.manager),e=>e.status===403);
 console.log('PASS: real PostgreSQL role grants, Admin-only sharing, creation permission without catalog access, recipient deletion denial, own integration deletion/restore, shared custom definitions, private credentials, delegated reads, immediate revocation including pending writes, inactive Admin and recipient denial. All fixtures rolled back; provider mocked.');
}finally{await client.query('ROLLBACK');client.release();await pool.end();}
