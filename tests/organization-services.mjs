import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
const base=process.env.WORKSPACE_TEST_URL||'http://localhost:3000', users=[];
async function call(cookie,path,body,method=body?'POST':'GET',status=200,origin=base){
 const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;
}
async function account(){const r=await fetch(base+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'Employee workflow test',email:`employee-${randomUUID()}@example.invalid`,password:randomUUID()+'Aa1!'})});assert.equal(r.status,200);const user=(await r.json()).user.id;users.push(user);return {user,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
const ask=(cookie,text)=>call(cookie,'/api/playground',{model:'',messages:[{role:'user',content:text}]});
try {
 const a=await account();
 const catalog=await ask(a.cookie,'Employee services');assert.ok(catalog.choices.includes('Resignation request'));assert.ok(catalog.choices.includes('Refer a candidate'));assert.ok(catalog.choices.includes('Claim expenses'));
 await ask(a.cookie,'Resignation request');await ask(a.cookie,'30 November 2026');await ask(a.cookie,'Personal reasons');
 await ask(a.cookie,'Request business travel');assert.match((await call(a.cookie,'/api/playground/employee')).draft.kind,/resignation/);
 const ready=await ask(a.cookie,'Complete documentation and hand over open tasks');assert.deepEqual(ready.choices,['Submit request','Edit request','Cancel request']);
 assert.match((await ask(a.cookie,'Submit request')).reply,/Pending approval/);
 assert.match((await ask(a.cookie,'I want to refer')).reply,/opening or job ID/);await ask(a.cookie,'Engineering opening ENG-42');await ask(a.cookie,'Test candidate with five years of engineering experience');
 const no=await ask(a.cookie,'No, I will obtain consent first');assert.match(no.reply,/nothing has been submitted/);
 assert.match((await ask(a.cookie,'Submit request')).reply,/no completed draft/);
 await ask(a.cookie,'Yes, candidate consent obtained');await ask(a.cookie,'Submit request');
 await ask(a.cookie,'Claim expenses');await ask(a.cookie,'Business travel');await ask(a.cookie,'INR 2500, 6 October 2026');await ask(a.cookie,'Client meeting; receipts available');await ask(a.cookie,'Submit request');
 const queue=await call(a.cookie,'/api/workspace/requests?scope=own');assert.deepEqual(new Set(queue.requests.map(r=>r.kind)),new Set(['resignation','referral','expense']));assert.ok(queue.requests.every(r=>r.status==='pending_approval'));
 assert.equal((await db.query("SELECT count(*)::int AS count FROM workspace_audit WHERE actor_id=$1 AND action='request.submitted'",[a.user])).rows[0].count,3);
 console.log('PASS: organizational services catalog, resignation review, topic switching, referral consent gate, expense submission, persisted pending approvals and submission audit.');
} finally {await db.query('DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])',[users]);for(const user of users)await db.query('DELETE FROM "user" WHERE id=$1',[user]);await db.end();}
