import '../scripts/load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000,statement_timeout:15000}),c=await pool.connect();
const permissions=load('lib/workspace-permissions.ts'),catalog=load('lib/staff-catalog.ts',{'./workspace-permissions':permissions});
// Keep all workflow commits inside this test's outer rollback transaction.
const client={query:(sql,args)=>/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)?Promise.resolve({rows:[]}):c.query(sql,args),release(){}};
const {workspaceCatalogChatReply:reply}=load('lib/workspace-catalog-chat.ts',{'./db':{db:{connect:async()=>client}},'./workspace-permissions':permissions,'./staff-catalog':catalog,'./department-name':load('lib/department-name.ts'),'./organization-security':{organizationWriteAllowed:async()=>{}}});
const {readDepartmentLookup}=load('lib/department-lookup.ts',{'./db':{db:client}});
try{
 await c.query('BEGIN');const id=randomUUID();
 await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Catalog chat test',id+'@example.invalid']);
 await c.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1",[id]);
 const admin={user_id:id,role:'admin',active:true,permissions:[]},employee={...admin,role:'employee'};
 const name='Chat fixture '+randomUUID();
 assert.match((await reply(id,'Create department '+name,employee)).reply,/Only an active Admin/);
 const start=await reply(id,'Create department',admin);assert.match(start.reply,/exact name/);
 const preview=await reply(id,name,admin);assert.match(preview.reply,/Review new department/);assert.match(preview.choices[0],/^Confirm department creation /);
 assert.equal((await c.query('SELECT 1 FROM staff_departments WHERE name=$1',[name])).rowCount,0);
 // The supplied transcript: cancellation, inline name, short and quoted follow-ups.
 await reply(id,'Cancel department creation',admin);
 const inline=await reply(id,'As of now Create Department - Seniour Software Developer',admin);assert.match(inline.reply,/Department name:\*\* Seniour Software Developer/);
 await reply(id,'Cancel department creation',admin);
 await reply(id,'Create department',admin);
 const short=await reply(id,'SDE',admin);assert.match(short.reply,/Department name:\*\* SDE/);assert.ok(short.choices[0].startsWith('Confirm department creation '));
 const retained=await reply(id,'Create department',admin);assert.match(retained.reply,/Department name:\*\* SDE/);assert.equal(retained.choices[0],short.choices[0]);
 await reply(id,'Cancel department creation',admin);await reply(id,'Create department',admin);
 const quoted=await reply(id,'"SDE" --> is the new Dept',admin);assert.match(quoted.reply,/Department name:\*\* SDE/);assert.doesNotMatch(quoted.reply,/--> is/);
 assert.equal((await c.query("SELECT 1 FROM staff_departments WHERE name IN ('SDE','Seniour Software Developer')")).rowCount,0);
 await reply(id,'Cancel department creation',admin);await reply(id,'Create department '+name,admin);
 const created=await reply(id,'conform',admin);assert.match(created.reply,/created successfully/);assert.match(created.reply,/Department ID/);
 assert.equal((await c.query('SELECT 1 FROM staff_departments WHERE name=$1',[name])).rowCount,1);
 for(const role of ['user','employee','manager','admin']){
  const found=await readDepartmentLookup({...admin,role},name);assert.match(found.reply,/Yes,/);assert.ok(found.reply.includes(name));
  assert.match((await readDepartmentLookup({...admin,role},'Missing '+randomUUID())).reply,/was found/);
  assert.ok((await readDepartmentLookup({...admin,role})).reply.includes(name));
 }
 assert.match((await reply(id,preview.choices[0],admin)).reply,/expired or was replaced/);
 assert.match((await reply(id,'Create department '+name,admin)).reply,/already exists/);
 const second=await reply(id,'Create department Another '+randomUUID(),admin);
 assert.match((await reply(id,'Cancel department creation',admin)).reply,/cancelled/);
 assert.match((await reply(id,second.choices[0],admin)).reply,/expired or was replaced/);
 const expired=await reply(id,'Create department Expired '+randomUUID(),admin);
 await c.query("UPDATE workspace_chat_actions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",[id]);
 assert.match((await reply(id,expired.choices[0],admin)).reply,/expired or was replaced/);
 assert.equal((await c.query("SELECT 1 FROM workspace_audit WHERE actor_id=$1 AND action='catalog.created'",[id])).rowCount,1);
 const exact=await reply(id,'Create another Department - Analyst Security',admin);
 assert.ok(exact.choices.some(choice=>/^(Confirm department creation |Create department$)/.test(choice)));
 if(exact.reply.includes('Review new department')){
  assert.match(exact.reply,/Department name:\*\* Analyst Security/);
  assert.doesNotMatch(exact.reply,/created successfully/);
  await reply(id,'Cancel department creation',admin);
 }else assert.match(exact.reply,/already exists/);
 const unsupported=await reply(id,'Please establish a department for our analysts',admin);
 assert.match(unsupported.reply,/No department was changed/);assert.deepEqual(unsupported.choices,['Create department']);
 console.log('PASS: Admin-only department chat, guided name and preview, no creation before confirmation, conform spelling, actual catalog creation, audit, duplicate/replay/cancel/expiry protection. Fixtures rolled back.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
