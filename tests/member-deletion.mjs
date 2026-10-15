import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
import {load} from './helpers/load-ts.mjs';
const permissions=load('lib/workspace-permissions.ts');
const members=load('lib/workspace-members.ts',{'./workspace-permissions':permissions,'./staff-departments':load('lib/staff-departments.ts')});
const {deleteMemberInTransaction}=load('lib/workspace-member-deletion.ts',{'./workspace-permissions':permissions,'./workspace-members':members});
const db=new pg.Pool({connectionString:process.env.DATABASE_URL}),client=await db.connect();
async function fixture(role){const id=randomUUID(),email=`delete-fixture-${id}@example.invalid`;await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Disposable deletion fixture',email]);await client.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[id,role]);const row=(await client.query('SELECT updated_at FROM workspace_members WHERE user_id=$1',[id])).rows[0];return {userId:id,confirmation:email,updatedAt:new Date(row.updated_at).toISOString()};}
try{
 await client.query('BEGIN');const actor=await fixture('admin'),user=await fixture('user');
 await assert.rejects(deleteMemberInTransaction(client,user.userId,actor),/Admin access/);
 await assert.rejects(deleteMemberInTransaction(client,actor.userId,actor),/own account/);
 await assert.rejects(deleteMemberInTransaction(client,actor.userId,{...user,confirmation:'wrong@example.invalid'}),/exact account email/);
 await assert.rejects(deleteMemberInTransaction(client,actor.userId,{...user,updatedAt:'2000-01-01T00:00:00.000Z'}),/account changed/);
 for(const role of ['user','employee','manager','admin']){
  const target=role==='user'?user:await fixture(role),agent=randomUUID();
  await client.query('INSERT INTO agents(id,user_id,name) VALUES($1,$2,$3)',[agent,target.userId,'Disposable fixture agent']);
  await client.query('INSERT INTO agent_workflows(user_id,agent_id) VALUES($1,$2)',[target.userId,agent]);
  await client.query('INSERT INTO "session"(id,"userId",token,"expiresAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now())',[randomUUID(),target.userId,randomUUID()]);
  await client.query("INSERT INTO mail_outbox(id,dedupe_key,kind,recipient,subject,actor_id,status) VALUES($1,$2,'test',$3,'Disposable test',$4,'draft')",[randomUUID(),randomUUID(),target.confirmation,target.userId]);
  await client.query('INSERT INTO verification(id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',[randomUUID(),'email-verification-otp-'+target.confirmation,'fixture']);
  await client.query('INSERT INTO verification(id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',[randomUUID(),'reset-password:'+randomUUID(),target.userId]);
  const dependent=role==='manager'?await fixture('employee'):null;if(dependent)await client.query('UPDATE workspace_members SET manager_id=$2 WHERE user_id=$1',[dependent.userId,target.userId]);
  assert.equal((await deleteMemberInTransaction(client,actor.userId,target)).deleted,true);
  for(const table of ['agents','agent_workflows','workspace_members','ticket_wallets','platform_events'])assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`,[target.userId])).rows[0].n,0);
  assert.equal((await client.query('SELECT 1 FROM "session" WHERE "userId"=$1',[target.userId])).rowCount,0);
  assert.equal((await client.query('SELECT 1 FROM mail_outbox WHERE recipient=$1',[target.confirmation])).rowCount,0);
  assert.equal((await client.query('SELECT 1 FROM verification WHERE identifier=$1',['email-verification-otp-'+target.confirmation])).rowCount,0);
  assert.equal((await client.query('SELECT 1 FROM verification WHERE value=$1',[target.userId])).rowCount,0);
  if(dependent){assert.equal((await client.query('SELECT manager_id FROM workspace_members WHERE user_id=$1',[dependent.userId])).rows[0].manager_id,null);assert.equal((await client.query('SELECT 1 FROM "user" WHERE id=$1',[dependent.userId])).rowCount,1);}
 }
 console.log('PASS: Admin-only deletion, self-delete protection, exact-email/version confirmation, all four roles, session/data cascade, mail/code removal and other employees preserved. All fixtures roll back.');
}finally{await client.query('ROLLBACK');client.release();await db.end();}

// The user explicitly requested removal of this precise, existing test account.
if(process.argv.includes('--remove-requested-fixture')){
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
 try{await c.query('BEGIN');const target=(await c.query('SELECT u.id,u.email,m.updated_at FROM "user" u JOIN workspace_members m ON m.user_id=u.id WHERE u.email=$1 AND u.name=$2',['admin-identity-7a607641-2c55-4bd1-b6f6-487239b1abe2@example.invalid','Identity Admin'])).rows[0];
 if(target){const actor=(await c.query('SELECT u.id FROM "user" u JOIN workspace_members m ON m.user_id=u.id WHERE u.email=$1 AND m.role=\'admin\' AND m.active',['paarthkaringula@gmail.com'])).rows[0];assert.ok(actor);await deleteMemberInTransaction(c,actor.id,{userId:target.id,confirmation:target.email,updatedAt:new Date(target.updated_at).toISOString()});await c.query('COMMIT');console.log('Requested Identity Admin test account permanently removed.');}else{await c.query('ROLLBACK');console.log('Requested Identity Admin test account is already absent.');}
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await pool.end();}
}
