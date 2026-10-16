import '../scripts/load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1}),client=await pool.connect();
const db={query:(sql,args)=>client.query(sql,args),connect:async()=>({query:(sql,args)=>client.query(sql==='BEGIN'?'SAVEPOINT manager_share':sql==='COMMIT'?'RELEASE SAVEPOINT manager_share':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT manager_share':sql,args),release(){}})};
const transport=load('lib/eassist/transport.ts'),catalog=load('lib/integrations/catalog.ts');
const workspaceAccess=async user=>(await client.query('SELECT * FROM workspace_members WHERE user_id=$1',[user])).rows[0];
const access=load('lib/integrations/access.ts',{'../db':{db},'../workspace-access':{workspaceAccess},'../eassist/transport':transport,'./catalog':catalog});
const registry=load('lib/integrations/registry.ts',{'../db':{db},'../eassist/transport':transport,'./catalog':catalog,'./access':access});
try{
 await client.query('BEGIN');
 // Keep other Admin grants from affecting the role-wide fixture assertions.
 await client.query('DELETE FROM integration_role_shares');
 const users={};
 for(const role of ['admin','manager','employee','user']){
  const id=randomUUID();users[role]=id;
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Manager sharing fixture',id+'@example.invalid']);
  await client.query('UPDATE workspace_members SET role=$2,active=true WHERE user_id=$1',[id,role]);
 }
 await access.saveIntegrationShare(users.admin,'*',['manager']);
 await access.saveIntegrationShare(users.admin,'dnr_mail',['manager']);
 assert.deepEqual((await registry.listProviders(users.manager)).map(p=>p.id),['dnr_mail']);
 assert.deepEqual(access.integrationShareOptions(await access.integrationAccess(users.manager),'dnr_mail'),['manager','employee','user']);
 await access.saveIntegrationShare(users.manager,'dnr_mail',['employee','user']);
 const grant=(await client.query('SELECT source_owner_id FROM integration_role_shares WHERE user_id=$1 AND provider=$2',[users.manager,'dnr_mail'])).rows[0];
 assert.equal(grant.source_owner_id,users.admin);
 for(const role of ['employee','user']){
  assert.deepEqual((await registry.listProviders(users[role])).map(p=>p.id),['dnr_mail']);
  await access.requireIntegrationAccess(users[role],'dnr_mail');
  await assert.rejects(()=>registry.archiveProvider(users[role],'dnr_mail'),e=>e.status===403);
 }
 await assert.rejects(()=>access.saveIntegrationShare(users.manager,'dnr_mail',['admin']),e=>e.status===400);
 await assert.rejects(()=>access.saveIntegrationShare(users.manager,'lambda',['user']),e=>e.status===403);
 await assert.rejects(()=>access.saveIntegrationShare(users.manager,'*',['user']),e=>e.status===403);
 await assert.rejects(()=>access.saveIntegrationShare(users.employee,'dnr_mail',['user']),e=>e.status===403);
 await access.requireIntegrationCreate(users.manager);
 const own=await registry.createProvider(users.manager,{name:'Manager owned shared fixture',auth:'none'});
 await access.saveIntegrationShare(users.manager,own.id,['admin','employee','user']);
 assert.ok(access.integrationShareOptions(await access.integrationAccess(users.manager),own.id).includes('admin'));
 for(const role of ['admin','employee','user'])assert.equal((await registry.resolveProvider(users[role],own.id)).name,own.name);
 await assert.rejects(()=>registry.archiveProvider(users.admin,own.id),e=>e.status===403);
 await client.query('UPDATE workspace_members SET active=false WHERE user_id=$1',[users.manager]);
 assert.equal(await registry.resolveProvider(users.user,'dnr_mail'),undefined);
 assert.equal(await registry.resolveProvider(users.admin,own.id),undefined);
 await client.query('UPDATE workspace_members SET active=true WHERE user_id=$1',[users.manager]);
 await access.saveIntegrationShare(users.admin,'dnr_mail',[]);
 assert.equal(await registry.resolveProvider(users.user,'dnr_mail'),undefined);
 assert.equal((await registry.resolveProvider(users.user,own.id)).id,own.id);
 const adminCustom=await registry.createProvider(users.admin,{name:'Admin shared fixture',auth:'none'});
 await access.saveIntegrationShare(users.admin,adminCustom.id,['manager']);
 await access.saveIntegrationShare(users.manager,adminCustom.id,['employee']);
 assert.equal((await registry.resolveProvider(users.employee,adminCustom.id)).id,adminCustom.id);
 await registry.archiveProvider(users.admin,adminCustom.id);
 assert.equal(await registry.resolveProvider(users.employee,adminCustom.id),undefined);
 await client.query("UPDATE workspace_members SET role='employee' WHERE user_id=$1",[users.manager]);
 assert.equal(await registry.resolveProvider(users.admin,own.id),undefined);
 console.log('PASS: Manager delegates Admin tools to Employee/User with provenance; cannot send them to Admin, broaden catalog access, delegate creation rights or delete shared cards. Own Manager tools reach Admins. Root revocation, deletion, inactive/demoted Manager revoke downstream access. All real database fixtures rolled back; no provider calls.');
}finally{await client.query('ROLLBACK');client.release();await pool.end();}
