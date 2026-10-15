import type { Instrumentation } from "next";
export const onRequestError: Instrumentation.onRequestError = async (
  _error,
  request,
) => {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    request.path.startsWith("/api/eassist/report")
  )
    return;
  try {
    const [{ getRequestSession }, { componentForPath, recordPlatformError }] =
      await Promise.all([
        import("@/lib/request-session"),
        import("@/lib/eassist/platform"),
      ]);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers))
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join("; ") : value);
    const session = await getRequestSession(
      new Request(
        new URL(
          request.path,
          process.env.BETTER_AUTH_URL || "http://localhost:3000",
        ),
        { headers },
      ),
    );
    if (session?.user)
      await recordPlatformError(
        session.user.id,
        componentForPath(request.path),
        "server",
      );
  } catch {
    console.warn(
      "Operations monitoring could not persist a server error signal.",
    );
  }
};
