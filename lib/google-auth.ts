import 'server-only';

export function googleSignInConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleAuthError(code: string | undefined) {
  if (!code) return '';
  if (['account_not_linked', 'email_not_verified', 'email_not_verified_for_account_linking'].includes(code)) {
    return 'Sign in with your email and password and verify your email first, then try Google again.';
  }
  if (code === 'signup_disabled') return 'New account registration is currently closed. Existing accounts can still sign in.';
  if (code === 'access_denied') return 'Google sign-in was cancelled. You can try again or use your email and password.';
  return 'Google sign-in could not be completed. Please try again or use your email and password.';
}
