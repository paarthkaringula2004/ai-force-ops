# DWP workplace agent

Open Agents → DWP-MAIN-AGENT → Launch/Play. The main agent connects Memory,
Tools, and seven workplace specialists. The installer adds missing connections
and instructions while preserving existing instructions, models, node positions,
custom connections, and saved request data. Previous graphs are backed up.

| Connection | What it actually does |
|---|---|
| FetchUserProfile | Reads the signed-in person's saved name, department, employee ID and role. |
| Employee-Onboarding | Reads onboarding status and the existing team, start date/location, and equipment checklist. |
| Workplace services | Continues the same request draft used by Playground. Collects onboarding, equipment, leave, access, support and other supported employee service details. |
| My workplace requests | Reads saved request numbers and approval status. |
| HR Collection under Memory | Searches passages in the owner's designated uploaded HR collection, with source titles and links. No company policies are invented or seeded. |
| MSDocLink · Uploaded HR documents | Lists or searches uploaded document titles and opens an authorized readable document page. Microsoft 365 is not connected. |
| Meeting-room availability | Reads configured rooms and reservation availability. Confirm reservations on Dashboard → Meeting Rooms. |

The specialists are Systrack, Software Inventory Agent, MeetRoom, Leave
Management, New Employee Onboarding, Equipment and Access, and HR Knowledge
Assistant. SysTrack telemetry and external software inventory still need their
real company integrations; the agents disclose that missing evidence.

## Try onboarding

1. Say **Start onboarding**.
2. Answer the department, start date/location, and equipment questions.
3. Review the collected details and say **Submit request**.
4. Click the request's confirmation control in Play. Nothing is submitted before
   this confirmation. The existing employee request transaction creates the saved
   request and normal manager/Admin review notifications.
5. Open **My Requests** to track the decision. Recorded submission does not create
   company HR accounts or provision equipment.

Drafts are shared with Playground, so changing an answer there invalidates an old
Studio preview. Expired previews, changed graphs, other users and repeated
confirmation attempts are rejected. A model cannot invent employee answers or
apply the same message twice in one tool turn. Shared previews remain read-only;
recipients use their own authorized Playground for changes.

## Add HR documents

Open **ePACE → Knowledge & indexes**, choose **HR Collection**, and upload approved
HR policy/onboarding documents. The installed collection is intentionally empty.
Other projects and other users' collections are excluded. Knowledge permissions
still apply. Document contents are treated as evidence, never instructions.
Ask a specific policy question, or ask for document links by title. Answers should
cite the returned document title and link and disclose missing evidence.

The Dashboard's Knowledge Management page documents Tool Library capabilities;
document uploads are in ePACE's Knowledge & indexes page.

## Deploy and install

Push and redeploy the changed application code. No new external API credentials
or database migration are required. The database is already shared with Render.
The current saved DWP graphs are upgraded by the operator installer:

```text
node scripts/install-dwp-agent.mjs existing-admin@example.com --apply
```

Omit `--apply` to preview its plan. The installer writes a private external graph
backup under Documents/AIForce-Ops-Recovery and saves workflow backups in the
database. Installing the Workplace starter in the UI also adds the new tools and
creates HR Collection without resetting an existing Workplace graph.

The native tools add no paid external service. Normal AI model usage still applies.
Verification: `node tests/dwp-agent.mjs` tests real native request persistence and
permissions using temporary accounts and a fixture model, without paid model calls.
