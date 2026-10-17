import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const m = { exports: {} };
new Function(
    "module",
    "exports",
    ts.transpileModule(readFileSync("lib/offer-template.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
)(m, m.exports);
const {
    defaultOfferTemplate,
    defaultOfferSubject,
    validateOfferTemplate,
    fillOfferTemplate,
    offerPositionOptions,
} = m.exports;
const template = validateOfferTemplate(defaultOfferTemplate, defaultOfferSubject);
const contact = { name: "Admin A", email: "admin@example.com", phone: "1234567890" };
const fields = {
    name: "Candidate A",
    email: "a@example.com",
    role: "Software Developer",
    department: "Engineering",
    employmentType: "Full-time",
    location: "Remote",
    joiningDate: "2026-11-02",
    reportingManager: "Manager A",
    compensation: "INR 4 lakh per annum",
    note: "",
};
const filled = fillOfferTemplate(
    template,
    fields,
    contact,
    "OFR-TEST",
    new Date("2026-10-08T00:00:00Z"),
);
assert.match(filled.markdown, /Candidate A/);
assert.match(filled.markdown, /Admin A/);
assert.match(filled.markdown, /2 November 2026/);
assert.ok(!filled.markdown.includes("{{"));
assert.equal(filled.subject, "Employment Offer — Software Developer | AIForce.Ops");
assert.throws(
    () => fillOfferTemplate(template, { ...fields, role: "" }, contact, "OFR-TEST"),
    /Position/,
);
assert.match(
    fillOfferTemplate(template, {}, contact, "OFR-TEST", new Date(), true).markdown,
    /Choose position/,
);
assert.throws(
    () => validateOfferTemplate(defaultOfferTemplate + " {{__proto__}}", defaultOfferSubject),
    /Unknown/,
);
assert.throws(
    () => validateOfferTemplate(defaultOfferTemplate + " {{madeUp}}", defaultOfferSubject),
    /Unknown/,
);
const escaped = fillOfferTemplate(
    template,
    { ...fields, name: "**bad** | <script>" },
    contact,
    "OFR-TEST",
);
assert.match(escaped.markdown, /\\\*\\\*bad/);
assert.match(escaped.markdown, /\\\|/);
assert.deepEqual(offerPositionOptions([]), []);
assert.deepEqual(
    offerPositionOptions(
        [
            { name: "Engineering Specialist", department_code: 1 },
            { name: "Security Analyst", department_code: 2 },
        ],
        1,
    ),
    ["Engineering Specialist"],
);
assert.ok(offerPositionOptions([{ name: "Company Specialist" }]).includes("Company Specialist"));
console.log(
    "PASS: template fields, missing values, profile details, Markdown escaping, date formatting and populated Position choices.",
);
