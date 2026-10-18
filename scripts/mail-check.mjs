import "./load-env.mjs";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import nodemailer from "nodemailer";
import pg from "pg";
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { testMail } from "../lib/mail-templates.ts";
const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    requireTLS: Number(process.env.SMTP_PORT || 465) !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 25000,
});
try {
    await transport.verify();
    console.log("SMTP TLS and authentication verified.");
} catch (error) {
    console.error(
        "SMTP verification failed.",
        error.code || "connection",
        error.responseCode || "",
    );
    process.exitCode = 1;
} finally {
    transport.close();
}
if (process.exitCode !== 1 && process.argv.includes("--queue-test")) {
    const content = testMail(),
        id = randomUUID(),
        iv = randomBytes(12),
        cipher = createCipheriv(
            "aes-256-gcm",
            Buffer.from(process.env.MAIL_ENCRYPTION_KEY, "hex"),
            iv,
        );
    const encrypted = [
        iv.toString("hex"),
        Buffer.concat([cipher.update(JSON.stringify(content), "utf8"), cipher.final()]).toString(
            "base64",
        ),
        cipher.getAuthTag().toString("hex"),
    ].join(".");
    const db = new pg.Pool({ ...postgresConnectionOptions(), max: 1 });
    try {
        await db.query(
            "INSERT INTO mail_outbox(id,dedupe_key,kind,recipient,subject,encrypted_content) VALUES($1,$2,'test',$3,$4,$5)",
            [id, "smtp-check:" + id, process.env.SMTP_USER, content.subject, encrypted],
        );
        console.log("Test queued to the configured sender mailbox. Job:", id);
    } finally {
        await db.end();
    }
}
