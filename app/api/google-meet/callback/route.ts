import { getRequestSession } from "@/lib/request-session";
import { finishGoogleMeetSignIn } from "@/lib/google-meet";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url), session = await getRequestSession(request);
  const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('aiforce-google-meet-state='))?.slice('aiforce-google-meet-state='.length);
  let status = 'failed';
  try { if (!session?.user || !cookie || cookie !== url.searchParams.get('state') || url.searchParams.has('error')) throw new Error('Invalid callback'); await finishGoogleMeetSignIn(session.user.id, cookie, url.searchParams.get('code') || ''); status = 'connected'; } catch { status = url.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'failed'; }
  return new Response(null, { status: 303, headers: { Location: new URL(`/dashboard/meeting-rooms?mode=virtual&google=${status}`, url).toString(), "Cache-Control": "no-store", "Set-Cookie": 'aiforce-google-meet-state=; Path=/api/google-meet; HttpOnly; SameSite=Lax; Max-Age=0' } });
}
