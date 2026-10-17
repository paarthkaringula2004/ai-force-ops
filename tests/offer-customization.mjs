import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as marked from "marked";
const require = createRequire(import.meta.url);
import { load } from "./helpers/load-ts.mjs";
const templates = load("lib/mail-templates.ts"),
    guided = load("lib/guided-offer.ts", { "./mail-templates": templates });
const customize = load("lib/offer-customization.ts", {
    marked: marked,
    "./mail-templates": templates,
    "./guided-offer": guided,
    "./mail-attachment-types": load("lib/mail-attachment-types.ts"),
});
const fields = {
    name: "Candidate",
    email: "candidate@example.com",
    role: "Software Development",
    department: "Engineering",
    employmentType: "Full-time",
    location: "Hybrid",
    joiningDate: "2026-11-02",
    reportingManager: "Manager",
    compensation: "INR 4 lakh per annum",
    note: "",
};
const contact = { name: "Sending Admin", email: "admin@example.com", phone: "1234567890" };
assert.deepEqual(customize.validateOfferDetails(fields), fields);
assert.throws(
    () => customize.validateOfferDetails({ ...fields, joiningDate: "2026-02-30" }),
    /valid joining date/,
);
const markdown = customize.offerMarkdown(
    fields,
    "OFR-TEST",
    new Date("2026-10-08T00:00:00Z"),
    contact,
);
assert.match(markdown, /2 November 2026/);
const content = customize.customizedOfferMail(
    markdown +
        "\n\n**Important**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[good](https://example.com)",
    "Offer",
    contact,
);
assert.match(content.html, /<strong>Important<\/strong>/);
assert.match(content.html, /<table/);
assert.ok(!content.html.includes("<script>"));
assert.ok(!content.html.includes('href="javascript:'));
assert.match(content.html, /Sending Admin/);
assert.equal(content.replyTo, contact.email);
assert.throws(
    () => customize.customizedOfferMail(markdown, "bad\nsubject", contact),
    /valid subject/,
);
const edited = markdown
    .replace("Sending Admin", "Custom Signatory")
    .replace("1234567890", "5550001234")
    .replace("Employment Offer", "Appointment Letter");
const changed = customize.customizedOfferMail(edited, "Custom subject", contact);
assert.match(changed.html, /Custom Signatory/);
assert.match(changed.html, /5550001234/);
assert.match(changed.html, /Appointment Letter/);
assert.ok(!changed.html.includes("Sending Admin"));
assert.equal(changed.text, edited);
assert.equal(changed.replyTo, contact.email);
const permissions = load("lib/workspace-permissions.ts");
assert.equal(permissions.requiredPermission("/dashboard/my-customization"), "admin");
for (const role of ["manager", "employee", "user"])
    assert.equal(permissions.permitted({ role, active: true }, "admin"), false);
let currentRole = "admin",
    queued = [],
    audit = [],
    body;
const client = {
    query: async (sql) =>
        sql.includes("FOR UPDATE")
            ? { rowCount: currentRole === "admin" ? 1 : 0, rows: [] }
            : sql.includes("count(*)")
              ? { rows: [{ n: 0 }] }
              : sql.includes("coalesce")
                ? { rows: [contact] }
                : { rows: [] },
    release() {},
};
const documentTools = load("lib/organization-documents.ts", {
    "./offer-template": load("lib/offer-template.ts"),
    "./guided-offer": guided,
});
const route = load("app/api/workspace/admin/mail/customization/route.ts", {
    "@/lib/db": {
        db: {
            connect: async () => client,
            query: async (sql) => (sql.includes("coalesce") ? { rows: [contact] } : { rows: [] }),
        },
    },
    "@/lib/request-session": {
        getRequestSession: async () => ({
            user: { id: "actor", name: "Admin", email: "admin@example.com" },
        }),
    },
    "@/lib/workspace-access": {
        workspaceAccess: async () => ({ role: currentRole, active: true }),
    },
    "@/lib/workspace-permissions": permissions,
    "@/lib/service-review/ingestion": {
        requireSameOrigin: (r) => {
            if (r.headers.get("origin") !== "http://localhost:3000") throw new Error();
        },
    },
    "@/lib/mail": {
        mailConfigured: () => true,
        queueMail: async (...args) => {
            queued.push(args);
            return "preview-id";
        },
    },
    "@/lib/staff-catalog": {
        readStaffCatalog: async () => ({ departments: [], jobTitles: [], qualifications: [] }),
    },
    "@/lib/offer-customization": customize,
    "@/lib/organization-document-store": {
        readDocumentTemplates: async () => ({}),
        readDocumentTemplate: async () => null,
    },
    "@/lib/organization-documents": documentTools,
    "@/lib/organization-mail-attachments": {
        attachmentIds: () => [],
        loadDocumentAttachments: async () => [],
    },
    "@/lib/offer-template-store": { readOfferTemplate: async () => null },
    "@/lib/offer-template": load("lib/offer-template.ts"),
    "node:crypto": require("node:crypto"),
});
function request(value, origin = "http://localhost:3000") {
    return new Request("http://localhost:3000/api/workspace/admin/mail/customization", {
        method: "POST",
        headers: { origin },
        body: JSON.stringify(value),
    });
}
body = { details: fields, markdown, subject: "Offer" };
for (const role of ["manager", "user", "employee"]) {
    currentRole = role;
    assert.equal((await route.GET(new Request("http://localhost:3000"))).status, 403);
    assert.equal((await route.POST(request(body))).status, 403);
}
currentRole = "admin";
assert.equal((await route.POST(request(body, "http://other.test"))).status, 403);
assert.equal(
    (await route.POST(request({ ...body, details: { ...fields, email: "invalid" } }))).status,
    400,
);
assert.equal(queued.length, 0);
const response = await route.POST(request(body));
assert.equal(response.status, 200);
assert.equal(queued.length, 1);
assert.equal(queued[0][1], fields.email);
assert.equal(queued[0][4].draft, true);
assert.equal(queued[0][4].actor, "actor");
assert.ok(queued[0][4].expires instanceof Date);
assert.match(queued[0][2].html, /Sending Admin/);
console.log(
    "Offer customization: Markdown safety, professional layout, profile contacts, dates, Admin isolation, origin and draft-only preview passed. No mail sent.",
);
