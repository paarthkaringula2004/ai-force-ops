import { getRequestSession } from "@/lib/request-session";
import {
    readMeetingRooms,
    configureMeetingRoom,
    setRoomActive,
    previewMeetingBooking,
    confirmMeetingBooking,
    cancelMeetingBooking,
    deleteMeetingRoom,
    removeMeetingBooking,
} from "@/lib/meeting-rooms";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { boundedJson, InputError } from "@/lib/eassist/transport";
export const runtime = "nodejs";
function failure(error: unknown) {
    return Response.json(
        {
            error:
                error instanceof InputError
                    ? error.message
                    : "Meeting Rooms could not complete the request. Please retry.",
        },
        {
            status: error instanceof InputError ? error.status : 503,
            headers: { "Cache-Control": "no-store" },
        },
    );
}
export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to view Meeting Rooms." }, { status: 401 });
    try {
        const params = new URL(request.url).searchParams;
        return Response.json(
            await readMeetingRooms(session.user.id, Object.fromEntries(params.entries())),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user)
        return Response.json({ error: "Sign in to use Meeting Rooms." }, { status: 401 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    try {
        const body = (await boundedJson(request)) as Record<string, unknown>;
        if (!body || typeof body !== "object")
            throw new InputError("Choose a meeting-room action.");
        let result;
        if (body.action === "configure") result = await configureMeetingRoom(session.user.id, body);
        else if (body.action === "room-state")
            result = await setRoomActive(session.user.id, body.roomId, body.active);
        else if (body.action === "preview")
            result = await previewMeetingBooking(session.user.id, body);
        else if (body.action === "confirm")
            result = await confirmMeetingBooking(session.user.id, body.token);
        else if (body.action === "cancel")
            result = await cancelMeetingBooking(session.user.id, body.bookingId);
        else if (body.action === "delete-room")
            result = await deleteMeetingRoom(session.user.id, body.roomId);
        else if (body.action === "remove-booking")
            result = await removeMeetingBooking(session.user.id, body.bookingId);
        else throw new InputError("Choose a supported meeting-room action.");
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return failure(error);
    }
}
