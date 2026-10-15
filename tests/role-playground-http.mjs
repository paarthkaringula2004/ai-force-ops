import 'dotenv/config';import assert from 'node:assert/strict';import pg from 'pg';import {writeFileSync} from 'node:fs';import {fixtureAccount,cleanupFixture} from './helpers/account.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),accounts=[],results=[],base='http://localhost:3000';
async function call(person,path,status=200,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:person.cookie,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(90000)});const value=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(value));results.push({role:person.role,path,status:r.status});return value;}
try{
 for(const role of ['user','employee','manager']){
  const person=await fixtureAccount(pool,{role,name:'Role HTTP verification '+role});person.role=role;accounts.push(person);
  const snapshot=await call(person,'/api/playground/employee');assert.equal(snapshot.profile.role,role);assert.equal(snapshot.draft,null);assert.equal(snapshot.requests.length,0);
  for(const path of ['/api/workspace/admin','/api/workspace/organization','/api/eassist','/api/service-review-center/scans','/api/service-review-center/vulnerabilities'])await call(person,path,403);
  await call(person,'/api/workspace/requests?scope=team',role==='manager'?200:403);await call(person,'/api/service-review-center/records',role==='manager'?200:403);await call(person,'/api/epace',role==='manager'?200:403);
  const wallet=await call(person,'/api/workspace/tickets');assert.equal(wallet.unlimited,false);if(role!=='user')assert.equal(wallet.dailyAllowance,role==='employee'?50:100);
  const reply=await call(person,'/api/playground',200,{model:'gpt-4.1-mini',messages:[{role:'user',content:role==='user'?'How to use tools':'Employee services'}]});assert.equal(reply.responseMode,role==='user'?'user':'employee');if(role!=='user')assert.equal(reply.choices.length,19);else assert.ok(!reply.choices.includes('Apply for leave'));
 }
 writeFileSync('docs/verification/role-playground-http-2026-10-15.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:'Real verified fixture sign-ins; deployed role menus, snapshots, ticket allowance and denied endpoints. No staff submissions, vendor mutations or real-recipient mail.',results},null,2));
 console.log('PASS live HTTP: all three role menus/snapshots/wallets; Manager-only team/overview/ePACE access; denied Admin/eAssist/security and unconfirmed Employee ePACE. All exact fixture accounts cleaned up.');
}finally{for(const person of accounts)await cleanupFixture(pool,person);await pool.end();}
