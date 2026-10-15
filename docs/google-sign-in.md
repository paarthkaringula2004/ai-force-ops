# Google sign-in

Both `/sign-in` and `/sign-up` include **Continue with Google** after essential cookie consent. The button becomes active when both server credentials are configured. Gmail's app password cannot be used for OAuth.

## Google Cloud setup

1. Select or create the AIForce Ops project in Google Cloud Console.
2. Open Google Auth Platform and configure branding with the app name **AIForce.Ops**, support email and developer contact. Choose External for public Gmail signups. In Testing, add the accounts that will test the app.
3. Create an OAuth client with application type **Web application**.
4. Add authorized JavaScript origin `http://localhost:3000` and authorized redirect URI `http://localhost:3000/api/auth/callback/google`.
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the ignored local `.env`. These are server values, never `NEXT_PUBLIC_` variables. Restart the website after adding them.
6. For deployment, set `BETTER_AUTH_URL` to the website's HTTPS origin and register that exact HTTPS origin and `/api/auth/callback/google` URI in the same OAuth client. Configure the production consent screen and publishing requirements in Google Cloud.

Sources: [Better Auth Google provider](https://better-auth.com/docs/authentication/google), [Google OAuth web-server setup](https://developers.google.com/identity/protocols/oauth2/web-server).

## Account behavior

- Better Auth handles the OAuth authorization-code callback, PKCE and state validation. Only email, profile and OpenID scopes are requested; Gmail, Drive and Calendar access are not requested.
- Google sign-in asks the user to select an account. No offline access is requested.
- New accounts use the existing signup hooks, welcome email, User role and initial ticket policy. OAuth does not grant employment, Manager or Admin access.
- Existing roles, tickets and employee records remain attached to the existing account. Same-email automatic linking requires a verified local email. If an existing password account is unverified, sign in with its password and verify it first, then use Google. Linking across different emails is disabled.
- `AUTH_DISABLE_SIGNUP=true` also closes Google signup while retaining login for existing linked accounts.
- Google-verified accounts can enter the workspace without entering an email OTP again. Authentication does not confirm employment.

## Validation

`node tests/google-auth.mjs` checks configuration gating, actual provider authorization URL construction, PKCE/state, minimum scopes, client-secret exclusion, linking restrictions, signup closure and sanitized callback errors. TypeScript and targeted ESLint checks verify the Next.js UI and server wiring.

A successful end-to-end Google login must still be verified using the real registered OAuth credentials and user consent. Creating buttons and a provider configuration alone does not prove Google authentication works.
