import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { permitted } from "./workspace-permissions";
import { InputError } from "./eassist/transport";
import { encryptAgentApiKey as encrypt, decryptAgentApiKey as decrypt } from "./agent-secrets";

const calendarScope = "https://www.googleapis.com/auth/calendar.events.owned";
const scopes = `openid profile email ${calendarScope}`;
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
async function config() {
  const saved = (await db.query('SELECT client_id,client_secret FROM google_meet_app_settings WHERE singleton=true')).rows[0];
  const appUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return { clientId: saved?.client_id || process.env.GOOGLE_MEET_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || '', secret: saved ? decrypt(saved.client_secret) : process.env.GOOGLE_MEET_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || '', redirect: process.env.GOOGLE_MEET_REDIRECT_URI?.trim() || new URL('/api/google-meet/callback', appUrl).toString() };
}
const fingerprint = (c: Awaited<ReturnType<typeof config>>) => digest(JSON.stringify([c.clientId,c.secret,c.redirect]));
async function active(user: string) { const member = await workspaceAccess(user); if (!permitted(member,'signed_in')) throw new InputError('Active workspace access required.',403); return member; }
export async function googleMeetConnectionStatus(user: string) {
  const member=await active(user), c=await config(), configured=!!(c.clientId&&c.secret&&process.env.BETTER_AUTH_SECRET);
  const row=(await db.query('SELECT google_id AS "googleId",account_name AS name,account_email AS email,updated_at AS "connectedAt" FROM google_meet_user_connections WHERE user_id=$1 AND app_fingerprint=$2',[user,fingerprint(c)])).rows[0];
  return { configured, connected:!!row, account:row||null, provider:'Google Meet', setup:member.role==='admin'?{clientId:c.clientId,redirectUri:c.redirect}:null, reason:!configured?'An Admin must set up the Google application once. Then everyone can connect their own Google account.':!row?'Continue with Google to allow meeting creation in your calendar. Personal Gmail accounts are supported.':'Google connected. Meetings are created in your primary calendar; Google account limits and meeting admission settings apply.' };
}
export async function beginGoogleMeetSignIn(user: string) {
  await active(user); const c=await config(); if (!(c.clientId&&c.secret&&process.env.BETTER_AUTH_SECRET)) throw new InputError('An Admin must configure Google Meet first.',503);
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
  await db.query('DELETE FROM google_meet_oauth_states WHERE expires_at<now()');
  await db.query('INSERT INTO google_meet_oauth_states(state_hash,user_id,verifier,app_fingerprint) VALUES($1,$2,$3,$4)',[digest(state),user,encrypt(verifier),fingerprint(c)]);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirect,response_type:'code',scope:scopes,state,code_challenge:digest(verifier),code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'}).toString();
  return {state,url:url.toString()};
}
async function tokenRequest(body: Record<string,string>, c: Awaited<ReturnType<typeof config>>) {
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.secret,...body}),signal:AbortSignal.timeout(20000),redirect:'error'});
  const result=await response.json();
  if (!response.ok||typeof result.access_token!=='string'||!Number.isFinite(Number(result.expires_in))||Number(result.expires_in)<=0) throw new InputError('Google access expired or was revoked. Reconnect Google.',409);
  if (result.scope && !String(result.scope).split(' ').includes(calendarScope)) throw new InputError('Google calendar permission was not granted. Reconnect and approve calendar access.',403);
  return result;
}
export async function finishGoogleMeetSignIn(user: string,state: string,code: string) {
  await active(user); if (!/^[A-Za-z0-9_-]{43}$/.test(state)||!code||code.length>8192) throw new InputError('Invalid Google sign-in response.');
  const c=await config(),saved=(await db.query('DELETE FROM google_meet_oauth_states WHERE state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING verifier,app_fingerprint',[digest(state),user])).rows[0];
  if (!saved||saved.app_fingerprint!==fingerprint(c)) throw new InputError('Google sign-in expired or app settings changed. Start again.',409);
  const result=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:c.redirect,code_verifier:decrypt(saved.verifier)},c);
  if (!String(result.scope||'').split(' ').includes(calendarScope)||typeof result.refresh_token!=='string') throw new InputError('Approve calendar and offline access when connecting Google.',403);
  const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${result.access_token}`},signal:AbortSignal.timeout(15000),redirect:'error'}),profile=await response.json();
  if (!response.ok||typeof profile.sub!=='string'||typeof profile.email!=='string'||profile.email_verified!==true) throw new InputError('Could not verify your Google account.',409);
  if (fingerprint(await config())!==fingerprint(c)) throw new InputError('Google app settings changed. Reconnect.',409);
  await db.query(`INSERT INTO google_meet_user_connections(user_id,google_id,account_name,account_email,access_token,refresh_token,expires_at,scopes,app_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET google_id=excluded.google_id,account_name=excluded.account_name,account_email=excluded.account_email,access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,scopes=excluded.scopes,app_fingerprint=excluded.app_fingerprint,updated_at=now()`,[user,profile.sub,String(profile.name||profile.email),profile.email,encrypt(result.access_token),encrypt(result.refresh_token),new Date(Date.now()+Number(result.expires_in)*1000),String(result.scope),fingerprint(c)]);
}
async function accessToken(user: string,expectedGoogleId?: string) {
  await active(user); const c=await config(),client=await db.connect();
  try {
    await client.query('BEGIN');
    const row=(await client.query('SELECT * FROM google_meet_user_connections WHERE user_id=$1 FOR UPDATE',[user])).rows[0];
    if (!row||row.app_fingerprint!==fingerprint(c)) throw new InputError('Connect Google before creating a meeting.',409);
    if (expectedGoogleId&&row.google_id!==expectedGoogleId) throw new InputError('Reconnect the Google account that originally organised this meeting.',409);
    let token=decrypt(row.access_token);
    if (new Date(row.expires_at).getTime()<Date.now()+90000) {
      const renewed=await tokenRequest({grant_type:'refresh_token',refresh_token:decrypt(row.refresh_token)},c);
      token=renewed.access_token;
      await client.query('UPDATE google_meet_user_connections SET access_token=$2,refresh_token=$3,expires_at=$4,scopes=$5,updated_at=now() WHERE user_id=$1',[user,encrypt(token),encrypt(renewed.refresh_token||decrypt(row.refresh_token)),new Date(Date.now()+Number(renewed.expires_in)*1000),String(renewed.scope||row.scopes)]);
    }
    await client.query('COMMIT'); return token;
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export function verifiedGoogleMeetUrl(value: unknown) {
  if (typeof value!=='string'||value.length>4096) throw new InputError('Google did not return a valid meeting link.',502);
  let url:URL; try { url=new URL(value); } catch { throw new InputError('Invalid Google Meet link.',502); }
  if (url.protocol!=='https:'||url.hostname!=='meet.google.com'||url.username||url.password||url.port||!/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)||url.search||url.hash) throw new InputError('Invalid Google Meet link.',502);
  return url.toString();
}
const eventsUrl='https://www.googleapis.com/calendar/v3/calendars/primary/events';
export async function createGoogleMeetMeeting(user: string,meeting:{id:string;title:string;start:string;end:string;googleId?:string}) {
  const token=await accessToken(user,meeting.googleId),eventId=`aiforce${meeting.id.replaceAll('-','')}`;
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  // A caller-supplied Calendar event ID makes a timeout retry retrieve the same event.
  let response=await fetch(`${eventsUrl}?conferenceDataVersion=1&sendUpdates=none`,{method:'POST',headers,body:JSON.stringify({id:eventId,summary:meeting.title,start:{dateTime:meeting.start},end:{dateTime:meeting.end},extendedProperties:{private:{aiforceMeetingId:meeting.id}},guestsCanModify:false,guestsCanInviteOthers:false,conferenceData:{createRequest:{requestId:meeting.id,conferenceSolutionKey:{type:'hangoutsMeet'}}}}),signal:AbortSignal.timeout(20000),redirect:'error'});
  if (response.status===409) response=await fetch(`${eventsUrl}/${eventId}`,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
  if (!response.ok) throw new InputError(response.status===401?'Google access expired. Reconnect your account.':response.status===403?'Google could not create the meeting. Check calendar permission, API setup and account limits.':'Google could not create this meeting. Retry the saved request safely.',response.status===401?409:response.status===403?403:502);
  const result=await response.json();
  if (result.id!==eventId||result.extendedProperties?.private?.aiforceMeetingId!==meeting.id) throw new InputError('Google returned a different calendar event. Meeting creation stopped.',409);
  if (result.status==='cancelled') throw new InputError('This Google calendar event was cancelled. Start a new meeting.',409);
  const conferenceStatus=result.conferenceData?.createRequest?.status?.statusCode;
  if (conferenceStatus==='failure') throw new InputError('Google could not generate a Meet link for this calendar event. Check your Google account and calendar.',409);
  const link=result.conferenceData?.entryPoints?.find((p:{entryPointType?:string;uri?:string})=>p.entryPointType==='video')?.uri || result.hangoutLink;
  if (!link) return {providerId:eventId,pending:true,joinUrl:null,meetingId:null,passcode:null};
  return {providerId:eventId,pending:false,joinUrl:verifiedGoogleMeetUrl(link),meetingId:typeof result.conferenceData?.conferenceId==='string'?result.conferenceData.conferenceId:null,passcode:null};
}
export async function cancelGoogleMeetMeeting(user:string,providerId:string,googleId?:string) {
  const token=await accessToken(user,googleId);
  const response=await fetch(`${eventsUrl}/${encodeURIComponent(providerId)}?sendUpdates=none`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000),redirect:'error'});
  if (!response.ok&&![404,410].includes(response.status)) throw new InputError('Google could not cancel this calendar event. Reconnect and retry.',502);
}
export async function disconnectGoogleMeet(user:string) {
  await active(user); await db.query('DELETE FROM google_meet_user_connections WHERE user_id=$1',[user]); await db.query('DELETE FROM google_meet_oauth_states WHERE user_id=$1',[user]); return {disconnected:true};
}
export async function configureGoogleMeetApp(user:string,value:unknown) {
  const member=await active(user); if (!permitted(member,'admin')) throw new InputError('Only an Admin can configure Google Meet.',403);
  const body=value as {clientId?:unknown;clientSecret?:unknown};
  if (!body||typeof body.clientId!=='string'||!/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(body.clientId.trim())||typeof body.clientSecret!=='string'||!body.clientSecret.trim()||body.clientSecret.length>4096) throw new InputError('Enter the Google Web application client ID and secret.');
  if (!process.env.BETTER_AUTH_SECRET) throw new InputError('Application encryption is unavailable.',503);
  const client=await db.connect(); try {
    await client.query('BEGIN'); const current=(await client.query('SELECT role,active FROM workspace_members WHERE user_id=$1 FOR SHARE',[user])).rows[0];
    if (!current?.active||current.role!=='admin') throw new InputError('Admin access changed. Refresh first.',403);
    await client.query('INSERT INTO google_meet_app_settings(singleton,client_id,client_secret,updated_by) VALUES(true,$1,$2,$3) ON CONFLICT(singleton) DO UPDATE SET client_id=excluded.client_id,client_secret=excluded.client_secret,updated_by=excluded.updated_by,updated_at=now()',[body.clientId.trim(),encrypt(body.clientSecret.trim()),user]);
    await client.query('DELETE FROM google_meet_user_connections'); await client.query('DELETE FROM google_meet_oauth_states'); await client.query('COMMIT'); return {configured:true,reconnectRequired:true};
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
