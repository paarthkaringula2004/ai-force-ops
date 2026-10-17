import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { PoolClient } from "pg";
import { db } from "./db";
import type { MailContent, MailKind } from "./mail-templates";
type Queryable = Pick<PoolClient, "query">;
export function mailConfigured() {
    return Boolean(
        process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_ENCRYPTION_KEY,
    );
}
export function validMailAddress(address: string) {
    return (
        address.length <= 254 &&
        /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) &&
        !/[\r\n]/.test(address)
    );
}
function key() {
    const value = Buffer.from(process.env.MAIL_ENCRYPTION_KEY || "", "hex");
    if (value.length !== 32) throw new Error("Mail encryption is not configured.");
    return value;
}
export function encryptMail(content: MailContent) {
    const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key(), iv);
    return [iv.toString("hex")]
        .concat(
            Buffer.concat([
                cipher.update(JSON.stringify(content), "utf8"),
                cipher.final(),
            ]).toString("base64"),
            cipher.getAuthTag().toString("hex"),
        )
        .join(".");
}
export function decryptMail(value: string): MailContent {
    const [iv, data, tag] = value.split("."),
        cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
    cipher.setAuthTag(Buffer.from(tag, "hex"));
    return JSON.parse(
        Buffer.concat([cipher.update(Buffer.from(data, "base64")), cipher.final()]).toString(
            "utf8",
        ),
    );
}
export async function queueMail(
    kind: MailKind,
    to: string,
    content: MailContent,
    dedupe: string,
    options: {
        client?: Queryable;
        actor?: string;
        draft?: boolean;
        expires?: Date;
        documentType?: string;
    } = {},
) {
    if (!validMailAddress(to)) throw new Error("Enter a valid recipient email.");
    if (!mailConfigured()) return null;
    // Reserved test addresses never become external mail traffic.
    if (/\.(invalid|test|example)$/i.test(to) && !options.draft) return null;
    const id = randomUUID();
    const result = await (options.client || db).query(
        "INSERT INTO mail_outbox(id,dedupe_key,kind,recipient,subject,encrypted_content,actor_id,status,expires_at,document_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",
        [
            id,
            dedupe,
            kind,
            to.toLowerCase(),
            content.subject,
            encryptMail(content),
            options.actor || null,
            options.draft ? "draft" : "queued",
            options.expires || null,
            options.documentType || null,
        ],
    );
    return result.rows[0]?.id || null;
}
export function smtpTransport() {
    const port = Number(process.env.SMTP_PORT || 465);
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s/g, "") },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 25000,
        tls: { minVersion: "TLSv1.2" },
    });
}
export async function deliverMailBatch() {
    await db.query(
        "UPDATE mail_outbox SET status='expired',encrypted_content=NULL WHERE status IN ('draft','queued','sending') AND expires_at<now() AND (lease_until IS NULL OR lease_until<now())",
    );
    if (!mailConfigured()) return { processed: 0, configured: false };
    const claimed = await db.query(
        `WITH selected AS (SELECT id FROM mail_outbox WHERE (status='queued' OR (status='sending' AND lease_until<now())) AND available_at<=now() AND (expires_at IS NULL OR expires_at>now()) ORDER BY (kind='verification') DESC,created_at FOR UPDATE SKIP LOCKED LIMIT 5) UPDATE mail_outbox m SET status='sending',lease_until=now()+interval '90 seconds',attempts=attempts+1 FROM selected WHERE m.id=selected.id RETURNING m.*`,
    );
    const transport = smtpTransport();
    await Promise.all(
        claimed.rows.map(async (row) => {
            try {
                if (/\.(invalid|test|example)$/i.test(row.recipient)) {
                    await db.query(
                        "UPDATE mail_outbox SET status='failed',encrypted_content=NULL,lease_until=NULL,last_error='Reserved test recipient; no email sent' WHERE id=$1",
                        [row.id],
                    );
                    return;
                }
                const content = decryptMail(row.encrypted_content);
                const messageId = `<${row.id}@aiforce.ops>`;
                const sent = await transport.sendMail({
                    from: { name: "AIForce.Ops", address: process.env.SMTP_USER! },
                    replyTo:
                        content.replyTo && validMailAddress(content.replyTo)
                            ? content.replyTo
                            : process.env.SMTP_USER,
                    to: row.recipient,
                    subject: content.subject,
                    text: content.text,
                    html: content.html,
                    attachments: content.attachments?.map((file) => ({
                        filename: file.filename,
                        contentType: file.contentType,
                        content: file.content,
                        encoding: "base64",
                    })),
                    messageId,
                    disableFileAccess: true,
                    disableUrlAccess: true,
                });
                if (!sent.accepted?.length) throw new Error("Recipient rejected.");
                await db.query(
                    "UPDATE mail_outbox SET status='sent',sent_at=now(),lease_until=NULL,message_id=$2,last_error=NULL,encrypted_content=NULL WHERE id=$1",
                    [row.id, messageId],
                );
            } catch (error) {
                const e = error as { responseCode?: number; code?: string };
                const permanent = (e.responseCode || 0) >= 500;
                await db.query(
                    "UPDATE mail_outbox SET status=$2,lease_until=NULL,available_at=now()+($3*interval '1 second'),last_error=$4,encrypted_content=CASE WHEN $2='failed' THEN NULL ELSE encrypted_content END WHERE id=$1",
                    [
                        row.id,
                        permanent || row.attempts >= 5 ? "failed" : "queued",
                        Math.min(900, 30 * 2 ** row.attempts),
                        e.responseCode
                            ? `SMTP ${e.responseCode}`
                            : "SMTP connection or delivery failed",
                    ],
                );
            }
        }),
    );
    transport.close();
    await db.query(
        "INSERT INTO mail_worker_health(id,checked_at,processed) VALUES(true,now(),$1) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at,processed=excluded.processed",
        [claimed.rowCount],
    );
    // Remove old encrypted draft bodies and bound queue metadata retention.
    await db.query(
        "DELETE FROM mail_outbox WHERE status IN ('sent','failed','expired') AND created_at<now()-interval '90 days'",
    );
    return { processed: claimed.rowCount, configured: true };
}
