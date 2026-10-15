import { randomUUID } from "node:crypto";
import { meetingAccess } from "./meeting-expiry";
import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { permitted, type WorkspaceAccess } from "./workspace-permissions";
import { InputError } from "./eassist/transport";
import { bookingWindow } from "./meeting-rooms";
import { teamsConnectionStatus, createTeamsMeeting, cancelTeamsMeeting } from "./teams-meetings";

import { googleMeetConnectionStatus, createGoogleMeetMeeting, cancelGoogleMeetMeeting } from "./google-meet";

type Role = WorkspaceAccess["role"];
export function invitationRoles(role: Role): Role[] { return role === "admin" ? ["admin", "manager", "employee", "user"] : role === "manager" ? ["manager", "employee", "user"] : ["employee", "user"]; }
async function active(user: string) { const member = await workspaceAccess(user); if (!permitted(member, "signed_in")) throw new InputError("Active workspace access required.", 403); return member; }
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export async function meetingDirectory(user: string) {
  const member = await active(user), roles = invitationRoles(member.role);
  const people = (await db.query('SELECT m.user_id AS id,u.name,m.role,m.department FROM workspace_members m JOIN "user" u ON u.id=m.user_id WHERE m.active=true AND m.role=ANY($1::text[]) AND m.user_id<>$2 ORDER BY m.department,u.name', [roles, user])).rows;
  return { roles, people, departments: [...new Set<string>(people.map(p => p.department).filter(Boolean))].sort(), canManageLocations: ["admin", "manager"].includes(member.role) };
}
export async function meetingInbox(user: string, unreadOnly = false) {
  await active(user);
  return (await db.query(`SELECT i.id,v.provider,i.status,i.notified_at AS "notifiedAt",i.virtual_id AS "virtualId",i.booking_id AS "bookingId",u.name AS "senderName",COALESCE(v.title,b.title) AS title,COALESCE(v.starts_at,b.starts_at) AS start,COALESCE(v.ends_at,b.ends_at) AS "end",CASE WHEN v.id IS NOT NULL THEN 'virtual' ELSE 'in_person' END AS mode,COALESCE(v.status,b.status) AS "meetingStatus",CASE WHEN v.status='ready' THEN v.join_url ELSE NULL END AS "joinUrl",r.name AS "roomName",r.location FROM workspace_meeting_invites i JOIN "user" u ON u.id=i.sender_id LEFT JOIN workspace_virtual_meetings v ON v.id=i.virtual_id LEFT JOIN meeting_room_bookings b ON b.id=i.booking_id LEFT JOIN meeting_rooms r ON r.id=b.room_id WHERE i.user_id=$1 AND COALESCE(v.ends_at,b.ends_at)>now() ${unreadOnly ? "AND i.notified_at IS NULL" : ""} ORDER BY i.created_at DESC LIMIT 100`, [user])).rows;
}
export async function meetingOverview(user: string) {
  await active(user);
  const [teams, google, directory, invitations, meetings] = await Promise.all([teamsConnectionStatus(user), googleMeetConnectionStatus(user), meetingDirectory(user), meetingInbox(user), db.query('SELECT id,provider,title,starts_at AS start,ends_at AS "end",kind,status,join_url AS "joinUrl",meeting_id AS "meetingId",passcode FROM workspace_virtual_meetings WHERE organizer_id=$1 AND removed_at IS NULL ORDER BY starts_at DESC LIMIT 100', [user])]);
  const now=Date.now();
  return { teams, google, directory, invitations, meetings: meetings.rows.map(row=>meetingAccess(row as {status:string;end:Date;joinUrl:string|null;meetingId:string|null;passcode:string|null},now)), checkedAt: new Date(now).toISOString() };
}
export async function scheduleVirtualMeeting(user: string, value: unknown) {
  await active(user); const body = object(value);
  const provider = body.provider === "teams" ? "teams" : "google";
  if (body.provider !== undefined && !["teams","google"].includes(String(body.provider))) throw new InputError("Choose Google Meet or Teams.");
  const connection = provider === "google" ? await googleMeetConnectionStatus(user) : await teamsConnectionStatus(user);
  if (!connection.configured) throw new InputError(`An Admin must configure ${provider === "google" ? "Google Meet" : "Teams"} before creating meetings.`, 503);
  if (!connection.connected) throw new InputError(`Connect your own ${provider === "google" ? "Google" : "Teams"} account before creating meetings.`, 409);
  if (!uuid(body.id)) throw new InputError("A meeting request ID is required for safe retries.");
  const title = typeof body.title === "string" ? body.title.trim() : "", kind = body.kind === "now" ? "now" : "scheduled";
  if (!title || title.length > 150) throw new InputError("Enter a meeting name up to 150 characters.");
  const window = bookingWindow(body.start, body.end, kind === "scheduled");
  if (kind === "now" && (Date.parse(window.start) < Date.now() - 10 * 60000 || Date.parse(window.start) > Date.now() + 5 * 60000)) throw new InputError("Create a new immediate meeting request.");
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Stable request ID + provider externalId recover safely after timeouts or DB failures.
    await client.query('INSERT INTO workspace_virtual_meetings(id,organizer_id,title,starts_at,ends_at,kind,microsoft_organizer_id,google_organizer_id,provider) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING', [body.id, user, title, window.start, window.end, kind,provider === "teams" ? (connection.account as {microsoftId:string})?.microsoftId : null,provider === "google" ? (connection.account as {googleId:string})?.googleId : null,provider]);
    const existing = (await client.query('SELECT * FROM workspace_virtual_meetings WHERE id=$1 FOR UPDATE', [body.id])).rows[0];
    if (existing.provider !== provider || existing.organizer_id !== user || existing.title !== title || existing.kind !== kind || new Date(existing.starts_at).toISOString() !== window.start || new Date(existing.ends_at).toISOString() !== window.end) throw new InputError("This request ID belongs to different meeting details. Start a new meeting.", 409);
    if (existing.status === 'cancelled' || existing.status === 'cancelling') throw new InputError("This meeting has been cancelled or is being cancelled.", 409);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return retryVirtualMeeting(user, String(body.id));
}
export async function retryVirtualMeeting(user: string, id: string) {
  await active(user); if (!uuid(id)) throw new InputError("Choose a meeting.");
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM workspace_virtual_meetings WHERE id=$1 AND organizer_id=$2 AND removed_at IS NULL FOR UPDATE', [id, user])).rows[0];
    if(row&&new Date(row.ends_at).getTime()<=Date.now())throw new InputError("This meeting has expired. Create a new meeting instead.",409);
    if (!row || !['creating', 'ready'].includes(row.status)) throw new InputError("Meeting not available.", 404);
    if (row.status === 'ready') { await client.query('COMMIT'); return { id, joinUrl: row.join_url, status: 'ready' }; }
    if (new Date(row.ends_at).getTime() <= Date.now()) throw new InputError("This pending meeting ended. Create a new meeting.", 409);
    const created = row.provider === "google" ? await createGoogleMeetMeeting(user, {id,title:row.title,start:new Date(row.starts_at).toISOString(),end:new Date(row.ends_at).toISOString(),googleId:row.google_organizer_id}) : await createTeamsMeeting(user, { id, title: row.title, start: new Date(row.starts_at).toISOString(), end: new Date(row.ends_at).toISOString(),microsoftId:row.microsoft_organizer_id });
    if ("pending" in created && created.pending) { await client.query("UPDATE workspace_virtual_meetings SET provider_id=$2 WHERE id=$1",[id,created.providerId]); await client.query("COMMIT"); return {id,joinUrl:null,status:"creating"}; }
    await client.query("UPDATE workspace_virtual_meetings SET status='ready',provider_id=$2,join_url=$3,meeting_id=$4,passcode=$5 WHERE id=$1", [id, created.providerId, created.joinUrl, created.meetingId, created.passcode]);
    await client.query('COMMIT'); return { id, joinUrl: created.joinUrl, status: 'ready' };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function cancelVirtualMeeting(user: string, id: unknown) {
  await active(user); if (!uuid(id)) throw new InputError("Choose a meeting.");
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM workspace_virtual_meetings WHERE id=$1 AND organizer_id=$2 FOR UPDATE', [id, user])).rows[0];
    if (!row) throw new InputError("Only the organizer can cancel this meeting.", 404);
    // Recover a provider meeting whose first response/DB write was interrupted before cancellation.
    if (row.status === 'creating' && row.provider !== 'google') throw new InputError("Retry link creation first so Teams can verify and cancel the same meeting.", 409);
    if (row.status !== 'cancelled') {
      if (row.provider === "google") await cancelGoogleMeetMeeting(user, row.provider_id || `aiforce${id.replaceAll("-","")}`,row.google_organizer_id);
      else await cancelTeamsMeeting(user, row.provider_id,row.microsoft_organizer_id);
      await client.query("UPDATE workspace_virtual_meetings SET status='cancelled' WHERE id=$1", [id]);
      await client.query('UPDATE workspace_meeting_invites SET notified_at=NULL WHERE virtual_id=$1', [id]);
    }
    await client.query('COMMIT'); return { cancelled: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function inviteToMeeting(user: string, value: unknown) {
  const body = object(value), member = await active(user);
  const ids = Array.isArray(body.people) ? [...new Set(body.people)] : [], departments = Array.isArray(body.departments) ? [...new Set(body.departments)] : [];
  if (!uuid(body.id) || !['virtual', 'in_person'].includes(String(body.mode)) || ids.length > 500 || departments.length > 100 || ids.some(id => typeof id !== 'string') || departments.some(d => typeof d !== 'string' || d.length > 160) || (!ids.length && !departments.length)) throw new InputError("Choose departments or specific workspace people.");
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const table = body.mode === 'virtual' ? 'workspace_virtual_meetings' : 'meeting_room_bookings', owner = body.mode === 'virtual' ? 'organizer_id' : 'user_id', required = body.mode === 'virtual' ? 'ready' : 'confirmed';
    const meeting = (await client.query(`SELECT * FROM ${table} WHERE id=$1 AND ${owner}=$2 FOR UPDATE`, [body.id, user])).rows[0];
    if (!meeting || meeting.status !== required || new Date(meeting.ends_at).getTime() <= Date.now()) throw new InputError("Only the organizer can invite people to an active meeting.", 403);
    const currentRole = (await client.query('SELECT role,active FROM workspace_members WHERE user_id=$1 FOR SHARE', [user])).rows[0];
    if (!currentRole?.active || currentRole.role !== member.role) throw new InputError("Your workspace role changed. Refresh and try again.", 409);
    const roles = invitationRoles(currentRole.role);
    const explicit = ids.length ? (await client.query('SELECT user_id,role,active FROM workspace_members WHERE user_id=ANY($1::text[]) FOR SHARE', [ids])).rows : [];
    if (explicit.length !== ids.length || explicit.some(p => !p.active || !roles.includes(p.role) || p.user_id === user)) throw new InputError("One or more people are outside your invitation permissions.", 403);
    const recipients = (await client.query('SELECT user_id FROM workspace_members WHERE active=true AND role=ANY($1::text[]) AND user_id<>$2 AND (user_id=ANY($3::text[]) OR department=ANY($4::text[])) ORDER BY user_id FOR SHARE', [roles, user, ids, departments])).rows;
    if (!recipients.length) throw new InputError("No eligible active people were found in that selection.");
    if (recipients.length > 1000) throw new InputError("Invite at most 1,000 people at a time. Choose fewer departments.");
    if (body.mode === 'in_person') {
      const existing = (await client.query("SELECT user_id FROM workspace_meeting_invites WHERE booking_id=$1 AND status<>'declined'",[body.id])).rows;
      const total = new Set([...existing.map(p=>p.user_id),...recipients.map(p=>p.user_id)]).size+1;
      if (total>meeting.attendees) throw new InputError(`This reservation is for ${meeting.attendees} people including you. Choose fewer invitees or book for the full group.`,409);
    }
    const inserted = await client.query('INSERT INTO workspace_meeting_invites(id,virtual_id,booking_id,sender_id,user_id) SELECT x.id,$3::uuid,$4::uuid,$5,x.user_id FROM UNNEST($1::uuid[],$2::text[]) AS x(id,user_id) ON CONFLICT DO NOTHING RETURNING id', [recipients.map(() => randomUUID()), recipients.map(p => p.user_id), body.mode === 'virtual' ? body.id : null, body.mode === 'in_person' ? body.id : null, user]);
    const sent = inserted.rowCount || 0;
    await client.query('COMMIT'); return { sent, alreadyInvited: recipients.length - sent, channel: 'workspace_notifications' };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function respondToMeetingInvite(user: string, id: unknown, action: unknown) {
  await active(user);
  if (!uuid(id) || !['accept', 'decline', 'dismiss'].includes(String(action))) throw new InputError("Choose an invitation action.");
  const result = await db.query("UPDATE workspace_meeting_invites SET status=CASE WHEN $3='accept' THEN 'accepted' WHEN $3='decline' THEN 'declined' ELSE status END,notified_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,status", [id, user, action]);
  if (!result.rowCount) throw new InputError("Invitation not found.", 404); return result.rows[0];
}
