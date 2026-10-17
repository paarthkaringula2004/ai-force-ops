import { organizationWriteAllowed } from "./organization-security";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { WorkspaceAccess } from "./workspace-permissions";
import {
    allocateLeave,
    availablePaidLeave,
    leaveDates,
    leavePayroll,
    leaveUsage,
    localLeaveDate,
    monthlyPaidLeaveDays,
    parseLeavePeriod,
    type LeavePeriod,
} from "./leave-policy";
import { queueLeaveEvent } from "./mail-events";
import { mailConfigured } from "./mail";
import type { LeaveAiIntent } from "./leave-ai-intent";

type Conversation = { id: string; kind: string; fields: Record<string, string> };
const reply = (text: string, choices: string[] = []) => ({
    reply: text,
    choices,
    responseMode: "employee" as const,
    recordedAt: new Date().toISOString(),
});
export function leaveRequestMessage(
    name: string,
    type: string,
    dates: string,
    reason: string,
    unpaid: number,
) {
    return {
        subject: `${type} ${unpaid ? "request" : "confirmation"} · ${dates.split(" · ")[0]} · ${name}`,
        body: `${unpaid ? "Dear Reviewer," : "Hello " + name + ","}\n\n${unpaid ? `${name} requests ${type.toLowerCase()} for ${dates}.` : `Your ${type.toLowerCase()} for ${dates} is covered by your available paid-leave balance, including carried-over days.`}\n\n${reason}\n\n${unpaid ? "This request exceeds the available paid-leave allowance. Please review the dates and decide whether the additional leave should remain unpaid or be granted as a paid exception." : "This paid leave is automatically approved under the monthly entitlement; no Manager approval is required."}\n\nKind regards,\nAIForce.Ops`,
    };
}
export async function leaveConversation(
    client: PoolClient,
    user: string,
    name: string,
    input: string,
    member: WorkspaceAccess,
    current?: Conversation,
    ai?: LeaveAiIntent,
) {
    const text = input.trim();
    if (ai?.mode === "other") return null;
    if (
        !ai &&
        (/\b(?:about me|my profile|who am i|team requests|employee services|capabilities)\b/i.test(
            text,
        ) ||
            /^(?:hi|hello|hey|thanks|thank you)[!. ]*$/i.test(text))
    )
        return null;
    const balance = ai
        ? ai.mode === "balance"
        : /\b(?:leave balance|paid leaves?(?: days?)? (?:left|remaining|available)|remaining (?:paid )?leaves?(?: days?)?|how many (?:paid )?leaves?(?: days?)?.*(?:left|remaining|available|do i have))\b/i.test(
              text,
          );
    if (
        !ai &&
        !balance &&
        /\b(?:status|approved|rejected|my requests|who.*approve|did.*(?:approve|reject)|REQ-[A-Z0-9-]+)\b/i.test(
            text,
        )
    )
        return null;
    const submitting = ai
        ? ai.mode === "confirm"
        : /^(?:confirm leave|submit request|confirm submission|send (?:it|this|the request)|yes[,! ]*(?:send|submit|confirm)(?: it)?)[.! ]*$/i.test(
              text,
          );
    const sameReason =
        /\b(?:same reason|same (?:medical|health) reason|same as (?:before|last time))\b/i.test(
            text,
        );
    const sameLeave =
        sameReason ||
        /\b(?:same (?:leave|type)|another (?:day|leave).*same|extend (?:it|my leave|the leave))\b/i.test(
            text,
        );
    const intent =
        /\b(?:leave|holiday|vacation|time off)\b/i.test(text) &&
        !/\b(status|approved|rejected|who.*approve)\b/i.test(text);
    if (
        !ai &&
        current?.kind !== "leave" &&
        !intent &&
        !balance &&
        !sameLeave &&
        !/^confirm leave[.! ]*$/i.test(text)
    )
        return null;
    if (!member.active)
        return reply("Your employee access is inactive. Please contact your Admin.");
    if (member.role === "user")
        return reply(
            "Leave entitlement is available to staff accounts. Contact your Admin to confirm your employee role.",
        );
    if (ai?.mode === "clarify")
        return reply(ai.question || "Which leave dates or earlier request do you mean?");
    if (
        ai?.mode === "confirm" &&
        (!/\b(?:yes|confirm|submit|send|proceed|go ahead)\b/i.test(text) ||
            /\b(?:not|don't|do not|never|without|if|whether)\b|\?/i.test(text))
    )
        return reply(
            "Nothing has been submitted. Tell me when you are ready to send it, or what you would like to change.",
        );
    if (balance) {
        const { used, unknown, startMonth } = await leaveUsage(client, user),
            month = localLeaveDate().slice(0, 7);
        return reply(
            unknown
                ? "Some earlier leave records have unclear dates. Your Manager or Admin must reconcile them before I can confirm your paid balance."
                : `You have **${availablePaidLeave(startMonth, month, used)} paid leave days available for ${month}**, including unused leave carried forward. You earn ${monthlyPaidLeaveDays} days each month; unused days carry forward without expiring. Future reservations are already accounted for. Eligible paid leave is approved automatically. Additional days need ${member.role === "manager" ? "Admin" : "Manager or Admin"} review as unpaid leave.`,
            ["Apply for leave", "My requests"],
        );
    }
    if (current && current.kind !== "leave")
        return reply(
            "You have another request in progress. Cancel that request before starting leave.",
            ["Cancel request"],
        );
    if (submitting && !current)
        return reply(
            "There is no leave request ready to confirm. Tell me the leave dates you need.",
        );
    if (
        ai?.mode === "cancel" ||
        /^(?:cancel|cancel request|start over|new chat)[.! ]*$/i.test(text)
    ) {
        await client.query("DELETE FROM employee_playground_drafts WHERE user_id=$1", [user]);
        return reply(
            "Okay, this leave request has been cancelled. Your submitted requests are unchanged.",
        );
    }
    const conversation = current || { id: randomUUID(), kind: "leave", fields: {} };
    if (/^(?:edit request|change details)$/i.test(text))
        return reply(
            "Tell me what to change—for example, “make it next Monday” or “change to half day”.",
        );
    const fields = conversation.fields;
    if (fields.dates && !fields.leaveStart) {
        const prior = parseLeavePeriod(fields.dates);
        if (prior) {
            fields.leaveStart = prior.start;
            fields.leaveEnd = prior.end;
            fields.leaveDays = String(prior.days);
            fields.halfDay = String(prior.halfDay);
        }
    }
    if (ai?.mode === "leave") {
        if (ai.type) fields.type = ai.type;
        if (ai.reason) fields.reason = ai.reason;
        if (ai.start) {
            const parsed = parseLeavePeriod(
                ai.start + " to " + (ai.end || ai.start) + (ai.halfDay ? " half day" : ""),
            );
            if (!parsed)
                return reply(
                    "Those leave dates could not be validated. Please give the starting and ending dates.",
                );
            fields.leaveStart = parsed.start;
            fields.leaveEnd = parsed.end;
            fields.leaveDays = String(parsed.days);
            fields.halfDay = String(parsed.halfDay);
            fields.dates = leaveDates(parsed);
        } else if (
            ai.halfDay !== null &&
            fields.leaveStart &&
            fields.leaveStart === fields.leaveEnd
        ) {
            fields.halfDay = String(ai.halfDay);
            fields.leaveDays = ai.halfDay ? "0.5" : "1";
        }
    }
    if (!ai && !submitting && !/\b(?:resume|continue).*\brequest\b/i.test(text)) {
        let previous: Record<string, string> | undefined;
        if (sameLeave) {
            previous = (
                await client.query(
                    "SELECT details FROM employee_service_requests WHERE user_id=$1 AND kind='leave' AND status IN ('approved','fulfilled','pending_approval') ORDER BY created_at DESC,updated_at DESC LIMIT 1",
                    [user],
                )
            ).rows[0]?.details;
            if (!fields.type && previous?.type) fields.type = previous.type;
            if (sameReason && previous?.reason) fields.reason = previous.reason;
        }
        if (/\bannual\b/i.test(text)) fields.type = "Annual leave";
        else if (/\b(?:restricted holiday|rh)\b/i.test(text)) fields.type = "Restricted holiday";
        else if (/\b(?:sick|unwell|not feeling well|ill|doctor|medical)\b/i.test(text))
            fields.type = "Sick leave";
        else if (/\bother leave\b/i.test(text)) fields.type = "Other leave";
        let referenceDate: string | undefined =
            fields.leaveEnd ||
            (previous ? parseLeavePeriod(String(previous.dates || ""))?.end : undefined);
        if (
            !referenceDate &&
            /\b(?:the )?(?:next|following) day\b|\bday after (?:that|it)\b/i.test(text)
        ) {
            const recent = (
                await client.query(
                    "SELECT details FROM employee_service_requests WHERE user_id=$1 AND kind='leave' AND status IN ('approved','fulfilled','pending_approval') ORDER BY created_at DESC LIMIT 20",
                    [user],
                )
            ).rows;
            const today = localLeaveDate();
            const horizon = new Date(today + "T12:00:00Z");
            horizon.setUTCDate(horizon.getUTCDate() + 31);
            referenceDate = recent
                .map((row) => parseLeavePeriod(String(row.details.dates || "")))
                .find(
                    (period) =>
                        period &&
                        period.end >= today &&
                        period.start <= horizon.toISOString().slice(0, 10),
                )?.end;
        }
        const parsed = parseLeavePeriod(text, new Date(), referenceDate);
        if (parsed) {
            fields.leaveStart = parsed.start;
            fields.leaveEnd = parsed.end;
            fields.leaveDays = String(parsed.days);
            fields.halfDay = String(parsed.halfDay);
            fields.dates = leaveDates(parsed);
        } else if (
            /\bhalf[ -]?day\b/i.test(text) &&
            fields.leaveStart === fields.leaveEnd &&
            fields.leaveStart
        ) {
            fields.leaveDays = "0.5";
            fields.halfDay = "true";
        } else if (
            /\bfull[ -]?day\b/i.test(text) &&
            fields.leaveStart === fields.leaveEnd &&
            fields.leaveStart
        ) {
            fields.leaveDays = "1";
            fields.halfDay = "false";
        }
        if (/\b(?:unwell|not feeling well|sick|ill|doctor|medical)\b/i.test(text))
            fields.reason = "Health-related leave is requested to allow time for recovery.";
        else if (/\b(?:stress(?:ed)?|exhausted|rest|burnt out|burned out)\b/i.test(text))
            fields.reason = "Leave is requested for rest and recovery.";
        else if (/\b(?:personal|family)\b/i.test(text))
            fields.reason = "Leave is requested for personal commitments.";
        else if (!sameReason && /\b(?:because|due to|reason)\b/i.test(text))
            fields.reason =
                "Reason provided: " +
                text.replace(/^.*?\b(?:because|due to|reason[: ]*)\s*/i, "").slice(0, 500);
        else if (
            !sameLeave &&
            fields.leaveStart &&
            !parsed &&
            !/^(?:annual leave|restricted holiday|other leave|apply for leave)$/i.test(text) &&
            text.length < 1000
        )
            fields.reason = "Reason provided: " + text;
        if (sameReason && !previous?.reason && !current?.fields.reason)
            return reply(
                "I could not find an earlier leave reason to reuse. What reason should I use for this leave?",
            );
    }
    fields.reason = fields.reason || "Leave is requested for personal reasons.";
    await client.query(
        "INSERT INTO employee_playground_drafts(user_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET draft=EXCLUDED.draft,updated_at=now()",
        [user, JSON.stringify(conversation)],
    );
    if (!fields.type)
        return reply(
            "Which leave type do you need? You can include the dates in the same message.",
            ["Annual leave", "Sick leave", "Restricted holiday", "Other leave"],
        );
    if (!fields.leaveStart)
        return reply(
            "When would you like to take leave? You can say “tomorrow”, “next Monday”, or a date range. Full day is the default; mention half day if needed.",
        );
    const period: LeavePeriod = {
        start: fields.leaveStart,
        end: fields.leaveEnd,
        days: Number(fields.leaveDays),
        halfDay: fields.halfDay === "true",
    };
    fields.dates = leaveDates(period);
    if (period.start < localLeaveDate())
        return reply(
            "Those dates are in the past. Tell me the dates for this leave request, or use attendance correction for a past absence.",
        );
    await client.query("SELECT pg_advisory_xact_lock(8470220029)");
    const allocation = await allocateLeave(client, user, period);
    const paid = allocation.allocations.reduce((sum, item) => sum + item.paid, 0),
        unpaid = period.days - paid;
    const payroll = await leavePayroll(client, user, allocation.allocations);
    const manager =
        member.role === "manager"
            ? "an Admin"
            : member.manager_name || "an Admin (reporting manager is not assigned)";
    const email = leaveRequestMessage(name, fields.type, fields.dates, fields.reason, unpaid);
    fields.leaveMailSubject = email.subject;
    fields.leaveMailBody = email.body;
    const previousAllocation = fields.leaveAllocations;
    fields.leaveAllocations = JSON.stringify(allocation.allocations);
    fields.paidDays = String(paid);
    fields.unpaidDays = String(unpaid);
    fields.payType = unpaid === 0 ? "paid" : paid === 0 ? "unpaid" : "mixed";
    fields.payrollEstimate = JSON.stringify(payroll);
    fields.payrollStatus = unpaid ? "Pending reviewer decision" : "No deduction";
    fields.approvalRoute = member.role === "manager" ? "admin" : "manager_or_admin";
    fields.leavePolicy = "monthly-2-carry-forward-v2";
    fields.monthlyPaidRemaining = Object.entries(allocation.remaining)
        .map(([month, value]) => `${month}: ${value}`)
        .join("; ");
    const deduction = payroll
        ?.filter((item) => item.unpaidDays > 0)
        .map(
            (item) =>
                `${item.currency} ${item.deduction.toFixed(2)} (${item.month}; salary ÷ ${item.divisor} × ${item.unpaidDays})`,
        )
        .join("; ");
    await client.query(
        "UPDATE employee_playground_drafts SET draft=$2::jsonb,updated_at=now() WHERE user_id=$1",
        [user, JSON.stringify(conversation)],
    );
    if (!submitting || previousAllocation !== fields.leaveAllocations) {
        return reply(
            `${submitting ? "Your balance changed since the preview. Please review the updated details." : "Okay—here is your leave preview."}\n\n**Name:** ${name}\n**Leave:** ${fields.type}\n**Dates:** ${fields.dates}\n**Paid days:** ${paid}\n**Unpaid days:** ${unpaid}\n**Paid days left after confirmation:** ${fields.monthlyPaidRemaining}\n**Policy:** 2 days per month; unused days carry forward.\n**Review:** ${unpaid ? manager : "Automatic approval; no Manager approval needed"}${allocation.unknown ? "\n**Balance check:** Earlier leave dates need reconciliation; this request requires review." : ""}\n**Estimated salary deduction:** ${unpaid ? deduction || "Not calculated—your monthly salary needs to be configured." : "None"}\n\n**Mail preview**\n**Subject:** ${email.subject}\n\n${email.body}\n\n${unpaid ? "The reviewer can grant a paid exception or approve unpaid leave. The estimate is not a completed payroll deduction. Tell me when you are ready to send this request." : "If these details look right, tell me to record your paid leave."}`,
            ["Confirm leave", "Edit request", "Cancel request"],
        );
    }
    const existing = (
        await client.query(
            "SELECT request_number,details FROM employee_service_requests WHERE user_id=$1 AND kind='leave' AND status IN ('pending_approval','approved','fulfilled')",
            [user],
        )
    ).rows;
    if (
        existing.some((row) => {
            const other = parseLeavePeriod(String(row.details.dates || ""));
            return other && other.start <= period.end && other.end >= period.start;
        })
    )
        return reply(
            "You already have a leave request covering these dates. Open My Requests to review or cancel it before creating another.",
            ["My requests"],
        );
    await organizationWriteAllowed(user, client);
    const number = `REQ-${conversation.id.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        status = unpaid ? "pending_approval" : "approved";
    await client.query(
        "INSERT INTO employee_service_requests(id,user_id,request_number,kind,details,status,decision_note) VALUES($1,$2,$3,'leave',$4::jsonb,$5,$6)",
        [
            conversation.id,
            user,
            number,
            JSON.stringify(fields),
            status,
            unpaid ? "" : "Automatically approved under the monthly paid-leave policy.",
        ],
    );
    await client.query(
        "INSERT INTO workspace_audit(id,actor_id,target_id,request_id,action,details) VALUES($1,$2,$2,$3,$4,$5::jsonb)",
        [
            randomUUID(),
            user,
            conversation.id,
            unpaid ? "leave.submitted" : "leave.auto_approved",
            JSON.stringify({
                paidDays: paid,
                unpaidDays: unpaid,
                allocations: allocation.allocations,
                policy: fields.leavePolicy,
            }),
        ],
    );
    await queueLeaveEvent(client, conversation.id);
    await client.query("DELETE FROM employee_playground_drafts WHERE user_id=$1", [user]);
    return reply(
        `${unpaid ? "Your leave request has been submitted for review." : "Your paid leave is approved."}\n\n**Request:** ${number}\n**Dates:** ${fields.dates}\n**Paid / unpaid days:** ${paid} / ${unpaid}\n**Paid days remaining:** ${fields.monthlyPaidRemaining}\n\n${unpaid ? `${manager} will review the unpaid days and may grant a paid exception. Any approved deduction is recorded for payroll review.` : "No Manager approval was needed."} ${mailConfigured() ? "Email notifications are queued; delivery is tracked separately." : "Email delivery is not configured. The request is recorded in AIForce.Ops."}`,
        ["My requests"],
    );
}
