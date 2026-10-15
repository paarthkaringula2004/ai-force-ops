import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import ts from 'typescript';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>name in deps?deps[name]:require(name),m,m.exports);return m.exports;}
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const control=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000}),schema='google_meet_test_'+randomUUID().replaceAll('-','');let pool;
const originalFetch=globalThis.fetch,env=Object.fromEntries(['GOOGLE_MEET_CLIENT_ID','GOOGLE_MEET_CLIENT_SECRET','GOOGLE_MEET_REDIRECT_URI','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'].map(key=>[key,process.env[key]]));
const ids={admin:randomUUID(),manager:randomUUID(),employee:randomUUID(),user:randomUUID(),otherEmployee:randomUUID(),otherManager:randomUUID(),otherAdmin:randomUUID(),inactive:randomUUID()};
const fixtures=Object.entries(ids).map(([label,id])=>({id,name:`Fixture ${label}`,role:label.toLowerCase().includes('admin')?'admin':label.toLowerCase().includes('manager')?'manager':label==='user'?'user':'employee',active:label!=='inactive',department:label.startsWith('other')?'Branch B':'Branch A'}));
const permissions=load('lib/workspace-permissions.ts'),secrets=load('lib/agent-secrets.ts');
let pending=true,timeoutOnce=false,creates=0,cancels=0,renewals=0;const events=new Map();
try{
 await control.query(`CREATE SCHEMA ${schema}`);
 await control.query(`CREATE TABLE ${schema}."user"(id text PRIMARY KEY,name text); CREATE TABLE ${schema}.workspace_members(user_id text PRIMARY KEY,role text,active boolean,department text)`);
 for(const table of ['meeting_rooms','meeting_room_bookings','meeting_room_previews','teams_user_connections','teams_oauth_states','teams_app_settings','google_meet_app_settings','google_meet_user_connections','google_meet_oauth_states','workspace_virtual_meetings','workspace_meeting_invites'])await control.query(`CREATE TABLE ${schema}.${table}(LIKE public.${table} INCLUDING ALL)`);
 pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,max:8,options:`-c search_path=${schema},public`});
 for(const person of fixtures){await pool.query('INSERT INTO "user"(id,name) VALUES($1,$2)',[person.id,person.name]);await pool.query('INSERT INTO workspace_members(user_id,role,active,department) VALUES($1,$2,$3,$4)',[person.id,person.role,person.active,person.department]);}
 const access={workspaceAccess:async id=>(await pool.query('SELECT user_id,role,active,department FROM workspace_members WHERE user_id=$1',[id])).rows[0]||{role:'user',active:false}};
 const deps={'./db':{db:pool},'./workspace-access':access,'./workspace-permissions':permissions,'./eassist/transport':{InputError}};
 const rooms=load('lib/meeting-rooms.ts',deps),teams=load('lib/teams-meetings.ts',{...deps,'./agent-secrets':secrets}),google=load('lib/google-meet.ts',{...deps,'./agent-secrets':secrets}),meetings=load('lib/workspace-meetings.ts',{...deps,'./meeting-expiry':load('lib/meeting-expiry.ts'),'./meeting-rooms':rooms,'./teams-meetings':teams,'./google-meet':google});

 for(const key of Object.keys(env))delete process.env[key];
 assert.equal((await google.googleMeetConnectionStatus(ids.user)).configured,false);
 await assert.rejects(()=>meetings.scheduleVirtualMeeting(ids.user,{}),e=>e.status===503);
 const settings={clientId:'123-fixture.apps.googleusercontent.com',clientSecret:'isolated-google-secret'};
 await assert.rejects(()=>google.configureGoogleMeetApp(ids.manager,settings),e=>e.status===403);
 await google.configureGoogleMeetApp(ids.admin,settings);
 const saved=(await pool.query('SELECT client_secret FROM google_meet_app_settings')).rows[0];assert.notEqual(saved.client_secret,settings.clientSecret);assert.equal(secrets.decryptAgentApiKey(saved.client_secret),settings.clientSecret);
 assert.equal((await google.googleMeetConnectionStatus(ids.user)).setup,null);
 assert.equal(JSON.stringify(await google.googleMeetConnectionStatus(ids.admin)).includes(settings.clientSecret),false);
 globalThis.fetch=async(input,init={})=>{
  const url=String(input);assert.equal(init.redirect,'error');
  if(url==='https://oauth2.googleapis.com/token'){const body=new URLSearchParams(init.body);assert.equal(body.get('client_secret'),settings.clientSecret);let actor;if(body.get('grant_type')==='authorization_code'){actor=body.get('code').slice(5);assert.ok(body.get('code_verifier'));}else{actor=body.get('refresh_token').slice(8);renewals++;}return Response.json({access_token:`access-${actor}`,refresh_token:`refresh-${actor}`,expires_in:3600,scope:'openid email profile https://www.googleapis.com/auth/calendar.events.owned'});}
  const actor=init.headers.Authorization.slice('Bearer access-'.length);
  if(url==='https://openidconnect.googleapis.com/v1/userinfo')return Response.json({sub:`google-${actor}`,email:'fixture@example.invalid',email_verified:true,name:'Fixture Google'});
  assert.ok(url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events'),'No real network requests');
  if(init.method==='DELETE'){cancels++;return new Response(null,{status:204});}
  if(init.method==='POST'){const body=JSON.parse(init.body);assert.ok(url.includes('conferenceDataVersion=1'));assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');assert.ok(!body.attendees);const key=`${actor}:${body.id}`;if(events.has(key))return Response.json({}, {status:409});events.set(key,{id:body.id,status:'confirmed',extendedProperties:body.extendedProperties,conferenceData:{createRequest:{status:{statusCode:'pending'}}}});creates++;if(timeoutOnce){timeoutOnce=false;throw new Error('Simulated response loss after creation');}return Response.json(events.get(key));}
  const event=events.get(`${actor}:${new URL(url).pathname.split('/').at(-1)}`);assert.ok(event);
  if(!pending)event.conferenceData={conferenceId:'abc-defg-hij',createRequest:{status:{statusCode:'success'}},entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'}]};
  return Response.json(event);
 };
 const auth=await google.beginGoogleMeetSignIn(ids.user),url=new URL(auth.url);assert.equal(url.hostname,'accounts.google.com');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 const state=(await pool.query('SELECT verifier FROM google_meet_oauth_states WHERE user_id=$1',[ids.user])).rows[0];assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(secrets.decryptAgentApiKey(state.verifier)).digest('base64url'));
 await assert.rejects(()=>google.finishGoogleMeetSignIn(ids.employee,auth.state,`code:${ids.user}`),e=>e.status===409);
 await google.finishGoogleMeetSignIn(ids.user,auth.state,`code:${ids.user}`);await assert.rejects(()=>google.finishGoogleMeetSignIn(ids.user,auth.state,`code:${ids.user}`),e=>e.status===409);
 const row=(await pool.query('SELECT * FROM google_meet_user_connections WHERE user_id=$1',[ids.user])).rows[0];assert.notEqual(row.access_token,`access-${ids.user}`);assert.equal((await google.googleMeetConnectionStatus(ids.user)).connected,true);
 assert.equal((await google.googleMeetConnectionStatus(ids.employee)).connected,false);
 const expired=await google.beginGoogleMeetSignIn(ids.employee);await pool.query("UPDATE google_meet_oauth_states SET expires_at=now()-interval '1 minute'");await assert.rejects(()=>google.finishGoogleMeetSignIn(ids.employee,expired.state,'code:test'),e=>e.status===409);
 await assert.rejects(()=>google.beginGoogleMeetSignIn(ids.inactive),e=>e.status===403);
 for(const value of ['https://meet.google.com.attacker.invalid/abc-defg-hij','http://meet.google.com/abc-defg-hij','https://u:p@meet.google.com/abc-defg-hij','javascript:alert(1)'])assert.throws(()=>google.verifiedGoogleMeetUrl(value),e=>e.status===502);
 const input={id:randomUUID(),title:'Fixture meeting',kind:'scheduled',start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+90000000).toISOString()};
 await pool.query("UPDATE google_meet_user_connections SET expires_at=now()-interval '1 minute' WHERE user_id=$1",[ids.user]);
 timeoutOnce=true;await assert.rejects(()=>meetings.scheduleVirtualMeeting(ids.user,input));assert.equal(creates,1);assert.equal(renewals,1);
 const waiting=await meetings.retryVirtualMeeting(ids.user,input.id);assert.equal(waiting.status,'creating');assert.equal(waiting.joinUrl,null);assert.equal(creates,1);
 await assert.rejects(()=>meetings.inviteToMeeting(ids.user,{id:input.id,mode:'virtual',people:[ids.employee]}),e=>e.status===403);
 pending=false;const results=await Promise.all([meetings.retryVirtualMeeting(ids.user,input.id),meetings.retryVirtualMeeting(ids.user,input.id)]);assert.equal(results[0].joinUrl,'https://meet.google.com/abc-defg-hij');assert.equal(results[1].joinUrl,results[0].joinUrl);assert.equal(creates,1);
 await assert.rejects(()=>meetings.scheduleVirtualMeeting(ids.user,{...input,title:'Different details'}),e=>e.status===409);
 await assert.rejects(()=>meetings.retryVirtualMeeting(ids.employee,input.id),e=>e.status===404);
 assert.equal((await meetings.inviteToMeeting(ids.user,{id:input.id,mode:'virtual',people:[ids.employee],departments:['Branch B']})).sent,2);
 await assert.rejects(()=>meetings.inviteToMeeting(ids.user,{id:input.id,mode:'virtual',people:[ids.manager]}),e=>e.status===403);
 const inbox=await meetings.meetingInbox(ids.employee,true);assert.equal(inbox[0].provider,'google');assert.equal(inbox[0].joinUrl,results[0].joinUrl);
 assert.equal((await meetings.meetingInbox(ids.manager)).length,0);
 await meetings.respondToMeetingInvite(ids.employee,inbox[0].id,'accept');assert.equal((await meetings.meetingInbox(ids.employee,true)).length,0);
 await pool.query('UPDATE google_meet_user_connections SET google_id=$2 WHERE user_id=$1',[ids.user,'different-account']);await assert.rejects(()=>meetings.cancelVirtualMeeting(ids.user,input.id),e=>e.status===409);assert.equal(cancels,0);
 await pool.query('UPDATE google_meet_user_connections SET google_id=$2 WHERE user_id=$1',[ids.user,`google-${ids.user}`]);await meetings.cancelVirtualMeeting(ids.user,input.id);assert.equal(cancels,1);await meetings.cancelVirtualMeeting(ids.user,input.id);assert.equal(cancels,1);
 const cancelled=(await meetings.meetingInbox(ids.employee,true))[0];assert.equal(cancelled.meetingStatus,'cancelled');assert.equal(cancelled.joinUrl,null);
 const pendingInput={...input,id:randomUUID()};pending=true;assert.equal((await meetings.scheduleVirtualMeeting(ids.user,pendingInput)).status,'creating');await meetings.cancelVirtualMeeting(ids.user,pendingInput.id);assert.equal(cancels,2);
 const expiredInput={...input,id:randomUUID()};pending=false;await meetings.scheduleVirtualMeeting(ids.user,expiredInput);
 await pool.query("UPDATE workspace_virtual_meetings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",[expiredInput.id]);
 const expiredOverview=await meetings.meetingOverview(ids.user),expiredMeeting=expiredOverview.meetings.find(m=>m.id===expiredInput.id);
 assert.equal(expiredMeeting.status,'expired');assert.equal(expiredMeeting.joinUrl,null);assert.equal(expiredMeeting.meetingId,null);
 const beforeExpiredRetry=creates;await assert.rejects(()=>meetings.retryVirtualMeeting(ids.user,expiredInput.id),e=>e.status===409);assert.equal(creates,beforeExpiredRetry);
 console.log('PASS: expired meeting access redacts links in overview and blocks retries without provider calls.');
 const apiDeps={'@/lib/request-session':{getRequestSession:async r=>r.headers.get('X-Test-Actor')?{user:{id:r.headers.get('X-Test-Actor')}}:null},'@/lib/eassist/transport':{InputError},'@/lib/service-review/ingestion':{requireSameOrigin:r=>{if(r.headers.get('origin')!=='https://localhost')throw Error('origin');}},'@/lib/google-meet':google};
 const startRoute=load('app/api/google-meet/start/route.ts',apiDeps),callbackRoute=load('app/api/google-meet/callback/route.ts',apiDeps);
 assert.equal((await startRoute.POST(new Request('https://localhost/api/google-meet/start',{method:'POST'}))).status,401);
 assert.equal((await startRoute.POST(new Request('https://localhost/api/google-meet/start',{method:'POST',headers:{'X-Test-Actor':ids.user,origin:'https://evil.invalid'}}))).status,403);
 const started=await startRoute.POST(new Request('https://localhost/api/google-meet/start',{method:'POST',headers:{'X-Test-Actor':ids.user,origin:'https://localhost'}}));assert.equal(started.status,303);assert.ok(started.headers.get('set-cookie').includes('HttpOnly; SameSite=Lax'));assert.ok(started.headers.get('set-cookie').includes('Secure'));
 const stateValue=new URL(started.headers.get('location')).searchParams.get('state');
 const wrong=await callbackRoute.GET(new Request(`https://localhost/api/google-meet/callback?state=${stateValue}&code=code:${ids.user}`,{headers:{'X-Test-Actor':ids.user,cookie:'aiforce-google-meet-state=wrong'}}));assert.ok(wrong.headers.get('location').includes('google=failed'));
 const finished=await callbackRoute.GET(new Request(`https://localhost/api/google-meet/callback?state=${stateValue}&code=code:${ids.user}`,{headers:{'X-Test-Actor':ids.user,cookie:`aiforce-google-meet-state=${stateValue}`}}));assert.ok(finished.headers.get('location').includes('google=connected'));assert.ok(finished.headers.get('set-cookie').includes('Max-Age=0'));
 const changed=await google.beginGoogleMeetSignIn(ids.user);await google.configureGoogleMeetApp(ids.admin,{...settings,clientSecret:'changed-secret'});assert.equal((await google.googleMeetConnectionStatus(ids.user)).connected,false);await assert.rejects(()=>google.finishGoogleMeetSignIn(ids.user,changed.state,`code:${ids.user}`),e=>e.status===409);
 console.log('PASS: Google OAuth/PKCE and encrypted settings/tokens, actor-bound expiring single-use state, refresh, async conference creation, lost-response recovery without duplicate events, concurrent retries, organizer binding, invitation roles/privacy, pending/ready cancellation and updates. Mock Google responses, isolated database; no real meetings or invitations.');
}finally{globalThis.fetch=originalFetch;for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();}
