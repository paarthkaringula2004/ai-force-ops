import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { workspaceAccess } from "@/lib/workspace-access";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { organizationWriteAllowed, OrganizationPolicyError } from "@/lib/organization-security";
export const runtime = "nodejs";
async function salaryAccess(actor: string, user: string, write = false) {
    const member = await workspaceAccess(actor),
        target = await workspaceAccess(user);
    const reviewer =
        member.active &&
        actor !== user &&
        (member.role === "admin" ||
            (member.role === "manager" &&
                target.role === "employee" &&
                target.manager_id === actor));
    return { allowed: write ? reviewer : reviewer || (member.active && actor === user), target };
}
export async function GET(request: Request) {
    const actor = (await getRequestSession(request))?.user?.id;
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const user = new URL(request.url).searchParams.get("userId") || actor;
    try {
        if (!(await salaryAccess(actor, user)).allowed)
            return Response.json({ error: "Salary access not permitted." }, { status: 403 });
        const salary =
            (
                await db.query(
                    "SELECT monthly_salary,currency,deduction_basis,updated_at::text AS version FROM workspace_salaries WHERE user_id=$1",
                    [user],
                )
            ).rows[0] || null;
        return Response.json({ salary }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
        return Response.json({ error: "Could not load this salary record." }, { status: 404 });
    }
}
export async function PUT(request: Request) {
    const actor = (await getRequestSession(request))?.user?.id;
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    let input: Record<string, unknown>;
    try {
        const text = await request.text();
        if (text.length > 4000) throw new Error();
        input = JSON.parse(text);
    } catch {
        return Response.json({ error: "Invalid salary details." }, { status: 400 });
    }
    const amount = Number(input.monthlySalary);
    if (
        typeof input.userId !== "string" ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 999999999999 ||
        Math.abs(Math.round(amount * 100) - amount * 100) > 0.0001 ||
        typeof input.currency !== "string" ||
        !/^[A-Z]{3}$/.test(input.currency) ||
        !["calendar_days", "fixed_30"].includes(String(input.deductionBasis)) ||
        typeof input.note !== "string" ||
        !input.note.trim() ||
        input.note.length > 1000
    )
        return Response.json(
            {
                error: "Enter a valid monthly salary, ISO currency, deduction basis and change note.",
            },
            { status: 400 },
        );
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(8470220029)");
        await organizationWriteAllowed(actor, client);
        const member = (
            await client.query("SELECT * FROM workspace_members WHERE user_id=$1", [actor])
        ).rows[0];
        const target = (
            await client.query("SELECT * FROM workspace_members WHERE user_id=$1", [input.userId])
        ).rows[0];
        if (
            !member?.active ||
            !target ||
            actor === input.userId ||
            !(
                member.role === "admin" ||
                (member.role === "manager" &&
                    target.role === "employee" &&
                    target.manager_id === actor)
            )
        ) {
            await client.query("ROLLBACK");
            return Response.json(
                {
                    error: "Only the assigned Manager or an Admin can set an employee salary. Manager salaries require an Admin.",
                },
                { status: 403 },
            );
        }
        const before = (
            await client.query(
                "SELECT *,updated_at::text AS version FROM workspace_salaries WHERE user_id=$1 FOR UPDATE",
                [input.userId],
            )
        ).rows[0];
        if (before && before.version !== input.version) {
            await client.query("ROLLBACK");
            return Response.json(
                { error: "The salary record changed. Reload before saving." },
                { status: 409 },
            );
        }
        await client.query(
            "INSERT INTO workspace_salaries(user_id,monthly_salary,currency,deduction_basis,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET monthly_salary=EXCLUDED.monthly_salary,currency=EXCLUDED.currency,deduction_basis=EXCLUDED.deduction_basis,updated_by=EXCLUDED.updated_by,updated_at=now()",
            [input.userId, amount, input.currency, input.deductionBasis, actor],
        );
        await client.query(
            "INSERT INTO workspace_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,'salary.updated',$4::jsonb)",
            [
                randomUUID(),
                actor,
                input.userId,
                JSON.stringify({
                    previous: before
                        ? {
                              monthlySalary: before.monthly_salary,
                              currency: before.currency,
                              basis: before.deduction_basis,
                          }
                        : null,
                    monthlySalary: amount,
                    currency: input.currency,
                    deductionBasis: input.deductionBasis,
                    note: input.note.trim(),
                }),
            ],
        );
        await client.query("COMMIT");
        return Response.json({
            notice: "Salary settings saved. Pending leave estimates are recalculated at approval; existing decisions retain their recorded calculation.",
        });
    } catch (error) {
        await client.query("ROLLBACK");
        return Response.json(
            {
                error:
                    error instanceof OrganizationPolicyError
                        ? error.message
                        : "Could not save salary settings.",
            },
            { status: error instanceof OrganizationPolicyError ? 403 : 503 },
        );
    } finally {
        client.release();
    }
}
