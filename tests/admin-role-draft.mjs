import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
const client={query:(sql,args)=>/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)?Promise.resolve({rows:[]}):c.query(sql,args),release(){}};
const permissions=load('lib/workspace-permissions.ts');
class MemberUpdateError extends Error{}
const {workspaceChatReply:reply}=load('lib/workspace-chat.ts',{'./db':{db:{connect:async()=>client}},'./workspace-access':{},'./workspace-permissions':permissions,'./employee-services':{employeeHome:[],additionalKind:()=>false},'./workspace-members':{MemberUpdateError,updateMemberInTransaction:async()=>{throw new Error('Preparing a draft must not execute a role change');}}});
try{
 await c.query('BEGIN');const adminId=randomUUID(),targetId=randomUUID(),email=targetId+'@example.invalid';
 for(const [id,name,address] of [[adminId,'Router fixture',adminId+'@example.invalid'],[targetId,'Target fixture',email]])await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,name,address]);
 await c.query("UPDATE workspace_members SET role='admin' WHERE user_id=$1",[adminId]);
 const admin={user_id:adminId,role:'admin',active:true,permissions:[]};
 const department=(await c.query('SELECT name FROM staff_departments ORDER BY code LIMIT 1')).rows[0].name;
 let preview=await reply(adminId,'Assign role '+email+' manager',admin,{department});
 assert.match(preview.reply,/highest completed qualification/);
 preview=await reply(adminId,'B',admin);
 assert.match(preview.reply,/Review role change/);assert.ok(preview.reply.includes(department));assert.match(preview.choices[0],/^Confirm role change /);
 const target=(await c.query('SELECT role,department FROM workspace_members WHERE user_id=$1',[targetId])).rows[0];assert.equal(target.role,'user');assert.notEqual(target.department,'Security');
 const draft=(await c.query('SELECT draft FROM workspace_chat_actions WHERE user_id=$1',[adminId])).rows[0].draft;
 assert.equal(draft.update.department,department);assert.equal(draft.update.role,'manager');
 assert.match((await reply(adminId,'Assign role '+email+' manager',{...admin,role:'employee'},{department:'Security'})).reply,/Only an active Admin/);
 assert.match((await reply(adminId,'Assign role '+email+' employee',admin,{department:'bad\nvalue'})).reply,/Which department/);
 assert.match((await reply(adminId,'Cancel role change',admin)).reply,/cancelled/);
 assert.equal((await c.query('SELECT 1 FROM workspace_chat_actions WHERE user_id=$1',[adminId])).rowCount,0);
 console.log('PASS: sourced department and role seed a real saved preview; no account mutation, invalid department asks a question, permissions and cancellation remain enforced. All fixtures roll back.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
