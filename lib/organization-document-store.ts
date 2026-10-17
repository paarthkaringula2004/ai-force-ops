import "server-only";
import type { Pool, PoolClient } from "pg";
import { decryptMail } from "./mail";
import { readAttachmentMetadata } from "./organization-mail-attachments";
import type { AttachmentMetadata } from "./mail-attachment-types";
import { isDocumentType, type DocumentType, type DocumentTemplate } from "./organization-documents";
export type SavedDocumentTemplate = DocumentTemplate & {
    revision: number;
    updatedAt: string;
    attachments: AttachmentMetadata[];
};
export async function readDocumentTemplates(
    client: Pool | PoolClient,
): Promise<Partial<Record<DocumentType, SavedDocumentTemplate>>> {
    const rows = (
        await client.query(
            "SELECT kind,encrypted_content,revision,updated_at,attachment_ids FROM organization_mail_templates",
        )
    ).rows;
    const attachments = await readAttachmentMetadata(client, [
        ...new Set<string>(rows.flatMap((row) => row.attachment_ids ?? [])),
    ]);
    const result: Partial<Record<DocumentType, SavedDocumentTemplate>> = {};
    for (const row of rows) {
        const type: unknown = row.kind;
        if (!isDocumentType(type)) continue;
        const content = decryptMail(row.encrypted_content);
        result[type] = {
            markdown: content.text,
            subject: content.subject,
            revision: Number(row.revision),
            updatedAt: row.updated_at,
            attachments: (row.attachment_ids ?? [])
                .map((id: string) => attachments.find((file) => file.id === id))
                .filter(Boolean) as AttachmentMetadata[],
        };
    }
    return result;
}
export async function readDocumentTemplate(
    client: Pool | PoolClient,
    type: DocumentType,
): Promise<SavedDocumentTemplate | null> {
    const row = (
        await client.query(
            "SELECT encrypted_content,revision,updated_at,attachment_ids FROM organization_mail_templates WHERE kind=$1",
            [type],
        )
    ).rows[0];
    if (!row) return null;
    const content = decryptMail(row.encrypted_content);
    return {
        markdown: content.text,
        subject: content.subject,
        revision: Number(row.revision),
        updatedAt: row.updated_at,
        attachments: await readAttachmentMetadata(client, row.attachment_ids ?? []),
    };
}
