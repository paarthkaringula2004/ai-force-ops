import '../scripts/load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
const db={query:(...args)=>c.query(...args),connect:async()=>({query:(sql,args)=>c.query(sql==='BEGIN'?'SAVEPOINT topup_test':sql==='COMMIT'?'RELEASE SAVEPOINT topup_test':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT topup_test':sql,args),release(){}})};
const deps={'./db':{db},'@/lib/db':{db},'./workspace-access':{workspaceAccess:async id=>(await c.query('SELECT * FROM workspace_members WHERE user_id=$1',[id])).rows[0]},'./leave-conversation':{leaveConversation:async()=>null},'./organization-security':{organizationWriteAllowed:async()=>{}},'./mail-events':{queueLeaveEvent:async()=>{}},'./conversation-ai':{conversationResponse:async()=>{throw Error('Ticket top-up must not reach the model');}}};
const employee=load('lib/employee-playground.ts',deps),ai=load('lib/employee-service-ai.ts',deps),decisions=load('lib/workspace-decisions.ts',deps);
const sentence='I want to request Tickets topup from Admin';
try{
 await c.query('BEGIN');const ids={};
 for(const role of ['employee','manager','admin']){
  const id=ids[role]=randomUUID();await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Topup fixture',id+'@example.invalid']);await c.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[id,role]);
 }
 await c.query('UPDATE workspace_members SET manager_id=$2 WHERE user_id=$1',[ids.employee,ids.manager]);
 assert.equal(employee.employeeProtocolInput(sentence),true);
 for(const role of ['employee','manager']){
  const user=ids[role],member=await deps['./workspace-access'].workspaceAccess(user),ask=input=>employee.employeeReply(user,'Fixture',input,member);
  const room={id:randomUUID(),kind:'room',fields:{location:'Office',dates:'20 October 2026, 2–3pm IST'}};
  await c.query('INSERT INTO employee_playground_drafts(user_id,draft) VALUES($1,$2)',[user,JSON.stringify(room)]);
  const stale=await ai.employeeServiceAiReply(user,'Fixture',member,'',[{role:'user',content:sentence}]);
  assert.match(stale.reply,/Ticket top-ups.*Admin/);assert.doesNotMatch(stale.reply,/How many people|attend/i);
  assert.deepEqual((await c.query('SELECT draft FROM employee_playground_drafts WHERE user_id=$1',[user])).rows[0].draft,room,'new topic must not corrupt saved room answers');
  await ask('Cancel request');
  const opening=await ai.employeeServiceAiReply(user,'Fixture',member,'',[{role:'user',content:sentence}]);assert.match(opening.reply,/How many tickets/);assert.doesNotMatch(opening.reply,/attend/i);
  for(const invalid of ['0','-1','1.5','1000001'])assert.match((await ask(invalid)).reply,/whole number.*tickets/i);
  await ask('250 tickets');const review=await ask('Need to finish project work');assert.match(review.reply,/Review your ticket top-up/);assert.match(review.reply,/250/);
  assert.equal((await c.query('SELECT 1 FROM employee_service_requests WHERE user_id=$1',[user])).rowCount,0,'review alone must not submit');
  const before=await c.query('SELECT balance FROM ticket_wallets WHERE user_id=$1',[user]);
  const submitted=await ask('Submit request');assert.match(submitted.reply,/submitted to Admin/);assert.match(submitted.reply,/No tickets have been added/);
  await ask('Submit request');const rows=(await c.query('SELECT * FROM employee_service_requests WHERE user_id=$1',[user])).rows;assert.equal(rows.length,1);assert.equal(rows[0].kind,'ticket_topup');assert.equal(rows[0].details.tickets,'250');
  assert.deepEqual((await c.query('SELECT balance FROM ticket_wallets WHERE user_id=$1',[user])).rows,before.rows);
  if(role==='employee')await assert.rejects(()=>decisions.decideRequestInTransaction(c,ids.manager,{id:rows[0].id,action:'approve',note:''}),e=>e.status===403);
  const approved=await decisions.decideRequestInTransaction(c,ids.admin,{id:rows[0].id,action:'approve',note:'Reviewed'});assert.equal(approved.status,'approved');assert.deepEqual((await c.query('SELECT balance FROM ticket_wallets WHERE user_id=$1',[user])).rows,before.rows,'approval is not an allocation');
 }
 const member=await deps['./workspace-access'].workspaceAccess(ids.employee);
 await employee.employeeReply(ids.employee,'Fixture','Book a meeting room',member);await employee.employeeReply(ids.employee,'Fixture','Office',member);await employee.employeeReply(ids.employee,'Fixture','20 October 2026 2–3pm IST',member);
 assert.match((await employee.employeeReply(ids.employee,'Fixture','2 people',member)).reply,/meeting title/i,'real room attendee collection still works');
 console.log('PASS: exact top-up wording for Manager and Employee bypasses model; stale room preserved, count validated, review/confirmation, Admin-only approval, no implicit allocation, replay safety and normal room flow. Rollback fixtures, no provider or email calls.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
