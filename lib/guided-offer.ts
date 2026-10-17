import { escapeMail, type MailContent } from "./mail-templates";
export type GuidedOffer = {
    name?: string;
    email?: string;
    role?: string;
    department?: string;
    employmentType?: string;
    location?: string;
    joiningDate?: string;
    reportingManager?: string;
    compensation?: string;
    note?: string;
};
export type OfferContact = { name: string; email: string; phone: string };
export const offerFields = [
    "name",
    "email",
    "role",
    "department",
    "employmentType",
    "location",
    "joiningDate",
    "reportingManager",
    "compensation",
    "note",
] as const;
export type OfferField = (typeof offerFields)[number];
export const offerLabels: Record<OfferField, string> = {
    name: "Candidate name",
    email: "Candidate email",
    role: "Position",
    department: "Department",
    employmentType: "Employment type",
    location: "Work location / arrangement",
    joiningDate: "Joining date",
    reportingManager: "Reporting manager",
    compensation: "Approved compensation",
    note: "Additional note",
};
export const offerQuestions: Record<OfferField, string> = {
    name: "What is the candidate’s full name?",
    email: "What is the candidate’s email address?",
    role: "Which position are you offering?",
    department: "Which company department will they join?",
    employmentType: "What is the employment type?",
    location: "Where will they work? Choose an arrangement or enter the office location.",
    joiningDate: "What is the joining date? Enter YYYY-MM-DD, for example 2026-11-02.",
    reportingManager: "Who will be their reporting manager?",
    compensation:
        "What is the approved compensation? Include currency and period, for example INR 8 lakh per annum or INR 40,000 per month.",
    note: "Would you like to include a short additional note? Enter it, or choose No additional note.",
};
export function missingOfferField(fields: GuidedOffer) {
    return offerFields.find(
        (key) => fields[key] === undefined || (!fields[key]?.trim() && key !== "note"),
    );
}
export function offerFieldError(field: OfferField, value: string) {
    if (field === "note" && value === "") return null;
    if (!value.trim() || value.length > (field === "note" ? 2000 : 300))
        return "Enter a value within " + (field === "note" ? "2,000" : "300") + " characters.";
    if (field !== "note" && /[\r\n]/.test(value)) return "Enter this detail on one line.";
    if (field === "email" && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value))
        return "Enter one valid recipient email address.";
    if (field === "joiningDate") {
        const parsed = new Date(value + "T00:00:00Z");
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== value
        )
            return "Enter a valid joining date in YYYY-MM-DD format.";
    }
    if (
        field === "employmentType" &&
        !["Full-time", "Part-time", "Fixed-term", "Contract", "Internship"].includes(value)
    )
        return "Choose an employment type from the buttons.";
    if (
        field === "compensation" &&
        !/unpaid internship/i.test(value) &&
        (!/(?:\bINR\b|₹|\bUSD\b|\$|\bEUR\b|€|\bGBP\b|£)/i.test(value) ||
            !/(?:annum|annual|year|month|week|hour|\blpa\b)/i.test(value))
    )
        return "Include the approved amount, currency and pay period. For example INR 40,000 per month.";
    return null;
}
export function guidedOfferMail(
    fields: GuidedOffer,
    contact: OfferContact,
    reference: string,
    issuedAt = new Date(),
): MailContent {
    if (missingOfferField(fields))
        throw new Error("Complete the offer details before generating the letter.");
    if (!contact.name || !contact.email || !contact.phone)
        throw new Error("Complete the sending Admin’s profile contact details first.");
    const date = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "long",
        timeZone: "Asia/Kolkata",
    }).format(issuedAt);
    const values: [string, string][] = [
        ["Position", fields.role!],
        ["Department", fields.department!],
        ["Employment type", fields.employmentType!],
        ["Work location / arrangement", fields.location!],
        ["Joining date", fields.joiningDate!],
        ["Reporting manager", fields.reportingManager!],
        ["Approved compensation", fields.compensation!],
    ];
    const intro = `Dear ${fields.name},\n\nWe are pleased to offer you the position of ${fields.role} at AIForce.Ops. We look forward to the skills, ideas and commitment you will bring to our team.`;
    const steps =
        "Please reply to confirm your acceptance of this offer. Following your acceptance, our team will contact you with the required onboarding documents and joining instructions. Any additional employment terms and applicable policies will be communicated separately.";
    const closing = `Kind regards,\n${contact.name}\nAuthorized Representative\nAIForce.Ops\n\nContact us\nEmail: ${contact.email}\nPhone: ${contact.phone}`;
    const text = `AIForce.Ops\nIntelligent Service Operations\n\nEMPLOYMENT OFFER\nReference: ${reference}\nDate: ${date}\n\n${intro}\n\nEmployment details\n${values.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nAcceptance and next steps\n${steps}${fields.note ? "\n\nAdditional information\n" + fields.note : ""}\n\nWe look forward to welcoming you to our team.\n\n${closing}`;
    const p = (s: string) =>
        `<p style="margin:0 0 18px;font-size:14px;line-height:1.8;white-space:pre-wrap">${escapeMail(s)}</p>`;
    return {
        replyTo: contact.email,
        subject: `Employment Offer — ${fields.role} | AIForce.Ops`,
        text,
        html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f6fb;color:#263247;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:auto;background:white;border:1px solid #e5e7f0;border-radius:16px"><tr><td style="padding:28px 32px;border-bottom:1px solid #ececf5"><div style="font-size:25px;font-weight:bold;color:#6255e8">AIForce.Ops</div><div style="margin-top:6px;font-size:12px;color:#78849a">Intelligent Service Operations</div></td></tr><tr><td style="padding:32px"><h1 style="font-size:22px;margin:0 0 12px">Employment Offer</h1>${p(`Reference: ${reference}\nDate: ${date}`)}${p(intro)}<h2 style="font-size:16px;margin:24px 0 12px">Employment details</h2><table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse;font-size:14px">${values.map(([k, v]) => `<tr><td style="padding:12px;border-bottom:1px solid #e9edf3;color:#78849a;width:40%">${escapeMail(k)}</td><td style="padding:12px;border-bottom:1px solid #e9edf3">${escapeMail(v)}</td></tr>`).join("")}</table><h2 style="font-size:16px;margin:26px 0 12px">Acceptance and next steps</h2>${p(steps)}${fields.note ? '<h2 style="font-size:16px">Additional information</h2>' + p(fields.note) : ""}${p("We look forward to welcoming you to our team.")}${p(`Kind regards,\n${contact.name}\nAuthorized Representative\nAIForce.Ops`)}<div style="border-top:1px solid #ececf5;margin-top:24px;padding-top:20px"><h2 style="font-size:16px;margin:0 0 12px">Contact us</h2>${p(`Email: ${contact.email}\nPhone: ${contact.phone}`)}</div></td></tr></table></td></tr></table></body></html>`,
    };
}
