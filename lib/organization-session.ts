import { getRequestSession as accountSession } from "@/lib/request-session";
import { sharedOperationsOwner } from "@/lib/eassist/organization-context";
// Shared operational resources use the organization owner; authorization uses the real caller.
export async function getRequestSession(request: Request) {
    const session = await accountSession(request);
    if (!session?.user) return null;
    try {
        const owner = await sharedOperationsOwner(session.user.id);
        return { ...session, actorId: session.user.id, user: { ...session.user, id: owner } };
    } catch {
        return null;
    }
}
