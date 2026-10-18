import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/request-session";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { db } from "@/lib/db";

export const metadata = { title: "HR document | AIForce.Ops", robots: { index: false, follow: false } };

export default async function HrDocumentPage({ searchParams }: {
    searchParams: Promise<{ project?: string; id?: string }>;
}) {
    const session = await getCurrentSession();
    if (!session?.user) redirect("/sign-in");
    if (!permitted(await workspaceAccess(session.user.id), "knowledge")) notFound();
    const { project, id } = await searchParams;
    if (![project, id].every((v) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v))) notFound();
    const document = (await db.query(
        `SELECT r.data->>'name' AS name,r.data->>'content' AS content,r.updated_at AS "updatedAt"
         FROM epace_records r JOIN epace_projects p ON p.id=r.project_id AND p.user_id=r.user_id
         WHERE r.user_id=$1 AND r.project_id=$2 AND r.id=$3 AND r.kind='document'
           AND (p.settings->>'dwpCollection'='true' OR lower(p.name)='hr collection')`,
        [session.user.id, project, id],
    )).rows[0];
    if (!document) notFound();
    return <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <article className="mx-auto max-w-4xl rounded-2xl border bg-white p-8">
            <Link href="/dashboard" className="text-indigo-600">Back to Agent Studio</Link>
            <h1 className="mt-6 text-3xl font-semibold">{document.name || "HR document"}</h1>
            <p className="my-4 text-sm text-slate-500">Uploaded HR Collection document · Updated {new Date(document.updatedAt).toISOString()}</p>
            <div className="whitespace-pre-wrap break-words leading-7">{document.content || "No readable text is available for this document."}</div>
        </article>
    </main>;
}
