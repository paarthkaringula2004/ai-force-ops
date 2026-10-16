import { getRequestSession } from "@/lib/request-session";
import { finishTeamsSignIn } from "@/lib/teams-meetings";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url), session = await getRequestSession(request);
  const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('aiforce-teams-state='))?.slice('aiforce-teams-state='.length);
  let status = 'failed';
  try { if (!session?.user || !cookie || cookie !== url.searchParams.get('state') || url.searchParams.has('error')) throw new Error('Invalid callback'); await finishTeamsSignIn(session.user.id, cookie, url.searchParams.get('code') || ''); status = 'connected'; } catch { status = url.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'failed'; }
  // A relative return path preserves the public origin behind Render’s proxy.
  return new Response(null, { status: 303, headers: { Location: `/dashboard/meeting-rooms?mode=virtual&teams=${status}`, "Cache-Control": "no-store", "Set-Cookie": 'aiforce-teams-state=; Path=/api/teams; HttpOnly; SameSite=Lax; Max-Age=0' } });
}
