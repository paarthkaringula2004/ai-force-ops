// Use the configured public authentication origin, not Next's internal bind host.
export function trustedOrigin(request: Request) {
  try {
    const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
    return request.headers.get("origin") === expected;
  } catch {
    return false;
  }
}
