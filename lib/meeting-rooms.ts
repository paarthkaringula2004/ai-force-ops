import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { permitted } from "./workspace-permissions";
import { InputError } from "./eassist/transport";

type BookingInput = { roomId: string; title: string; attendees: number; start: string; end: string };
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function access(user: string, admin = false) {
  const member = await workspaceAccess(user);
  if (!permitted(member, "signed_in") || (admin && !["admin", "manager"].includes(member.role))) throw new InputError(admin ? "Only an Admin or Manager can configure rooms." : "Active workspace access required.", 403);
  return member;
}
export function bookingWindow(start: unknown, end: unknown, future = false) {
  if (typeof start !== "string" || typeof end !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(start) || !/(Z|[+-]\d{2}:\d{2})$/i.test(end)) throw new InputError("Include the date, time and timezone for both start and end.");
  const from = Date.parse(start), until = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until-from > 24*60*60*1000) throw new InputError("Choose a valid meeting interval of up to 24 hours.");
  if (future && (from <= Date.now() || from > Date.now()+366*24*60*60*1000)) throw new InputError("Book a future time within the next year.");
  return { start: new Date(from).toISOString(), end: new Date(until).toISOString() };
}
export async function readMeetingRooms(user: string, request: string | Record<string, unknown> = {}) {
  const member = await access(user);
  let query: Record<string, unknown>;
  if (typeof request === "string") { try { query = request.trim().startsWith("{") ? object(JSON.parse(request)) : {}; } catch { throw new InputError("Use valid JSON for the availability interval."); } } else query = object(request);
  const interval = query.start || query.end ? bookingWindow(query.start, query.end) : null;
  const attendees = query.attendees === undefined ? 1 : Number(query.attendees);
  if (!Number.isInteger(attendees) || attendees < 1 || attendees > 500) throw new InputError("Choose 1 to 500 attendees.");
  const rooms = (await db.query(`SELECT id,name,location,capacity,amenities,active,location_kind AS "locationKind",(created_by=$1 OR $2) AS "canManage" FROM meeting_rooms WHERE deleted_at IS NULL ${["admin", "manager"].includes(member.role) ? "" : "AND active=true"} ORDER BY name,location`,[user,member.role === "admin"])).rows;
  const busy = interval ? (await db.query(`SELECT room_id AS "roomId",starts_at AS start,ends_at AS "end" FROM meeting_room_bookings WHERE status='confirmed' AND starts_at<$2 AND ends_at>$1`, [interval.start,interval.end])).rows : [];
  const bookings = (await db.query(`SELECT b.id,b.room_id AS "roomId",r.name AS "roomName",r.location,b.title,b.attendees,b.starts_at AS start,b.ends_at AS "end",b.status FROM meeting_room_bookings b JOIN meeting_rooms r ON r.id=b.room_id WHERE b.user_id=$1 AND b.removed_at IS NULL AND b.ends_at>now() ORDER BY b.starts_at LIMIT 100`, [user])).rows;
  const configured = rooms.some(room => room.active);
  return { mode: "live_application_database", checkedAt: new Date().toISOString(), calendar: "AIForce.Ops", externalCalendarConnected: false, configured, canConfigure: ["admin", "manager"].includes(member.role), bookingPage: "/dashboard/meeting-rooms", interval,
    rooms: rooms.map(room => ({ ...room, ...(interval ? { available: room.active && room.capacity >= attendees && !busy.some(b => b.roomId === room.id), conflicts: busy.filter(b=>b.roomId===room.id) } : {}) })), bookings,
    capabilities: { checkAvailability: configured, confirmReservationInDashboard: configured, chatCanReserve: false },
    message: configured ? "Availability is checked against current AIForce.Ops reservations. A preview is not a reservation; confirm in Meeting Rooms. No Microsoft/Google calendar invitation is created." : "No active meeting rooms are configured. An Admin or Manager must add real rooms in Dashboard → Meeting Rooms. Do not invent rooms or say a booking was made." };
}
export async function configureMeetingRoom(user: string, value: unknown) {
  const member=await access(user, true); const body=object(value); const locationKind=body.locationKind===undefined?"job":body.locationKind; if(!["job","specific"].includes(String(locationKind)))throw new InputError("Choose Job location or Specific location.");
  const name=typeof body.name==="string"?body.name.trim():"",location=typeof body.location==="string"?body.location.trim():"",amenities=typeof body.amenities==="string"?body.amenities.trim():"",capacity=Number(body.capacity);
  if (!name || name.length>100 || !location || location.length>200 || amenities.length>1000 || !Number.isInteger(capacity) || capacity<1 || capacity>500) throw new InputError("Enter a room name, location, capacity (1–500) and optional equipment.");
  try {
    if(body.roomId!==undefined){
      if(!uuid(body.roomId))throw new InputError("Choose a configured room.");
      const client=await db.connect();
      try {
        await client.query('BEGIN');
        const room=(await client.query('SELECT id FROM meeting_rooms WHERE id=$1 AND deleted_at IS NULL AND (created_by=$2 OR $3) FOR UPDATE',[body.roomId,user,member.role==='admin'])).rows[0];
        if(!room)throw new InputError("Room not found.",404);
        const bookings=await client.query("SELECT id FROM meeting_room_bookings WHERE room_id=$1 AND status='confirmed' AND ends_at>now() AND attendees>$2 LIMIT 1",[body.roomId,capacity]);
        if(bookings.rowCount)throw new InputError("Capacity cannot be smaller than an existing upcoming reservation. Keep enough seats or cancel that reservation first.",409);
        const result=await client.query('UPDATE meeting_rooms SET name=$2,location=$3,capacity=$4,amenities=$5,location_kind=$6,updated_at=now() WHERE id=$1 RETURNING id,name,location,capacity,amenities,active',[body.roomId,name,location,capacity,amenities,locationKind]);
        await client.query('COMMIT');return result.rows[0];
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
    return (await db.query('INSERT INTO meeting_rooms(id,name,location,capacity,amenities,created_by,location_kind) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,location,capacity,amenities,active',[randomUUID(),name,location,capacity,amenities,user,locationKind])).rows[0];
  }
  catch (error) { if ((error as {code?:string}).code==='23505') throw new InputError("This room already exists at that location.",409); throw error; }
}
export async function setRoomActive(user: string, roomId: unknown, active: unknown) {
  const member=await access(user,true); if(!uuid(roomId)||typeof active!=="boolean")throw new InputError("Choose a room and its availability state.");
  const result=await db.query('UPDATE meeting_rooms SET active=$2,updated_at=now() WHERE id=$1 AND deleted_at IS NULL AND (created_by=$3 OR $4) RETURNING id,active',[roomId,active,user,member.role === "admin"]);
  if(!result.rowCount)throw new InputError("Room not found.",404);
  return { ...result.rows[0], message: "Existing reservations are retained; disabled rooms cannot receive new reservations." };
}
function bookingInput(value: unknown): BookingInput {
  const body=object(value); if(!uuid(body.roomId))throw new InputError("Choose a configured room.");
  const title=typeof body.title==="string"?body.title.trim():"",attendees=Number(body.attendees);
  if(!title || title.length>150 || !Number.isInteger(attendees) || attendees<1 || attendees>500)throw new InputError("Enter a meeting title and 1 to 500 attendees.");
  return {roomId:String(body.roomId),title,attendees,...bookingWindow(body.start,body.end,true)};
}
export async function previewMeetingBooking(user: string, value: unknown) {
  await access(user);const payload=bookingInput(value);
  const data=await readMeetingRooms(user,payload);const room=data.rooms.find(r=>r.id===payload.roomId);
  if(!room?.active)throw new InputError("This room is unavailable.",409);
  if(room.capacity<payload.attendees)throw new InputError("The room is too small for this meeting.",409);
  if(!room.available)throw new InputError("The room is already reserved during that interval.",409);
  const token=randomBytes(32).toString('base64url');
  const expires=(await db.query('INSERT INTO meeting_room_previews(token_hash,user_id,payload) VALUES($1,$2,$3) RETURNING expires_at AS "expiresAt"',[hash(token),user,JSON.stringify(payload)])).rows[0];
  return {token,payload,room,expiresAt:expires.expiresAt,message:"Review these details. The room is not reserved until you confirm; availability is rechecked on confirmation."};
}
export async function confirmMeetingBooking(user: string, token: unknown) {
  await access(user);if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new InputError("Preview the meeting first.");
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const preview=(await client.query('SELECT payload,expires_at AS "expiresAt",booking_id AS "bookingId" FROM meeting_room_previews WHERE token_hash=$1 AND user_id=$2 FOR UPDATE',[hash(token),user])).rows[0];
    if(!preview)throw new InputError("Preview not found for your account.",404);
    if(preview.bookingId){const existing=(await client.query('SELECT id,status FROM meeting_room_bookings WHERE id=$1 AND user_id=$2',[preview.bookingId,user])).rows[0];await client.query('COMMIT');return {...existing,calendar:'AIForce.Ops',alreadyConfirmed:true};}
    if(new Date(preview.expiresAt).getTime()<=Date.now())throw new InputError("Preview expired. Check availability again.",409);
    const payload=bookingInput(preview.payload);
    // Serializing reservations and disabling on this row prevents concurrent double booking.
    const room=(await client.query('SELECT id,capacity,active FROM meeting_rooms WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[payload.roomId])).rows[0];
    if(!room?.active || room.capacity<payload.attendees)throw new InputError("The room is unavailable or too small. Preview again.",409);
    const conflict=await client.query("SELECT 1 FROM meeting_room_bookings WHERE room_id=$1 AND status='confirmed' AND starts_at<$3 AND ends_at>$2 LIMIT 1",[payload.roomId,payload.start,payload.end]);
    if(conflict.rowCount)throw new InputError("Someone reserved this room since your preview. Choose another time.",409);
    const booking=(await client.query('INSERT INTO meeting_room_bookings(id,room_id,user_id,title,attendees,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status',[randomUUID(),payload.roomId,user,payload.title,payload.attendees,payload.start,payload.end])).rows[0];
    await client.query('UPDATE meeting_room_previews SET booking_id=$2 WHERE token_hash=$1',[hash(token),booking.id]);await client.query('COMMIT');
    return {...booking,...payload,calendar:'AIForce.Ops',externalCalendarInvitationCreated:false};
  } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function cancelMeetingBooking(user: string, id: unknown) {
  const member=await access(user);if(!uuid(id))throw new InputError("Choose a booking.");
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const row=(await client.query('SELECT id,status FROM meeting_room_bookings WHERE id=$1 AND (user_id=$2 OR $3) FOR UPDATE',[id,user,member.role==='admin'])).rows[0];
    if(!row)throw new InputError("Booking not found or you cannot cancel it.",404);
    if(row.status!=='cancelled') {
      await client.query("UPDATE meeting_room_bookings SET status='cancelled',cancelled_at=now() WHERE id=$1",[id]);
      await client.query('UPDATE workspace_meeting_invites SET notified_at=NULL WHERE booking_id=$1',[id]);
    }
    await client.query('COMMIT');return {id,status:'cancelled'};
  } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function deleteMeetingRoom(user: string, id: unknown) {
  const member = await access(user, true);
  if (!uuid(id)) throw new InputError("Choose a room.");
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const room = await client.query('SELECT id FROM meeting_rooms WHERE id=$1 AND deleted_at IS NULL AND (created_by=$2 OR $3) FOR UPDATE', [id,user,member.role === "admin"]);
    if (!room.rowCount) throw new InputError("Room not found.", 404);
    const upcoming = await client.query("SELECT 1 FROM meeting_room_bookings WHERE room_id=$1 AND status='confirmed' AND ends_at>now() LIMIT 1", [id]);
    if (upcoming.rowCount) throw new InputError("Cancel this room’s upcoming reservations before deleting it.", 409);
    await client.query('UPDATE meeting_rooms SET active=false,deleted_at=now(),updated_at=now() WHERE id=$1', [id]);
    await client.query('COMMIT');
    return { id, deleted: true, message: "Room removed from the calendar. Previous booking records are retained." };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function removeMeetingBooking(user: string, id: unknown) {
  await access(user);
  if (!uuid(id)) throw new InputError("Choose a booking.");
  const result = await db.query("UPDATE meeting_room_bookings SET removed_at=now() WHERE id=$1 AND user_id=$2 AND status='cancelled' AND removed_at IS NULL RETURNING id", [id, user]);
  if (!result.rowCount) throw new InputError("Only your own cancelled bookings can be deleted from your list.", 409);
  return { id, deleted: true, message: "Cancelled booking removed from your list. Its reservation record is retained." };
}
