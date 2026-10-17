import { organizationWriteAllowed } from "./organization-security";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { permitted, type WorkspaceAccess } from "./workspace-permissions";
import { decryptMail, encryptMail, mailConfigured, queueMail, validMailAddress } from "./mail";
import { escapeMail, type MailContent } from "./mail-templates";

type Draft = {
    type: "mail";
    token: string;
    to?: string;
    subject?: string;
    encrypted?: string;
    documentType?: string;
};
const answer = (reply: string, choices: string[] = []) => ({
    reply,
    choices,
    responseMode: "workspace",
    recordedAt: new Date().toISOString(),
});
const buttons = (d: Draft) =>
    d.encrypted && d.to && d.subject
        ? ["Confirm send email " + d.token, "Edit email message", "Cancel email"]
        : ["Cancel email"];
function preview(d: Draft) {
    const content = decryptMail(d.encrypted!);
    return answer(
        `**Review email before sending**\n\n**To:** ${d.to}\n\n**Subject:** ${content.subject}\n\n**Your exact message:**\n\n${content.text}\n\nNothing has been sent yet. Confirm within 10 minutes. No attachment is included.`,
        buttons(d),
    );
}
export async function workspaceMailChatReply(
    user: string,
    input: string,
    member: WorkspaceAccess,
    initial?: { subject?: string },
) {
    const text = input.trim(),
        command = /\b(send|compose)\b/i.test(text) && /\b(email|mail|offer\s*letter)\b/i.test(text);
    const confirmation = text.match(/^Confirm send email ([a-f0-9-]{36})$/i),
        status = text.match(/^Email status ([a-f0-9-]{36})$/i);
    const cancel = /^Cancel email$/i.test(text),
        edit = text.match(/^Edit email (message|recipient|subject)$/i);
    if (!permitted(member, "admin"))
        return command || confirmation || status || cancel || edit
            ? answer("Only an active Admin can send company emails from Playground.")
            : null;
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            `workspace-chat:${user}`,
        ]);
        const row = (
            await client.query(
                "SELECT draft,expires_at FROM workspace_chat_actions WHERE user_id=$1 FOR UPDATE",
                [user],
            )
        ).rows[0];
        let draft =
            row?.draft?.type === "mail" && new Date(row.expires_at) > new Date()
                ? (row.draft as Draft)
                : undefined;
        if (!draft && !command && !confirmation && !status && !cancel && !edit) {
            await client.query("COMMIT");
            return null;
        }
        if (
            !(
                await client.query(
                    "SELECT 1 FROM workspace_members WHERE user_id=$1 AND role='admin' AND active FOR UPDATE",
                    [user],
                )
            ).rowCount
        ) {
            await client.query("COMMIT");
            return answer("Active Admin access is required. No email was sent.");
        }
        let result: ReturnType<typeof answer>;
        if (status) {
            const sent = (
                await client.query(
                    "SELECT status,sent_at,last_error FROM mail_outbox WHERE id=$1 AND actor_id=$2",
                    [status[1], user],
                )
            ).rows[0];
            result = answer(
                sent
                    ? `**Email status: ${sent.status}**${sent.sent_at ? "\n\nAccepted by the mail server at " + new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(sent.sent_at)) + " IST. Mailbox delivery is not independently verified." : ""}${sent.last_error ? "\n\n" + sent.last_error : ""}`
                    : "No email with that ID was found for your account.",
                ["Email status " + status[1]],
            );
        } else if (cancel) {
            await client.query(
                "DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'type'='mail'",
                [user],
            );
            result = answer("Email draft cancelled. Nothing was sent.");
        } else if (confirmation) {
            if (
                !draft?.encrypted ||
                !draft.to ||
                !validMailAddress(draft.to) ||
                !draft.subject ||
                draft.token !== confirmation[1]
            )
                result = answer(
                    "This email preview expired or was replaced, or needs complete details. Review the recipient and message again.",
                );
            else if (!mailConfigured())
                result = answer(
                    "The mail service is not configured. Nothing was sent.",
                    buttons(draft),
                );
            else {
                const count = (
                    await client.query(
                        "SELECT count(*)::int AS n FROM mail_outbox WHERE actor_id=$1 AND kind IN ('offer','document') AND created_at>now()-interval '1 hour'",
                        [user],
                    )
                ).rows[0].n;
                if (count >= 20)
                    result = answer(
                        "The limit of 20 document emails per hour has been reached. Nothing was sent.",
                        buttons(draft),
                    );
                else {
                    await organizationWriteAllowed(user, client);
                    const kind =
                        draft.documentType && draft.documentType !== "offer" ? "document" : "offer";
                    const id = await queueMail(
                        kind,
                        draft.to!,
                        decryptMail(draft.encrypted),
                        `chat-offer:${user}:${draft.token}`,
                        { client, actor: user, documentType: draft.documentType },
                    );
                    if (!id)
                        result = answer(
                            "The recipient cannot receive external mail or this message was already queued. Nothing new was sent.",
                        );
                    else {
                        await client.query("DELETE FROM workspace_chat_actions WHERE user_id=$1", [
                            user,
                        ]);
                        await client.query(
                            "INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'mail.chat_queued',$3::jsonb)",
                            [randomUUID(), user, JSON.stringify({ mailId: id })],
                        );
                        result = answer(
                            `**Email queued**\n\n- **To:** ${draft.to}\n- **Subject:** ${draft.subject}\n- **Message ID:** ${id}\n\nYour exact message is queued for the mail worker. Queued does not mean delivered.`,
                            ["Email status " + id],
                        );
                    }
                }
            }
        } else {
            if (
                draft &&
                !(draft.to && draft.subject && !draft.encrypted) &&
                (/^(new chat|about me|about aiforce\.ops|assign role|team requests|create department)$/i.test(
                    text,
                ) ||
                    /^(?:create|add) (?:another |new )?department\b|^(?:approve|reject|cancel|fulfil) REQ-/i.test(
                        text,
                    ))
            ) {
                await client.query(
                    "DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'type'='mail'",
                    [user],
                );
                await client.query("COMMIT");
                return null;
            }
            const starting = command && !draft;
            if (starting) {
                draft = {
                    type: "mail",
                    token: randomUUID(),
                    to: text.match(/[^\s<>]+@[^\s<>]+\.[^\s<>,]+/)?.[0],
                };
                const role = text.match(/\brole\s*:\s*([^\n]+)/i)?.[1].trim();
                if (role && role.length <= 160) draft.subject = "Offer Letter – " + role;
                if (
                    initial?.subject &&
                    initial.subject.length <= 200 &&
                    !/[\r\n]/.test(initial.subject)
                )
                    draft.subject = initial.subject;
            }
            if (!draft) {
                await client.query("COMMIT");
                return answer(
                    "No active email draft exists. Say Send an offer email to [recipient address] to start.",
                );
            }
            if (edit) {
                draft.token = randomUUID();
                if (edit[1].toLowerCase() === "recipient") {
                    draft.to = undefined;
                    result = answer("What is the replacement recipient email address?", [
                        "Cancel email",
                    ]);
                } else if (edit[1].toLowerCase() === "subject") {
                    draft.subject = undefined;
                    result = answer("What is the replacement subject?", ["Cancel email"]);
                } else {
                    draft.encrypted = undefined;
                    result = answer(
                        "Paste the complete replacement email body exactly as you want it sent.",
                        buttons(draft),
                    );
                }
            } else if (draft.encrypted && !draft.to) {
                if (validMailAddress(text)) {
                    draft.to = text;
                    result = preview(draft);
                } else
                    result = answer("Enter one valid recipient email address.", ["Cancel email"]);
            } else if (draft.encrypted && !draft.subject) {
                if (text.length <= 200 && !/[\r\n]/.test(text)) {
                    draft.subject = text;
                    draft.encrypted = encryptMail({
                        ...decryptMail(draft.encrypted),
                        subject: text,
                    });
                    result = preview(draft);
                } else
                    result = answer("Enter a subject of up to 200 characters on one line.", [
                        "Cancel email",
                    ]);
            } else if (draft.encrypted) {
                result = preview(draft);
            } else if (!draft.to) {
                if (!starting && validMailAddress(text)) draft.to = text;
                result = answer(
                    draft.to
                        ? "What subject should this email have?"
                        : "What is the recipient email address?",
                    buttons(draft),
                );
            } else if (!validMailAddress(draft.to)) {
                draft.to = undefined;
                result = answer("Enter one valid recipient email address.", buttons(draft));
            } else if (!draft.subject) {
                if (!starting && text.length <= 200 && !/[\r\n]/.test(text)) draft.subject = text;
                result = answer(
                    draft.subject
                        ? "Paste the complete email body exactly as you want it sent. No salary, start date or attachment will be invented."
                        : "Enter a subject of up to 200 characters on one line.",
                    buttons(draft),
                );
            } else if (starting) {
                result = answer(
                    `**To:** ${draft.to}\n\n**Subject:** ${draft.subject}\n\nPaste the complete email body exactly as you want it sent. I will show a preview before sending.`,
                    buttons(draft),
                );
            } else if (!text || input.length > 12000) {
                result = answer("Enter the email body within 12,000 characters.", buttons(draft));
            } else if (!mailConfigured()) {
                result = answer(
                    "The mail service is not configured. Nothing was sent.",
                    buttons(draft),
                );
            } else {
                const content: MailContent = {
                    subject: draft.subject,
                    text: input,
                    html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f5f6fb;font-family:Arial,sans-serif;color:#263247"><div style="max-width:600px;margin:auto;padding:32px;background:white;border:1px solid #e5e7f0;border-radius:16px"><div style="font-size:22px;font-weight:bold;color:#6255e8;margin-bottom:24px">AIForce.Ops</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.7">${escapeMail(input)}</div></div></body></html>`,
                };
                draft.encrypted = encryptMail(content);
                result = preview(draft);
            }
            await client.query(
                "INSERT INTO workspace_chat_actions(user_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET draft=excluded.draft,expires_at=now()+interval '10 minutes'",
                [user, JSON.stringify(draft)],
            );
        }
        await client.query("COMMIT");
        return result;
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}
