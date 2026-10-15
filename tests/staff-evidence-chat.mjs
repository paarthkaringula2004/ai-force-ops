import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1}),client=await pool.connect();
const policy=load('lib/leave-policy.ts'),services=load('lib/employee-services.ts'),display=load('lib/leave-display.ts');
const deps={'./db':{db:client},'./leave-policy':policy,'./employee-services':services};
const leaves=load('lib/team-leave-chat.ts',deps);
const staff=load('lib/staff-evidence-chat.ts',{...deps,'./team-leave-chat':leaves,'./leave-display':display});
assert.equal(staff.staffEvidenceIntent('Create a new tool'),null);
assert.equal(staff.staffEvidenceIntent('Approve REQ-123'),null);
assert.equal(staff.staffEvidenceIntent('What did Sample upload to ePACE?'),'epace');
assert.equal(staff.staffEvidenceIntent('show team usage'),'usage');
assert.equal(leaves.leaveLookupIntent('why is Tharak Karingula not coming tomorrow?').start,policy.parseLeavePeriod('tomorrow').start);
try{
 await client.query('BEGIN');
 const admin=randomUUID(),manager=randomUUID(),employee=randomUUID(),foreign=randomUUID();
 const names={admin:'Evidence Admin '+admin.slice(0,5),manager:'Evidence Manager '+manager.slice(0,5),employee:'Evidence Employee '+employee.slice(0,5),foreign:'Restricted Employee '+foreign.slice(0,5)};
 for(const [id,role,name] of [[admin,'admin',names.admin],[manager,'manager',names.manager],[employee,'employee',names.employee],[foreign,'employee',names.foreign]]){
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,name,id+'@example.invalid']);
  await client.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[id,role]);
 }
 await client.query("UPDATE workspace_members SET manager_id=$2,department='Evidence QA',employee_id=$3 WHERE user_id=$1",[employee,manager,'TEST-'+employee.slice(0,8)]);
 const tomorrow=policy.parseLeavePeriod('tomorrow'),date=policy.leaveDates(tomorrow);
 const request=randomUUID(),requestNumber='REQ-'+request.slice(0,8).toUpperCase();
 await client.query("INSERT INTO employee_service_requests(id,user_id,request_number,kind,status,details) VALUES($1,$2,$3,'leave','approved',$4::jsonb)",[request,employee,requestNumber,JSON.stringify({type:'Annual leave',dates:date,leaveStart:tomorrow.start,leaveEnd:tomorrow.end,paidDays:'1',unpaidDays:'0',reason:'Personal leave'})]);
 for(const kind of Object.keys(services.employeeServiceLabels).filter(kind=>kind!=='leave')){const id=randomUUID();await client.query("INSERT INTO employee_service_requests(id,user_id,request_number,kind,status,details) VALUES($1,$2,$3,$4,'pending_approval',$5::jsonb)",[id,employee,'REQ-'+id.slice(0,8),kind,JSON.stringify({request:'Evidence fixture '+kind})]);}
 const hidden=randomUUID();await client.query("INSERT INTO employee_service_requests(id,user_id,request_number,kind,status,details) VALUES($1,$2,$3,'leave','approved',$4::jsonb)",[hidden,foreign,'REQ-'+hidden.slice(0,8),JSON.stringify({dates:date,leaveStart:tomorrow.start,leaveEnd:tomorrow.end,reason:'FOREIGN_SECRET_REASON'})]);
 let reply=await staff.staffEvidenceChatReply(manager,`why is ${names.employee} not coming tomorrow?`);
 assert.match(reply.reply,/has approved leave recorded/);assert.match(reply.reply,new RegExp(requestNumber));assert.match(reply.reply,new RegExp(tomorrow.start));assert.doesNotMatch(reply.reply,/FOREIGN_SECRET/);
 reply=await staff.staffEvidenceChatReply(manager,`why is ${names.foreign} not coming tomorrow?`);assert.doesNotMatch(reply.reply,/FOREIGN_SECRET|has approved leave/);
 reply=await staff.staffEvidenceChatReply(admin,`why is ${names.foreign} not coming tomorrow?`);assert.match(reply.reply,/has approved leave/);
 reply=await staff.staffEvidenceChatReply(employee,`why is ${names.employee} not coming tomorrow?`);assert.match(reply.reply,/authorized Managers and Admins/);
 reply=await staff.staffEvidenceChatReply(manager,`show ${names.employee}'s requests`);
 for(const label of Object.values(services.employeeServiceLabels))assert.ok(reply.reply.includes(label),label+' missing');
 reply=await staff.staffEvidenceChatReply(manager,'whats the the reason?',[{role:'user',content:`why is ${names.employee} not coming tomorrow?`},{role:'assistant',content:`Approved leave ${requestNumber}`}]);
 assert.match(reply.reply,/Personal leave/);assert.match(reply.reply,new RegExp(requestNumber));assert.doesNotMatch(reply.reply,/Evidence fixture equipment/);
 reply=await staff.staffEvidenceChatReply(manager,`show ${names.employee}'s profile`);assert.match(reply.reply,/Evidence QA/);assert.match(reply.reply,/Reporting manager/);
 await client.query("INSERT INTO tools(id,user_id,name,endpoint_url) VALUES($1,$2,'Evidence Tool','https://example.invalid/?key=ENDPOINT_SECRET')",[randomUUID(),employee]);
 await client.query("INSERT INTO usage_events(id,user_id,source,model_id,input_tokens,output_tokens,total_tokens) VALUES($1,$2,'test','test-model',10,5,15)",[randomUUID(),employee]);
 const room=randomUUID();await client.query("INSERT INTO meeting_rooms(id,name,location,capacity,created_by) VALUES($1,$2,'Test office',5,$3)",[room,'Evidence room '+room.slice(0,6),employee]);
 await client.query("INSERT INTO meeting_room_bookings(id,room_id,user_id,title,attendees,starts_at,ends_at) VALUES($1,$2,$3,'Evidence Meeting',1,now()+interval '1 day',now()+interval '1 day 1 hour')",[randomUUID(),room,employee]);
 await client.query("INSERT INTO agents(id,user_id,name) VALUES($1,$2,'Evidence Agent')",[randomUUID(),employee]);
 const project=randomUUID();await client.query("INSERT INTO epace_projects(id,user_id,name) VALUES($1,$2,'Evidence Project')",[project,employee]);
 await client.query("INSERT INTO epace_records(id,user_id,project_id,kind,data) VALUES($1,$2,$3,'document',$4::jsonb)",[randomUUID(),employee,project,JSON.stringify({name:'Evidence Handbook.txt',size:100,chunks:1,content:'DOCUMENT_SECRET_CONTENT'})]);
 await client.query("INSERT INTO epace_audit(id,user_id,project_id,action) VALUES($1,$2,$3,'document.uploaded')",[randomUUID(),employee,project]);
 await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,request_id,action,details) VALUES($1,$2,$2,$3,'leave.auto_approved',$4::jsonb)",[randomUUID(),employee,request,JSON.stringify({secret:'AUDIT_SECRET'})]);
 for(const [question,pattern] of [['tools',/Evidence Tool/],['usage',/15 tokens/],['meetings',/Evidence Meeting/],['agents',/Evidence Agent/],['ePACE uploads',/Evidence Handbook\.txt/],['activity',/Leave automatically approved/]]){
  const result=await staff.staffEvidenceChatReply(manager,`show ${names.employee}'s ${question}`);assert.match(result.reply,pattern);assert.doesNotMatch(result.reply,/ENDPOINT_SECRET|DOCUMENT_SECRET_CONTENT|AUDIT_SECRET/);
 }
 reply=await staff.staffEvidenceChatReply(manager,'what data has he uploaded to ePACE?',[{role:'user',content:`show ${names.employee}'s profile`}]);assert.match(reply.reply,/Evidence Handbook/);
 await client.query('UPDATE workspace_members SET manager_id=NULL WHERE user_id=$1',[employee]);
 reply=await staff.staffEvidenceChatReply(manager,`show ${names.employee}'s tools`);assert.doesNotMatch(reply.reply,/Evidence Tool/);
 await client.query("UPDATE workspace_members SET role='employee' WHERE user_id=$1",[manager]);
 assert.equal(await staff.staffEvidenceChatReply(manager,'show all employee requests'),null);
 console.log('PASS: all employee service types, leave dates/status, profile, meetings, tools, usage, agents, ePACE upload/activity metadata, pronoun context, Admin/Manager scopes, reassignment, role revocation and secret exclusion. All fixtures rolled back.');
}finally{await client.query('ROLLBACK');client.release();await pool.end();}
