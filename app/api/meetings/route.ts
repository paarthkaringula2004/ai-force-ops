import { getRequestSession } from "@/lib/request-session";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { meetingOverview, meetingInbox, meetingDirectory, scheduleVirtualMeeting, retryVirtualMeeting, cancelVirtualMeeting, inviteToMeeting, respondToMeetingInvite } from "@/lib/workspace-meetings";
import { disconnectTeams, configureTeamsApp } from "@/lib/teams-meetings";
import { disconnectGoogleMeet, configureGoogleMeetApp } from "@/lib/google-meet";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const failure = (error: unknown) => Response.json({ error: error instanceof InputError ? error.message : "Meeting request failed. Please retry." }, { status: error instanceof InputError ? error.status : 503, headers });
export async function GET(request: Request) {
  const session = await getRequestSession(request); if (!session?.user) return Response.json({ error: "Sign in to view meetings." }, { status: 401, headers });
  try { const params = new URL(request.url).searchParams; return Response.json(params.has('directory') ? await meetingDirectory(session.user.id) : params.has('inbox') ? { invitations: await meetingInbox(session.user.id, params.get('inbox') === 'unread'), checkedAt: new Date().toISOString() } : await meetingOverview(session.user.id), { headers }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const session = await getRequestSession(request); if (!session?.user) return Response.json({ error: "Sign in to use meetings." }, { status: 401, headers });
  try { requireSameOrigin(request); } catch { return Response.json({ error: "Invalid origin." }, { status: 403, headers }); }
  try {
    const body = await boundedJson(request) as Record<string, unknown>; let result;
    if (!body || typeof body !== 'object') throw new InputError("Choose an action.");
    if (body.action === 'create') result = await scheduleVirtualMeeting(session.user.id, body);
    else if (body.action === 'retry') result = await retryVirtualMeeting(session.user.id, String(body.id));
    else if (body.action === 'cancel') result = await cancelVirtualMeeting(session.user.id, body.id);
    else if (body.action === 'invite') result = await inviteToMeeting(session.user.id, body);
    else if (body.action === 'respond') result = await respondToMeetingInvite(session.user.id, body.id, body.response);
    else if (body.action === 'disconnect-google') result = await disconnectGoogleMeet(session.user.id);
    else if (body.action === 'configure-google') result = await configureGoogleMeetApp(session.user.id, body);
    else if (body.action === 'disconnect') result = await disconnectTeams(session.user.id);
    else if (body.action === 'configure-teams') result = await configureTeamsApp(session.user.id, body);
    else throw new InputError("Unsupported meeting action.");
    return Response.json(result, { headers });
  } catch (error) { return failure(error); }
}
