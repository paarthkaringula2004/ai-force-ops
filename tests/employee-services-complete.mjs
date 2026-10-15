import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
const base=process.env.WORKSPACE_TEST_URL||'http://localhost:3000',users=[];
async function call(cookie,path,body,method=body?'POST':'GET',status=200){
 const response=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
}
async function account(){const response=await fetch(base+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'Service completion test',email:`services-${randomUUID()}@example.invalid`,password:randomUUID()+'Aa1!'})});assert.equal(response.status,200);const user=(await response.json()).user.id;users.push(user);return {user,cookie:response.headers.getSetCookie().map(cookie=>cookie.split(';')[0]).join('; ')};}
const ask=(cookie,text)=>call(cookie,'/api/playground',{model:'',messages:[{role:'user',content:text}]});
const flows=[
 ['onboarding','Start onboarding','Engineering','2 November 2026, Hyderabad','Laptop'],
 ['leave','Apply for leave','Annual leave','12 November 2026, full day','Personal leave'],
 ['equipment','Request a laptop','New allocation','32GB RAM, 1TB SSD','Laptop bag','Development work'],
 ['room','Book a meeting room','Hyderabad','12 November 2026, 2pm-3pm IST','4 people','Sprint planning','Video conferencing'],
 ['access','Request access','Engineering team area','Project delivery for six months'],
 ['support','IT support','Windows','Settings shows incorrect memory'],
 ['resignation','Resignation request','30 November 2026','Personal reasons','Hand over documentation and open tasks'],
 ['referral','Refer a candidate','Engineering opening ENG-42','Test candidate with five years of engineering experience','Yes, candidate consent obtained'],
 ['expense','Claim expenses','Business travel','INR 2500, 6 October 2026','Client meeting; receipts available'],
 ['travel','Request business travel','Bengaluru','12-14 November 2026','Client workshop, INR 10000'],
 ['attendance','Correct attendance','6 October 2026','9am-6pm IST','Clock entry was missing'],
 ['payroll','Payroll query','September 2026','An allowance is missing from the payslip'],
 ['benefits','Benefits request','Transport allowance','Please explain enrollment steps'],
 ['transfer','Request a transfer','Platform engineering in Hyderabad','1 December 2026','Support the new platform project'],
 ['training','Request training','Cloud certification','Internal / no cost, November 2026','Supports platform development'],
 ['document','Request an HR document','Employment verification','Visa application by 20 November 2026'],
 ['workplace','Raise a workplace concern','Office lighting','Please arrange a facilities review'],
 ['flexible','Request flexible work','Flexible hours','November 2026, 10am-7pm IST','Team coverage agreed for core hours'],
 ['other','Other employee service','Parking allocation','A parking space for November 2026'],
];
try {
 const owner=await account(),other=await account();
 const profile=(await call(owner.cookie,'/api/playground/employee')).profile;
 assert.equal(profile.name,'Service completion test');assert.equal(profile.role,'employee');assert.equal(profile.employeeId,'');
 assert.equal((await ask(owner.cookie,'Employee services')).choices.length,19);
 for(const [kind,...answers] of flows){
  for(const answer of answers)await ask(owner.cookie,answer);
  const snapshot=await call(owner.cookie,'/api/playground/employee');assert.equal(snapshot.draft.kind,kind,JSON.stringify(snapshot));assert.equal(snapshot.draft.completed,snapshot.draft.total);assert.deepEqual(snapshot.choices,['Submit request','Edit request','Cancel request']);
  if(kind==='leave'){
   const edit=await ask(owner.cookie,'Edit request');assert.ok(edit.choices.includes('Edit Dates'));
   await ask(owner.cookie,'Edit Dates');assert.match((await ask(owner.cookie,'Submit request')).reply,/no completed draft/);
   await ask(owner.cookie,'14 November 2026, half day');assert.equal((await call(owner.cookie,'/api/playground/employee')).draft.fields.dates,'14 November 2026, half day');
  }
  const submitted=await ask(owner.cookie,'Submit request');assert.match(submitted.reply,/Pending approval/);
 }
 const queue=await call(owner.cookie,'/api/workspace/requests?scope=own');assert.equal(queue.requests.length,19);assert.equal(new Set(queue.requests.map(item=>item.kind)).size,19);
 const leave=queue.requests.find(item=>item.kind==='leave');
 assert.match((await ask(owner.cookie,leave.request_number)).reply,/14 November 2026/);
 assert.match((await ask(other.cookie,leave.request_number)).reply,/couldn't find/);
 await call(owner.cookie,'/api/workspace/requests',{id:leave.id,action:'cancel',note:''},'PATCH');
 assert.match((await ask(owner.cookie,leave.request_number)).reply,/Cancelled/);
 assert.match((await ask(owner.cookie,'My requests')).reply,/Pending approval/);
 assert.equal((await call(other.cookie,'/api/workspace/requests?scope=own')).requests.length,0);
 console.log('PASS: all 19 employee services, profile, complete drafts, field editing, submission, request detail lookup, owner isolation and cancellation tracking.');
}finally{
 await db.query('DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])',[users]);
 for(const user of users)await db.query('DELETE FROM "user" WHERE id=$1',[user]);await db.end();
}
