import { getRequestSession } from "@/lib/request-session";
import { workspaceAccess } from "@/lib/workspace-access";
export async function GET(request: Request) {
    const user = (await getRequestSession(request))?.user;
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
    const member = await workspaceAccess(user.id);
    const balance = (await import("@/lib/db")).db;
    const wallet = (await balance.query("SELECT refresh_ticket_wallet($1) AS balance", [user.id]))
        .rows[0];
    return Response.json(
        {
            member: {
                ...member,
                ticket_balance: member.role === "admin" ? null : Number(wallet?.balance || 0),
            },
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
