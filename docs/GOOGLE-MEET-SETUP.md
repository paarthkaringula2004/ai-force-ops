# Google Meet in AIForce.Ops

Meeting Rooms → Virtual defaults to Google Meet. Every active workspace role can connect its own Google account and create an immediate or scheduled meeting. Personal Gmail accounts are supported, subject to Google Calendar/Meet availability and account limits.

## One-time Admin setup

1. Open https://console.cloud.google.com/apis/dashboard and create/select a project. Enable Google Calendar API.
2. Configure Google Auth Platform branding and **External** audience. While the app is in Testing, add each organiser as a test user. For general availability, publish the OAuth app and complete Google's required verification for calendar access. Testing-mode refresh tokens may expire after seven days; reconnecting is expected until production approval.
3. Create an OAuth client of type **Web application**. Add the exact redirect shown in the project's **Set up Google Meet** panel, locally `http://localhost:3000/api/google-meet/callback`. Add the production HTTPS callback separately before deployment.
4. Configure OAuth data access for `openid`, `profile`, `email` and `https://www.googleapis.com/auth/calendar.events.owned`. The calendar scope permits managing events on calendars the connected person owns. The implementation only calls their primary calendar and does not list unrelated events.
5. Save the client ID and secret in the Admin panel. Credentials are encrypted with the application's existing encryption key. Never paste secrets into chat or commit them.
6. Click **Continue with Google**, choose an account and approve calendar access. Other users connect their own accounts after this one-time setup; testing-mode audience restrictions still apply.

Optional environment configuration: `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET`, `GOOGLE_MEET_REDIRECT_URI`. Existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` can be reused only if the app also has the meeting callback and calendar scope configured. Saved Admin settings take precedence. Changing app settings clears connections and pending sign-ins, requiring everyone to reconnect.

## Creation, sharing and cancellation

- Google Calendar `events.insert` creates a genuine event and requests a unique Meet conference with `conferenceDataVersion=1`. The UUID-derived event ID and conference request ID recover the same event after a timeout. A 409 retrieves that event rather than creating another.
- Google may prepare the link asynchronously. Until a verified link is returned, the meeting remains **creating**, cannot send invitations, and offers safe retry or cancellation. No link is invented.
- Meetings stay bound to the original Google account. Reconnecting another account cannot retry/cancel an existing organiser's event.
- Department/person invitations are AIForce.Ops invitations and popup notifications, not Google Calendar guest invitations or email messages. Admins may invite all roles; Managers may invite Managers/Employees/Users; Employees and Users may invite Employees/Users. Active membership is enforced on the server.
- Cancellation deletes the organiser's Google Calendar event and updates workspace invitees. Deleting an event does not guarantee the old Meet URL becomes unusable or terminate a running call; Google controls link lifetime and admission.
- Disconnect removes locally stored tokens; saved meetings remain. Users can additionally revoke the application in their Google account security settings.
- Inbox refresh occurs every five seconds while visible. Join availability is based on the scheduled window (ten minutes before start to end), not a claim that someone is currently in the call.
- Existing Teams meetings remain tagged with `provider=teams`, using their Microsoft connector for retry/cancellation. Native rooms retain their own availability and booking checks.

## Validation

`node tests/google-meet.mjs` exercises actual adapters with mocked Google HTTP responses and an isolated PostgreSQL schema: encrypted credentials, OAuth PKCE and state ownership/expiry/replay protection, refresh, asynchronous links, lost responses, duplicate/concurrent retries, organiser binding, role rules and cancellation notifications. `node tests/workspace-meetings.mjs` checks Teams/native compatibility. These tests do not establish that a real Google account has connected; a successful live sign-in and real meeting creation must be verified after credentials are supplied.

References: https://developers.google.com/identity/protocols/oauth2/web-server ; https://developers.google.com/workspace/calendar/api/guides/create-events ; https://developers.google.com/workspace/calendar/api/v3/reference/events/insert

## Scheduled end and link expiry

AIForce.Ops marks ready/pending virtual meetings Expired at their scheduled end, removes Join and meeting codes from the overview response, and rejects expired link retries. The open page updates expiry each second without an API request. Existing Google/Teams URLs copied outside this application follow the provider's access rules: app expiry does not revoke those URLs or end an active conference.

In Google Meet, use host controls and End meeting for all where available. Rejoining as host can restart the meeting. Calendar scheduled end and deleting the event do not guarantee immediate permanent Meet-code invalidation. The current Calendar OAuth connection does not include Meet conference-management scopes; no additional permissions or live provider actions were introduced.
