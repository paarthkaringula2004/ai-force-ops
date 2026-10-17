import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { mailConfigured, queueMail, encryptMail } from "@/lib/mail";
import { readStaffCatalog } from "@/lib/staff-catalog";
import { validateOfferDetails, customizedOfferMail } from "@/lib/offer-customization";
import { readDocumentTemplate, readDocumentTemplates } from "@/lib/organization-document-store";
import {
    isDocumentType,
    documentDefinition,
    validateDocumentTemplate,
    validateDocumentDetails,
    fillDocumentTemplate,
} from "@/lib/organization-documents";
import {
    attachmentIds,
    loadDocumentAttachments,
    readAttachmentMetadata,
} from "@/lib/organization-mail-attachments";
export const runtime = "nodejs";
async function actor(request: Request) {
    const user = (await getRequestSession(request))?.user;
    return user && permitted(await workspaceAccess(user.id), "admin") ? user : null;
}
export async function GET(request: Request) {
    const user = await actor(request);
    if (!user) return Response.json({ error: "Admin access required." }, { status: 403 });
    const [catalog, contact, managers, templates] = await Promise.all([
        readStaffCatalog(db),
        db.query(
            "SELECT u.name,u.email,coalesce(p.phone,'') AS phone FROM \"user\" u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=$1",
            [user.id],
        ),
        db.query(
            "SELECT u.id,u.name,u.email FROM \"user\" u JOIN workspace_members m ON m.user_id=u.id WHERE m.active AND m.role IN ('admin','manager') ORDER BY u.name",
        ),
        readDocumentTemplates(db),
    ]);
    return Response.json(
        {
            catalog,
            contact: contact.rows[0],
            managers: managers.rows,
            templates,
            template: templates.offer ?? null,
            configured: mailConfigured(),
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
export async function PUT(request: Request) {
    const user = await actor(request);
    if (!user) return Response.json({ error: "Admin access required." }, { status: 403 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const client = await db.connect();
    try {
        const body = await request.json(),
            type = body.documentType ?? "offer";
        if (!isDocumentType(type)) throw new Error("Choose a supported document type.");
        const template = validateDocumentTemplate(type, body.markdown, body.subject);
        if (!Number.isInteger(body.revision) || body.revision < 0)
            throw new Error("Reload the template before saving.");
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            "organization-document-template:" + type,
        ]);
        if (
            !(
                await client.query(
                    "SELECT 1 FROM workspace_members WHERE user_id=$1 AND active AND role='admin' FOR UPDATE",
                    [user.id],
                )
            ).rowCount
        )
            throw new Error("Active Admin access required.");
        const current = await readDocumentTemplate(client, type);
        if ((current?.revision ?? 0) !== body.revision) {
            await client.query("ROLLBACK");
            return Response.json(
                {
                    error: "Another Admin updated this template. Reload the page to review that version before saving.",
                },
                { status: 409 },
            );
        }
        const ids =
            body.attachmentIds === undefined
                ? (current?.attachments.map((file) => file.id) ?? [])
                : attachmentIds(body.attachmentIds);
        await loadDocumentAttachments(client, type, ids, user.id);
        const attachments = await readAttachmentMetadata(client, ids);
        const row = (
            await client.query(
                `INSERT INTO organization_mail_templates(kind,encrypted_content,updated_by,attachment_ids) VALUES($1,$2,$3,$4::uuid[]) ON CONFLICT(kind) DO UPDATE SET encrypted_content=excluded.encrypted_content,updated_by=excluded.updated_by,attachment_ids=excluded.attachment_ids,revision=organization_mail_templates.revision+1,updated_at=now() RETURNING revision,updated_at`,
                [
                    type,
                    encryptMail({ subject: template.subject, text: template.markdown, html: "" }),
                    user.id,
                    ids,
                ],
            )
        ).rows[0];
        await client.query(
            "INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,$3,$4::jsonb)",
            [
                randomUUID(),
                user.id,
                type === "offer" ? "mail.offer_template_saved" : "mail.document_template_saved",
                JSON.stringify({ documentType: type, revision: row.revision }),
            ],
        );
        await client.query("COMMIT");
        return Response.json({
            saved: true,
            documentType: type,
            template: {
                ...template,
                revision: row.revision,
                updatedAt: row.updated_at,
                attachments,
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");
        return Response.json(
            { error: error instanceof Error ? error.message : "Could not save template." },
            { status: 400 },
        );
    } finally {
        client.release();
    }
}
export async function POST(request: Request) {
    const user = await actor(request);
    if (!user) return Response.json({ error: "Admin access required." }, { status: 403 });
    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const client = await db.connect();
    try {
        const body = await request.json(),
            type = body.documentType ?? "offer";
        if (!isDocumentType(type)) throw new Error("Choose a supported document type.");
        const template = body.template
            ? validateDocumentTemplate(type, body.template.markdown, body.template.subject)
            : null;
        if (!template && type !== "offer")
            throw new Error("Generate the document from its template first.");
        const fields = template
            ? validateDocumentDetails(type, body.details, template)
            : validateOfferDetails(body.details);
        if (!template && (typeof body.markdown !== "string" || typeof body.subject !== "string"))
            throw new Error("Generate the letter first.");
        if (!mailConfigured()) throw new Error("Mail configuration is unavailable.");
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            `mail-admin:${user.id}`,
        ]);
        if (
            !(
                await client.query(
                    "SELECT 1 FROM workspace_members WHERE user_id=$1 AND active AND role='admin' FOR UPDATE",
                    [user.id],
                )
            ).rowCount
        )
            throw new Error("Active Admin access required.");
        const count = (
            await client.query(
                "SELECT count(*)::int AS n FROM mail_outbox WHERE actor_id=$1 AND kind IN ('offer','document') AND created_at>now()-interval '1 hour'",
                [user.id],
            )
        ).rows[0].n;
        if (count >= 20) throw new Error("Up to 20 document previews are allowed per hour.");
        const contact = (
            await client.query(
                "SELECT u.name,u.email,coalesce(p.phone,'') AS phone FROM \"user\" u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=$1",
                [user.id],
            )
        ).rows[0];
        const reference =
            typeof body.reference === "string" && /^[A-Z0-9-]{3,40}$/.test(body.reference)
                ? body.reference
                : documentDefinition(type).prefix + "-" + randomUUID().slice(0, 8).toUpperCase();
        const filled = template
            ? fillDocumentTemplate(
                  type,
                  template,
                  fields as Record<string, string>,
                  contact,
                  reference,
              )
            : { markdown: body.markdown, subject: body.subject };
        const files = await loadDocumentAttachments(
            client,
            type,
            attachmentIds(body.attachmentIds),
            user.id,
        );
        const preview = customizedOfferMail(filled.markdown, filled.subject, contact, files);
        const id = await queueMail(
            type === "offer" ? "offer" : "document",
            fields.email!,
            preview,
            `document:${randomUUID()}`,
            {
                client,
                actor: user.id,
                draft: true,
                expires: new Date(Date.now() + 600000),
                documentType: type,
            },
        );
        if (!id) throw new Error("This address cannot receive external mail.");
        await client.query(
            "INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'mail.customization_preview',$3::jsonb)",
            [randomUUID(), user.id, JSON.stringify({ mailId: id, documentType: type })],
        );
        await client.query("COMMIT");
        return Response.json({ id, preview, to: fields.email, documentType: type });
    } catch (error) {
        await client.query("ROLLBACK");
        return Response.json(
            { error: error instanceof Error ? error.message : "Could not preview the document." },
            { status: 400 },
        );
    } finally {
        client.release();
    }
}
