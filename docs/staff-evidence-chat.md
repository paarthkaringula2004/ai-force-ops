# Employee records in Manager and Admin Super Chatbot

Before invoking the model, the Playground checks supported staff questions against PostgreSQL records. Admins read workspace-wide metadata and requests; Managers read assigned employees. Each data query checks the viewer's active role and the current reporting-manager assignment. It does not widen access to unrelated teams or expose credentials.

Supported questions include:

- Why is Tharak Karingula not coming tomorrow?
- Show Tharak Karingula's requests / laptop requests / onboarding / profile.
- Show my team's employee activity.
- Show Tharak Karingula's meetings, tools, agents or usage.
- What did Tharak Karingula upload to ePACE?
- What data has he uploaded to ePACE? (resolves a named employee from prior user questions)
- Employee overview / show all employee requests / show team usage.

All submitted employee service kinds use the same request store: leave, equipment, room requests, access, support, onboarding and the additional HR services. Request status, reference, decision note, recorded payroll amounts and timestamps are read from that store. An approved leave record explains recorded leave, not physical attendance. Pending leave is explicitly distinguished from approved leave. Dates use Asia/Kolkata.

Actual room bookings and virtual meetings use their respective saved meeting tables. Tool Library reports names, owners, HTTP methods and update times; URLs and secrets are excluded. Agent reports show names, models and update times, without instructions or credentials. Usage reports aggregate recorded events and tokens, optionally over explicit dates; no live billing claim is made.

ePACE reports project names, document names, sizes, indexed-passage counts, run/status metadata and saved audit activity. Full document contents and private chat transcripts are not disclosed in these overview responses. Workspace audit summaries show actions and timestamps without raw sensitive audit payloads. Unsubmitted conversation state is excluded.

The Team Requests screen refreshes every 15 seconds. Chat records are fetched on every question. Read-only lookups do not approve requests, provision access, send new email, run tools or change employees. Existing decision confirmation and employee self-service workflows remain separate.

Tests: `node tests/staff-evidence-chat.mjs` uses rollback-only database fixtures across every employee service, meeting records, tools, agents, usage and ePACE, including Manager isolation, Admin access, reassignment/revocation, follow-up context and secret exclusion. No real employee records are changed.
