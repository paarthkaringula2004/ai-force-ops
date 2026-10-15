import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL}),base='http://localhost:3000',headers={Origin:base,'Content-Type':'application/json'};
const email=`verify-timing-${randomUUID()}@example.invalid`,password=randomUUID()+'Aa1!';let id;
async function post(path,body){return fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});}
try{
 const signup=await post('/api/auth/sign-up/email',{name:'Verification timing fixture',email,password});assert.equal(signup.status,200);const created=await signup.json();id=created.user.id;assert.equal(created.token,null);assert.equal(created.user.emailVerified,false);
 const login=await post('/api/auth/sign-in/email',{email,password});assert.equal(login.status,403);assert.equal((await login.json()).code,'EMAIL_NOT_VERIFIED');
 // Replace only this reserved fixture's generated hashed code with a known code.
 const code='718392',hash=createHash('sha256').update(code).digest('base64url');assert.equal((await db.query('UPDATE verification SET value=$2 WHERE identifier=$1 RETURNING id',['email-verification-otp-'+email,hash+':0'])).rowCount,1);
 assert.equal((await post('/api/auth/email-otp/verify-email',{email,otp:'000000'})).status,400);
 assert.equal((await db.query('SELECT "emailVerified" FROM "user" WHERE id=$1',[id])).rows[0].emailVerified,false);
 const verified=await post('/api/auth/email-otp/verify-email',{email,otp:code});assert.equal(verified.status,200);const result=await verified.json();assert.equal(result.user.emailVerified,true);assert.ok(result.token);assert.ok(verified.headers.getSetCookie().some(c=>c.includes('session_token')));
 assert.equal((await post('/api/auth/email-otp/verify-email',{email,otp:code})).status,400);
 assert.equal((await post('/api/auth/sign-in/email',{email,password})).status,200);
 console.log('PASS: signup creates no session, unverified login blocked, invalid code leaves account unverified, valid code activates login/session, reused code rejected. Reserved address: no real email sent.');
}finally{await db.query('DELETE FROM verification WHERE identifier=$1',['email-verification-otp-'+email]);if(id){await db.query('DELETE FROM organization_security_events WHERE actor_id=$1',[id]);await db.query('DELETE FROM "user" WHERE id=$1',[id]);}await db.end();}
