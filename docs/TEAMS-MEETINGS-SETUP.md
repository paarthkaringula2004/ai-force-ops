# Microsoft Teams meetings in AIForce.Ops

Open **Dashboard → Meeting Rooms** and choose **Virtual**. The interface offers **Create a meeting link**, **Schedule a meeting**, and **Join with a meeting ID**. Each organiser connects their own Microsoft Teams work or school account. No mock meeting links are generated.

## One-time Admin setup

1. Open [Microsoft Entra](https://entra.microsoft.com/) with an account allowed to register applications. Go to **App registrations → New registration** and select accounts in your organisation's directory.
2. Add a **Web** redirect URI matching the value shown under **Set up Teams** in AIForce.Ops. Locally it is normally `http://localhost:3000/api/teams/callback`. For deployment, use your actual HTTPS application origin and register its callback too.
3. Add Microsoft Graph **delegated** API permissions **User.Read** and **OnlineMeetings.ReadWrite**. Obtain administrator consent when your tenant requires it. The sign-in request also asks for `openid profile offline_access` to support account verification and token renewal. No application-wide meeting permission is used.
4. Create a client secret. Copy its **value**, not its secret ID. Record its expiry so you can rotate it before it expires.
5. In AIForce.Ops, choose **Meeting Rooms → Virtual → Set up Teams**. Enter Application (client) ID, Directory (tenant) ID, and Client secret value. Choose **Save app settings**. Do not paste secrets into chat or commit them to source control.
6. Choose **Connect Teams**. Sign in and grant consent using a Teams-enabled account in the configured tenant. Every other organiser must connect their own account too. Recipients can view workspace invitations without connecting an organiser account; Microsoft controls their access when they join.
7. Create a short test meeting, open its actual join link, invite one consenting test recipient, check their popup and invitation inbox, then cancel the meeting and verify their cancellation update.

Saving settings is not a successful Microsoft connection test. Creation can still fail if the account lacks Teams eligibility/licensing, the secret expired, tenant consent is denied, or Microsoft is unavailable. These errors are surfaced without inventing successful meetings. Personal accounts at `teams.live.com` cannot create meetings through this Graph API.

## Invitation permissions

| Organiser | Eligible recipients |
| --- | --- |
| Admin | Admins, Managers, Employees, Users |
| Manager | Managers, Employees, Users |
| Employee | Employees, Users |
| User / client | Users, Employees |

Choose several departments, specific people, or both. Department selections resolve to currently active, eligible registered workspace members when invitations are sent. Overlapping selections are deduplicated. Invitations stay inside AIForce.Ops; this feature does not send external email or Outlook calendar invitations.

Recipients get their own invitation inbox in Meeting Rooms and an unread invitation popup anywhere in the Dashboard. While visible, the workspace refreshes notifications every five seconds and on returning to the tab. This is polling of live application records, not a Microsoft push subscription. Dismissal/acceptance persists on the server. Future invitations show the scheduled time; **Join now** appears from ten minutes before the start until the end. That label follows the scheduled time; it does not assert the organiser has joined. Cancellations reset the notification so recipients see the update.

## In-person meetings

Choose **In person** and filter **Job location** or **Specific location**. Admins and Managers add actual rooms and their addresses/capacities. Managers can enable, disable, or delete rooms they created; Admins can manage all rooms. Any active member can reserve an available room through preview and confirmation. Invitations cannot exceed the reservation's attendee count, including the organiser. The room's capacity and overlapping bookings are checked on confirmation. Cancelled bookings can be removed from the personal list; reservation history remains.

## Storage, retries and operation

- Database migrations `0054`–`0056` add Teams credentials, OAuth state, meetings, invitations, location types, and application/account binding. Run `npm run db:migrate` before deploying this version.
- Tokens, OAuth PKCE verifiers and app secrets use authenticated AES-256-GCM encryption through `lib/agent-secrets.ts`, with a key derived from `BETTER_AUTH_SECRET`. Preserve that secret across application instances/restarts. Rotating it requires a deliberate credential re-encryption or reconnect plan.
- Microsoft OAuth uses a one-use, expiring state bound to the signed-in workspace account, an HttpOnly SameSite cookie, and PKCE. Browser payloads never contain access tokens, refresh tokens, or saved app secrets.
- Changing app settings disconnects existing organisers. Connections and sign-ins are fingerprint-bound to the app configuration. A meeting remains bound to its original Microsoft organiser account; reconnect that account to retry or cancel it.
- Creation uses Microsoft's `onlineMeetings/createOrGet` with a stable external ID. A failed or interrupted creation remains visible as incomplete. **Retry link creation** recovers that same request instead of silently creating duplicates. No invitations can be sent before its link is ready.
- All write endpoints require a signed-in active account and same-origin requests. Server-side role/ownership checks govern invitation recipients and meeting actions. Recipients cannot edit an organiser's meeting.
- **Schedule in AIForce.Ops** creates a standalone Teams meeting and saves the schedule here. It does not create an Outlook event or automatically place the meeting in Microsoft's calendar. Join by ID opens Microsoft's official join page.
- Optional hosting-secret fallback: `TEAMS_TENANT_ID`, `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_REDIRECT_URI`. Settings saved by an Admin take precedence over tenant/client/secret environment values. `BETTER_AUTH_URL` sets the default callback origin.
- Configure production HTTPS, a stable auth encryption secret, the registered production callback, and secret-expiry monitoring. Live tenant consent/licensing and a real create/join/cancel cycle must be verified before treating Teams as deployed and operational.

## Verification

`node tests/workspace-meetings.mjs` exercises the real server services against an isolated PostgreSQL schema, with Microsoft HTTP responses mocked. It verifies OAuth/PKCE, encrypted credentials, refresh, request recovery, concurrent idempotency, account binding, invitation role/department restrictions, recipient privacy, acknowledgements, cancellation notices and API authentication/CSRF. It sends no real invitations and does not certify Microsoft tenant connectivity.

`node tests/meeting-rooms.mjs` verifies native booking capacity, overlap/concurrency, previews, cancellation, room/booking removal and history retention. `npx tsc --noEmit`, relevant ESLint checks and `npm run build` validate integration and production compilation.

Microsoft references: [createOrGet](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-createorget?view=graph-rest-1.0), [delete a meeting](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-delete?view=graph-rest-1.0), [OAuth authorisation code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
