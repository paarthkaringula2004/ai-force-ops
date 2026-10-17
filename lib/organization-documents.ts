import { defaultOfferSubject, defaultOfferTemplate } from "./offer-template";
import { offerFieldError, type OfferContact, type OfferField } from "./guided-offer";

export type DocumentValues = Record<string, string>;
type Field = {
    label: string;
    input?: "date" | "email" | "multiline" | "department" | "position" | "manager";
    options?: string[];
    placeholder?: string;
    optional?: boolean;
};
export const documentFields = {
    name: { label: "Employee / recipient name", placeholder: "Full name" },
    email: { label: "Recipient email", input: "email", placeholder: "recipient@example.com" },
    role: { label: "Position", input: "position" },
    department: { label: "Department", input: "department" },
    employmentType: {
        label: "Employment type",
        options: ["Full-time", "Part-time", "Fixed-term", "Contract", "Internship"],
    },
    location: { label: "Work location / arrangement", placeholder: "Hybrid · Hyderabad" },
    joiningDate: { label: "Joining date", input: "date" },
    reportingManager: { label: "Reporting manager", input: "manager" },
    compensation: { label: "Approved compensation", placeholder: "INR 4 lakh per annum" },
    note: { label: "Additional information", input: "multiline", optional: true },
    employeeId: { label: "Employee ID" },
    roleSummary: { label: "Role summary", input: "multiline" },
    responsibilities: { label: "Key responsibilities", input: "multiline" },
    requiredSkills: { label: "Required skills and experience", input: "multiline" },
    qualifications: { label: "Required qualifications", input: "multiline" },
    effectiveDate: { label: "Effective date", input: "date" },
    probationPeriod: { label: "Approved probation period", placeholder: "As approved by HR" },
    noticePeriod: { label: "Approved notice period", placeholder: "As approved by HR" },
    workingHours: { label: "Approved working hours" },
    terms: { label: "Approved terms and conditions", input: "multiline" },
    scope: { label: "Confidential information / agreement scope", input: "multiline" },
    duration: { label: "Confidentiality duration" },
    onboardingTasks: { label: "Joining tasks and required documents", input: "multiline" },
    policyVersion: { label: "Policy / handbook version" },
    policyName: { label: "Policy name" },
    policyContent: { label: "Approved policy / handbook content", input: "multiline" },
    acknowledgeBy: { label: "Acknowledgment deadline", input: "date" },
    confirmationDate: { label: "Probation completion / confirmation date", input: "date" },
    verificationPurpose: { label: "Purpose of employment verification" },
    employmentStatus: {
        label: "Employment status",
        options: ["Currently employed", "Former employee"],
    },
    changeType: {
        label: "Employment change",
        options: ["Promotion", "Department transfer", "Location transfer", "Role change"],
    },
    previousRole: { label: "Previous position" },
    previousDepartment: { label: "Previous department", input: "department" },
    currentCompensation: {
        label: "Current approved compensation",
        placeholder: "INR 4 lakh per annum",
    },
    changeReason: { label: "Approved reason / basis for change", input: "multiline" },
    reviewStart: { label: "Review period start", input: "date" },
    reviewEnd: { label: "Review period end", input: "date" },
    performanceConcerns: { label: "Documented performance concerns", input: "multiline" },
    improvementGoals: { label: "Measurable improvement goals", input: "multiline" },
    supportPlan: { label: "Training and support plan", input: "multiline" },
    reviewSchedule: { label: "Review checkpoints", input: "multiline" },
    disciplinaryAction: {
        label: "Disciplinary action",
        options: ["Written warning", "Final written warning", "Disciplinary notice"],
    },
    incidentDate: { label: "Incident date", input: "date" },
    incidentDetails: { label: "Verified incident details", input: "multiline" },
    policyReference: { label: "Applicable policy and clause" },
    correctiveAction: { label: "Required corrective action", input: "multiline" },
    responseDeadline: { label: "Response / corrective-action deadline", input: "date" },
    resignationDate: { label: "Resignation received date", input: "date" },
    lastWorkingDate: { label: "Last working date", input: "date" },
    handover: { label: "Handover and clearance requirements", input: "multiline" },
    clearanceStatus: { label: "Approved clearance status", input: "multiline" },
    serviceSummary: { label: "Verified service and responsibilities", input: "multiline" },
    grossPay: { label: "Approved gross dues", placeholder: "INR 50,000" },
    adjustments: { label: "Approved additions / adjustments", input: "multiline" },
    deductions: { label: "Approved deductions", input: "multiline" },
    settlementAmount: { label: "Approved net settlement", placeholder: "INR 45,000" },
    paymentDate: { label: "Scheduled settlement payment date", input: "date" },
} satisfies Record<string, Field>;
export type DocumentFieldKey = keyof typeof documentFields;
export const documentField = (key: DocumentFieldKey): Field => documentFields[key];

const identity: DocumentFieldKey[] = ["name", "email"];
const employee: DocumentFieldKey[] = [...identity, "employeeId", "role", "department"];
const table = (rows: [string, string][]) =>
    "| Particular | Details |\n| --- | --- |\n" +
    rows.map(([label, field]) => `| ${label} | {{${field}}} |`).join("\n");
function letter(title: string, introduction: string, content: string, nextSteps: string) {
    return `# AIForce.Ops

Intelligent Service Operations

## ${title}

Reference: {{reference}}  
Date: {{date}}

Dear {{name}},

${introduction}

${content}

## Next steps

${nextSteps}

{{note}}

Kind regards,  
{{adminName}}  
Authorized Representative  
AIForce.Ops

## Contact us

Email: {{adminEmail}}  
Phone: {{adminPhone}}`;
}
type Definition = {
    id: string;
    label: string;
    group: "Hiring" | "Joining" | "Employment" | "Leaving";
    prefix: string;
    fields: DocumentFieldKey[];
    subject: string;
    markdown: string;
    aliases: string[];
};
export const organizationDocuments = [
    {
        id: "job_description",
        label: "Job Description",
        group: "Hiring",
        prefix: "JD",
        fields: [
            ...identity,
            "role",
            "department",
            "employmentType",
            "location",
            "reportingManager",
            "roleSummary",
            "responsibilities",
            "requiredSkills",
            "qualifications",
            "note",
        ],
        subject: "Job Description — {{role}} | AIForce.Ops",
        aliases: ["job description"],
        markdown: letter(
            "Job Description",
            "Please find the approved role profile for **{{role}}** at AIForce.Ops. This document describes the scope, expectations and selection criteria for the position.",
            table([
                ["Position", "role"],
                ["Department", "department"],
                ["Employment type", "employmentType"],
                ["Location", "location"],
                ["Reports to", "reportingManager"],
            ]) +
                "\n\n## Role overview\n\n{{roleSummary}}\n\n## Responsibilities\n\n{{responsibilities}}\n\n## Skills and experience\n\n{{requiredSkills}}\n\n## Qualifications\n\n{{qualifications}}",
            "Please contact the representative below for role-related questions or application instructions. An employment offer will be issued separately following the selection process.",
        ),
    },
    {
        id: "offer",
        label: "Offer Letter",
        group: "Hiring",
        prefix: "OFR",
        fields: [
            ...identity,
            "role",
            "department",
            "employmentType",
            "location",
            "joiningDate",
            "reportingManager",
            "compensation",
            "note",
        ],
        subject: defaultOfferSubject,
        markdown: defaultOfferTemplate,
        aliases: ["offer letter", "employment offer"],
    },
    {
        id: "employment_contract",
        label: "Employment Contract",
        group: "Hiring",
        prefix: "CTR",
        fields: [
            ...employee,
            "employmentType",
            "location",
            "joiningDate",
            "reportingManager",
            "compensation",
            "workingHours",
            "probationPeriod",
            "noticePeriod",
            "terms",
            "note",
        ],
        subject: "Employment Contract — {{name}} | AIForce.Ops",
        aliases: ["employment contract", "employment agreement"],
        markdown: letter(
            "Employment Contract",
            "This document records the approved terms of employment between AIForce.Ops and **{{name}}**. Please review the details and agreement terms below.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Employment type", "employmentType"],
                ["Location", "location"],
                ["Commencement date", "joiningDate"],
                ["Reports to", "reportingManager"],
                ["Compensation", "compensation"],
                ["Working hours", "workingHours"],
                ["Probation period", "probationPeriod"],
                ["Notice period", "noticePeriod"],
            ]) + "\n\n## Terms of agreement\n\n{{terms}}",
            "Please review and return your signed acceptance through the agreed signing process. The organization will provide the executed agreement for your records. Any changes to these terms require written approval.",
        ),
    },
    {
        id: "confidentiality",
        label: "Confidentiality Agreement",
        group: "Hiring",
        prefix: "NDA",
        fields: [...identity, "effectiveDate", "scope", "duration", "terms", "note"],
        subject: "Confidentiality Agreement — {{name}} | AIForce.Ops",
        aliases: ["confidentiality agreement", "non-disclosure agreement", "nda"],
        markdown: letter(
            "Confidentiality Agreement",
            "In connection with your engagement with AIForce.Ops, please review the approved confidentiality requirements below.",
            table([
                ["Recipient", "name"],
                ["Effective date", "effectiveDate"],
                ["Duration", "duration"],
            ]) +
                "\n\n## Scope of confidential information\n\n{{scope}}\n\n## Approved obligations and conditions\n\n{{terms}}",
            "Please return your signed acknowledgment using the agreed process before accessing information covered by this agreement. Contact the representative below for questions about the scope or approved terms.",
        ),
    },
    {
        id: "appointment",
        label: "Appointment Letter",
        group: "Joining",
        prefix: "APT",
        fields: [
            ...employee,
            "employmentType",
            "location",
            "joiningDate",
            "reportingManager",
            "compensation",
            "probationPeriod",
            "noticePeriod",
            "note",
        ],
        subject: "Appointment Letter — {{role}} | AIForce.Ops",
        aliases: ["appointment letter"],
        markdown: letter(
            "Appointment Letter",
            "Following completion of the approved hiring formalities, we are pleased to confirm your appointment as **{{role}}** at AIForce.Ops, commencing on **{{joiningDate}}**.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Employment type", "employmentType"],
                ["Work location", "location"],
                ["Joining date", "joiningDate"],
                ["Reporting manager", "reportingManager"],
                ["Compensation", "compensation"],
                ["Probation period", "probationPeriod"],
                ["Notice period", "noticePeriod"],
            ]),
            "Please acknowledge receipt and complete the onboarding formalities provided by the organization. Your appointment is governed by the executed employment agreement and applicable company policies.",
        ),
    },
    {
        id: "onboarding",
        label: "Onboarding Checklist",
        group: "Joining",
        prefix: "ONB",
        fields: [
            ...employee,
            "joiningDate",
            "location",
            "reportingManager",
            "onboardingTasks",
            "note",
        ],
        subject: "Welcome & Onboarding — {{name}} | AIForce.Ops",
        aliases: ["onboarding checklist", "onboarding welcome", "welcome letter"],
        markdown: letter(
            "Welcome & Onboarding Checklist",
            "Welcome to AIForce.Ops. We look forward to welcoming you to the **{{department}}** team. The following checklist will help you prepare for your first day.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Joining date", "joiningDate"],
                ["Location / arrangement", "location"],
                ["Reporting manager", "reportingManager"],
            ]) + "\n\n## Your joining checklist\n\n{{onboardingTasks}}",
            "Complete the listed tasks using the approved company channels. Contact your reporting manager or the representative below if you need assistance. Please do not send passwords or verification codes by email.",
        ),
    },
    {
        id: "handbook",
        label: "Employee Handbook",
        group: "Joining",
        prefix: "HBK",
        fields: [
            ...identity,
            "policyVersion",
            "effectiveDate",
            "policyContent",
            "acknowledgeBy",
            "note",
        ],
        subject: "Employee Handbook — Version {{policyVersion}} | AIForce.Ops",
        aliases: ["employee handbook"],
        markdown: letter(
            "Employee Handbook",
            "Please review the approved AIForce.Ops employee handbook below. It sets out the company’s current workplace expectations, procedures and employee guidance.",
            table([
                ["Handbook version", "policyVersion"],
                ["Effective date", "effectiveDate"],
                ["Acknowledgment due", "acknowledgeBy"],
            ]) + "\n\n## Handbook content\n\n{{policyContent}}",
            "Please read the handbook, raise any questions with the representative below and acknowledge receipt by the stated deadline. Revisions will be communicated by the organization.",
        ),
    },
    {
        id: "policy_acknowledgment",
        label: "Policy Acknowledgment",
        group: "Joining",
        prefix: "POL",
        fields: [
            ...employee,
            "policyName",
            "policyVersion",
            "effectiveDate",
            "policyContent",
            "acknowledgeBy",
            "note",
        ],
        subject: "Policy Acknowledgment — {{policyName}} | AIForce.Ops",
        aliases: ["policy acknowledgment", "policy acknowledgement"],
        markdown: letter(
            "Policy Acknowledgment",
            "Please review **{{policyName}}** and confirm that you have received and understood the approved policy.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Policy", "policyName"],
                ["Version", "policyVersion"],
                ["Effective date", "effectiveDate"],
                ["Response due", "acknowledgeBy"],
            ]) + "\n\n## Approved policy\n\n{{policyContent}}",
            "Please submit your acknowledgment by the stated deadline through the agreed channel. Ask for clarification where needed. Sending this letter does not record your acknowledgment automatically.",
        ),
    },
    {
        id: "probation_confirmation",
        label: "Probation Confirmation",
        group: "Employment",
        prefix: "PRB",
        fields: [...employee, "joiningDate", "confirmationDate", "reportingManager", "note"],
        subject: "Probation Confirmation — {{name}} | AIForce.Ops",
        aliases: [
            "probation confirmation",
            "employment confirmation letter",
            "probation completion",
        ],
        markdown: letter(
            "Probation Confirmation",
            "Following the approved review of your probation period, we are pleased to confirm your employment as **{{role}}**, effective **{{confirmationDate}}**.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Date of joining", "joiningDate"],
                ["Confirmation date", "confirmationDate"],
                ["Reporting manager", "reportingManager"],
            ]),
            "Please acknowledge receipt. All other terms continue in accordance with your employment agreement and applicable policies unless separately amended in writing. Thank you for your contributions to AIForce.Ops.",
        ),
    },
    {
        id: "employment_verification",
        label: "Employment Verification",
        group: "Employment",
        prefix: "VER",
        fields: [
            ...employee,
            "joiningDate",
            "employmentType",
            "employmentStatus",
            "verificationPurpose",
            "note",
        ],
        subject: "Employment Verification — {{name}} | AIForce.Ops",
        aliases: ["employment verification", "employment certificate"],
        markdown: letter(
            "Employment Verification",
            "This letter confirms the following verified employment details recorded by AIForce.Ops for **{{name}}**, as of the issue date.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Date of joining", "joiningDate"],
                ["Employment type", "employmentType"],
                ["Employment status", "employmentStatus"],
                ["Purpose", "verificationPurpose"],
            ]),
            "This letter is provided for the purpose stated above. For verification queries, please contact the authorized representative using the details below.",
        ),
    },
    {
        id: "employment_change",
        label: "Promotion / Transfer Letter",
        group: "Employment",
        prefix: "CHG",
        fields: [
            ...identity,
            "employeeId",
            "changeType",
            "previousRole",
            "previousDepartment",
            "role",
            "department",
            "location",
            "reportingManager",
            "effectiveDate",
            "compensation",
            "changeReason",
            "note",
        ],
        subject: "{{changeType}} — {{name}} | AIForce.Ops",
        aliases: [
            "promotion letter",
            "transfer letter",
            "role change letter",
            "promotion / transfer letter",
        ],
        markdown: letter(
            "Employment Change",
            "We confirm the approved **{{changeType}}** to your employment assignment at AIForce.Ops, effective **{{effectiveDate}}**.",
            table([
                ["Employee ID", "employeeId"],
                ["Change type", "changeType"],
                ["Previous position", "previousRole"],
                ["Previous department", "previousDepartment"],
                ["New position", "role"],
                ["New department", "department"],
                ["Location", "location"],
                ["Reporting manager", "reportingManager"],
                ["Effective date", "effectiveDate"],
                ["Approved compensation", "compensation"],
            ]) + "\n\n## Basis and transition arrangements\n\n{{changeReason}}",
            "Please acknowledge receipt and coordinate the transition with your reporting manager. Employment terms continue as agreed except for the changes expressly recorded in this letter. System role or department changes are completed separately by the organization.",
        ),
    },
    {
        id: "salary_revision",
        label: "Salary Revision Letter",
        group: "Employment",
        prefix: "SAL",
        fields: [
            ...employee,
            "currentCompensation",
            "compensation",
            "effectiveDate",
            "changeReason",
            "note",
        ],
        subject: "Salary Revision — {{name}} | AIForce.Ops",
        aliases: ["salary revision letter", "salary increment letter", "compensation revision"],
        markdown: letter(
            "Salary Revision",
            "We are pleased to communicate the approved revision to your compensation at AIForce.Ops, effective **{{effectiveDate}}**.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Current compensation", "currentCompensation"],
                ["Revised compensation", "compensation"],
                ["Effective date", "effectiveDate"],
            ]) + "\n\n## Revision details\n\n{{changeReason}}",
            "Please acknowledge receipt. Payroll will apply the approved revision through the organization’s payroll process. Applicable components, deductions and payment schedules follow your approved compensation structure.",
        ),
    },
    {
        id: "performance_plan",
        label: "Performance Improvement Plan",
        group: "Employment",
        prefix: "PIP",
        fields: [
            ...employee,
            "reportingManager",
            "reviewStart",
            "reviewEnd",
            "performanceConcerns",
            "improvementGoals",
            "supportPlan",
            "reviewSchedule",
            "note",
        ],
        subject: "Performance Improvement Plan — {{name}} | AIForce.Ops",
        aliases: ["performance improvement plan", "pip"],
        markdown: letter(
            "Performance Improvement Plan",
            "This plan records the approved performance expectations, improvement objectives and support arrangements for the review period below. Its purpose is to provide clear goals and a structured opportunity for improvement.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Reporting manager", "reportingManager"],
                ["Review begins", "reviewStart"],
                ["Review concludes", "reviewEnd"],
            ]) +
                "\n\n## Documented concerns\n\n{{performanceConcerns}}\n\n## Measurable objectives\n\n{{improvementGoals}}\n\n## Support and resources\n\n{{supportPlan}}\n\n## Review checkpoints\n\n{{reviewSchedule}}",
            "Please review this plan with your reporting manager, clarify expectations and acknowledge receipt. Progress and outcomes will be assessed against the documented goals through the organization’s approved review process.",
        ),
    },
    {
        id: "disciplinary",
        label: "Warning / Disciplinary Letter",
        group: "Employment",
        prefix: "WRN",
        fields: [
            ...employee,
            "disciplinaryAction",
            "incidentDate",
            "incidentDetails",
            "policyReference",
            "correctiveAction",
            "responseDeadline",
            "note",
        ],
        subject: "{{disciplinaryAction}} — {{name}} | AIForce.Ops",
        aliases: [
            "warning letter",
            "disciplinary letter",
            "disciplinary notice",
            "final warning letter",
        ],
        markdown: letter(
            "Formal Workplace Notice",
            "This **{{disciplinaryAction}}** records the organization’s approved findings and required response concerning the matter described below.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Notice type", "disciplinaryAction"],
                ["Incident date", "incidentDate"],
                ["Policy reference", "policyReference"],
                ["Response deadline", "responseDeadline"],
            ]) +
                "\n\n## Documented matter\n\n{{incidentDetails}}\n\n## Required corrective action\n\n{{correctiveAction}}",
            "Please acknowledge receipt and provide your response by the stated deadline through the approved HR process. Contact the authorized representative if clarification is required. Further review will follow the applicable policy and approved procedure.",
        ),
    },
    {
        id: "resignation_acceptance",
        label: "Resignation Acceptance",
        group: "Leaving",
        prefix: "RES",
        fields: [
            ...employee,
            "resignationDate",
            "lastWorkingDate",
            "reportingManager",
            "handover",
            "note",
        ],
        subject: "Resignation Acceptance — {{name}} | AIForce.Ops",
        aliases: ["resignation acceptance"],
        markdown: letter(
            "Resignation Acceptance",
            "We acknowledge your resignation received on **{{resignationDate}}** and confirm its acceptance. Your approved last working date is **{{lastWorkingDate}}**.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Resignation received", "resignationDate"],
                ["Last working date", "lastWorkingDate"],
                ["Reporting manager", "reportingManager"],
            ]) + "\n\n## Handover and clearance\n\n{{handover}}",
            "Please coordinate your handover and required clearances with your reporting manager and HR. Final dues and separation documents will be processed through the approved procedures. Thank you for your contributions to AIForce.Ops.",
        ),
    },
    {
        id: "relieving",
        label: "Relieving Letter",
        group: "Leaving",
        prefix: "REL",
        fields: [...employee, "joiningDate", "lastWorkingDate", "clearanceStatus", "note"],
        subject: "Relieving Letter — {{name}} | AIForce.Ops",
        aliases: ["relieving letter"],
        markdown: letter(
            "Relieving Letter",
            "This letter confirms that you have been relieved from your duties as **{{role}}** at AIForce.Ops at the close of **{{lastWorkingDate}}**, in accordance with the approved separation record.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Date of joining", "joiningDate"],
                ["Last working date", "lastWorkingDate"],
            ]) + "\n\n## Clearance record\n\n{{clearanceStatus}}",
            "Please retain this letter for your records. Continuing obligations under executed agreements remain applicable according to their terms. We thank you for your service and wish you success in your future endeavors.",
        ),
    },
    {
        id: "experience",
        label: "Experience Certificate",
        group: "Leaving",
        prefix: "EXP",
        fields: [...employee, "joiningDate", "lastWorkingDate", "serviceSummary", "note"],
        subject: "Experience Certificate — {{name}} | AIForce.Ops",
        aliases: ["experience certificate", "experience letter"],
        markdown: letter(
            "Experience Certificate",
            "This is to certify that **{{name}}** was employed with AIForce.Ops from **{{joiningDate}}** to **{{lastWorkingDate}}**, with the verified employment details below.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Employment commenced", "joiningDate"],
                ["Employment concluded", "lastWorkingDate"],
            ]) + "\n\n## Verified service and responsibilities\n\n{{serviceSummary}}",
            "This certificate is issued upon request for your employment records. Please direct verification queries to the authorized representative below. We wish you success in your future career.",
        ),
    },
    {
        id: "final_settlement",
        label: "Final Settlement",
        group: "Leaving",
        prefix: "FNF",
        fields: [
            ...employee,
            "lastWorkingDate",
            "grossPay",
            "adjustments",
            "deductions",
            "settlementAmount",
            "paymentDate",
            "note",
        ],
        subject: "Final Settlement Statement — {{name}} | AIForce.Ops",
        aliases: ["final settlement", "full and final settlement"],
        markdown: letter(
            "Final Settlement Statement",
            "Please find the approved final settlement statement associated with the conclusion of your employment at AIForce.Ops.",
            table([
                ["Employee ID", "employeeId"],
                ["Position", "role"],
                ["Department", "department"],
                ["Last working date", "lastWorkingDate"],
                ["Gross dues", "grossPay"],
                ["Net amount payable", "settlementAmount"],
                ["Scheduled payment date", "paymentDate"],
            ]) +
                "\n\n## Approved additions and adjustments\n\n{{adjustments}}\n\n## Approved deductions\n\n{{deductions}}",
            "Please review the statement and contact the representative below if clarification is required. The approved payment will be processed through payroll; this statement is not proof of payment. Retain the final payment advice for your records.",
        ),
    },
] as const satisfies readonly Definition[];
export type DocumentType = (typeof organizationDocuments)[number]["id"];
export type DocumentTemplate = { markdown: string; subject: string };
export function isDocumentType(value: unknown): value is DocumentType {
    return organizationDocuments.some((doc) => doc.id === value);
}
export function documentDefinition(type: DocumentType): Definition {
    return organizationDocuments.find((doc) => doc.id === type)! as Definition;
}
const contactFields = {
    adminName: "Admin name",
    adminEmail: "Admin email",
    adminPhone: "Admin phone",
    reference: "Document reference",
    date: "Issue date",
};
export function documentTemplateFields(type: DocumentType) {
    return {
        ...Object.fromEntries(
            documentDefinition(type).fields.map((key) => [key, documentFieldLabel(type, key)]),
        ),
        ...contactFields,
    };
}
export function documentFieldLabel(type: DocumentType, key: DocumentFieldKey) {
    if (key === "name" && type === "offer") return "Candidate name";
    if (key === "name" && ["job_description", "handbook", "confidentiality"].includes(type))
        return "Recipient name";
    if (key === "name") return "Employee name";
    if (type === "employment_change" && key === "role") return "New position";
    if (type === "employment_change" && key === "department") return "New department";
    if (["employment_change", "salary_revision"].includes(type) && key === "compensation")
        return "Approved new compensation";
    return documentField(key).label;
}
export function validateDocumentTemplate(
    type: DocumentType,
    markdown: unknown,
    subject: unknown,
): DocumentTemplate {
    if (
        typeof markdown !== "string" ||
        !markdown.trim() ||
        markdown.length > 12000 ||
        typeof subject !== "string" ||
        !subject.trim() ||
        subject.length > 300 ||
        /[\r\n]/.test(subject)
    )
        throw new Error("Enter a template and single-line subject within the editor limits.");
    const allowed = documentTemplateFields(type);
    for (const match of (markdown + " " + subject).matchAll(/\{\{([^{}]+)\}\}/g))
        if (!Object.hasOwn(allowed, match[1]))
            throw new Error("Unknown field for this document: " + match[1]);
    if (!markdown.includes("{{name}}"))
        throw new Error("Keep the recipient name field in the template. Right-click to insert it.");
    if (type === "offer" && !markdown.includes("{{role}}"))
        throw new Error("Keep the Position field in the offer template.");
    return { markdown, subject };
}
export function documentFieldError(
    type: DocumentType,
    key: DocumentFieldKey,
    value: string,
): string | null {
    const field = documentField(key);
    if (field.optional && !value.trim()) return null;
    const maximum = field.input === "multiline" ? 6000 : key === "email" ? 254 : 300;
    if (!value.trim() || value.length > maximum)
        return `Enter a value within ${maximum.toLocaleString("en-IN")} characters.`;
    if (field.input !== "multiline" && /[\r\n]/.test(value))
        return "Enter this detail on one line.";
    if (key === "email" && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value))
        return "Enter one valid recipient email address.";
    if (field.input === "date") {
        const parsed = new Date(value + "T00:00:00Z");
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== value
        )
            return "Enter a valid date in YYYY-MM-DD format.";
    }
    if (field.options && !field.options.includes(value)) return "Choose an option from the list.";
    if (type === "offer" && key === "compensation")
        return offerFieldError(key as OfferField, value);
    return null;
}
export function requiredDocumentFields(
    type: DocumentType,
    template: DocumentTemplate,
): DocumentFieldKey[] {
    const used = new Set(
        [...(template.markdown + " " + template.subject).matchAll(/\{\{([^{}]+)\}\}/g)].map(
            (match) => match[1],
        ),
    );
    return documentDefinition(type).fields.filter(
        (key) => key === "email" || (used.has(key) && !documentField(key).optional),
    );
}
export function validateDocumentDetails(
    type: DocumentType,
    input: unknown,
    template: DocumentTemplate,
): DocumentValues {
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("Complete the recipient and document details.");
    const result: DocumentValues = {};
    const required = new Set(requiredDocumentFields(type, template));
    for (const key of documentDefinition(type).fields) {
        const value = (input as Record<string, unknown>)[key];
        if ((value === undefined || value === "") && !required.has(key)) {
            result[key] = "";
            continue;
        }
        if (typeof value !== "string")
            throw new Error("Complete " + documentFieldLabel(type, key) + ".");
        const issue = documentFieldError(type, key, value);
        if (issue) throw new Error(documentFieldLabel(type, key) + ": " + issue);
        result[key] = value;
    }
    if (result.reviewStart && result.reviewEnd && result.reviewEnd < result.reviewStart)
        throw new Error("The review end date must be on or after its start date.");
    if (result.joiningDate && result.lastWorkingDate && result.lastWorkingDate < result.joiningDate)
        throw new Error("The last working date must be on or after the joining date.");
    return result;
}
export function fillDocumentTemplate(
    type: DocumentType,
    template: DocumentTemplate,
    fields: DocumentValues,
    contact: OfferContact,
    reference: string,
    issuedAt = new Date(),
    preview = false,
): DocumentTemplate {
    const allowed = documentTemplateFields(type);
    const values: DocumentValues = {
        ...fields,
        adminName: contact.name,
        adminEmail: contact.email,
        adminPhone: contact.phone,
        reference,
        date: new Intl.DateTimeFormat("en-IN", {
            dateStyle: "long",
            timeZone: "Asia/Kolkata",
        }).format(issuedAt),
    };
    const replace = (source: string, markdown: boolean) =>
        source.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
            if (!Object.hasOwn(allowed, key))
                throw new Error("Unknown field for this document: " + key);
            let value = values[key] || "";
            if (!value && key !== "note" && !preview)
                throw new Error("Complete " + allowed[key as keyof typeof allowed] + ".");
            if (!value && key !== "note")
                value = "Choose " + allowed[key as keyof typeof allowed].toLowerCase();
            if (
                key in documentFields &&
                documentField(key as DocumentFieldKey).input === "date" &&
                /^\d{4}-\d{2}-\d{2}$/.test(value)
            ) {
                const parsed = new Date(value + "T00:00:00Z");
                if (Number.isFinite(parsed.getTime()))
                    value = new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "long",
                        timeZone: "UTC",
                    }).format(parsed);
            }
            return markdown ? value.replace(/[\\`*_[\]<>|]/g, "\\$&") : value;
        });
    return {
        markdown: replace(template.markdown, true),
        subject: replace(template.subject, false),
    };
}
export function detectDocumentCommand(text: string): DocumentType | null {
    const normalized = text.toLowerCase().replace(/\s+/g, " ");
    if (!/\b(send|prepare|create|draft|issue|give|want|need)\b/.test(normalized)) return null;
    return (
        organizationDocuments.find((doc) =>
            doc.aliases.some((alias) =>
                new RegExp("\\b" + alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(
                    normalized,
                ),
            ),
        )?.id ?? null
    );
}
