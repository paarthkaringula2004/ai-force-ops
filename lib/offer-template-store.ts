import "server-only";
import type { Pool, PoolClient } from "pg";
import { decryptMail } from "./mail";
export async function readOfferTemplate(client: Pool | PoolClient) {
    const row = (
        await client.query(
            "SELECT encrypted_content,revision,updated_at,attachment_ids FROM organization_mail_templates WHERE kind='offer'",
        )
    ).rows[0];
    if (!row) return null;
    const content = decryptMail(row.encrypted_content);
    return {
        markdown: content.text,
        subject: content.subject,
        revision: Number(row.revision),
        updatedAt: row.updated_at,
        attachmentIds: row.attachment_ids ?? [],
    };
}
