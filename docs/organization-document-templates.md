# Organization documents in My Customization

Active Admins can edit, preview and save 18 organization templates. Each document has its own wording, subject, placeholder fields, saved version and attachment list. Templates are shared across Admins; the sending Admin’s profile supplies their name, email and phone. Recipient values are draft values, not reusable template defaults.

Document types: Job Description, Offer Letter, Employment Contract, Confidentiality Agreement, Appointment Letter, Onboarding Checklist, Employee Handbook, Policy Acknowledgment, Probation Confirmation, Employment Verification, Promotion / Transfer Letter, Salary Revision Letter, Performance Improvement Plan, Warning / Disciplinary Letter, Resignation Acceptance, Relieving Letter, Experience Certificate, Final Settlement.

## Editing and sending

Choose a document type, fill its relevant fields and edit its Markdown template. Right-click to insert supported placeholder fields. Live preview fills placeholders immediately. Unsaved edits stay separate when switching document types. Save for Chatbot stores the selected document’s reusable wording and attachments, with a version check to prevent overwriting another Admin’s changes.

In Playground, say “Prepare a Salary Revision Letter” (or another document name). The guided draft asks for the details used by its saved template and optional additional information. It presents the filled document before requiring explicit confirmation. Preparing an email from My Customization also creates a draft requiring review and confirmation. Neither saving nor previewing sends mail.

## Attachments

The Attach files section follows the contact details in the letter editor. Uploaded filenames appear below the phone number in the email preview. Admin uploads accept files without an application-imposed count, file-size or combined-size cap. The mail provider still determines whether the resulting message can be delivered. Save for Chatbot persists their association with this document type. The chatbot and prepared email include the actual files as MIME attachments. Removing a file and saving updates the reusable template; previously prepared emails keep their exact reviewed content.

Uploads and queued message contents are encrypted. Active Admins can download their own uploads or files attached to saved organization templates. Files cannot be attached to a different document type. Unused uploads older than seven days are cleaned up on subsequent uploads.

## Preview themes

Purple is the default design for all 18 document emails and the initial preview. The Theme dropdown at the top right also offers White and Dark (Black) appearance simulations. These options change only the preview, including a prepared-email preview; they do not rewrite document text or change the reviewed message. Email clients can adjust colors independently.

## Validation

Required fields derive from placeholders present in each template. Inputs validate recipient email, real calendar dates and chronological employment/review dates. Unknown placeholders and unsafe HTML are rejected or escaped. Documents use supplied approved terms; they do not imply signatures, invent compensation or assert settlement payment. Attach signed documents using the attachment control when needed.

`node tests/organization-documents.mjs` covers all 18 templates, shared saves, version conflicts, guided drafts, attachments, encryption, Admin permissions and confirmed queueing inside a rolled-back database transaction. No external test emails are sent.
