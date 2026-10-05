import arcjet, { shield, tokenBucket } from "@arcjet/next";

const key = process.env.ARCJET_KEY;
const mode = process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN";

const protection = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode }),
        tokenBucket({ mode, refillRate: 10, interval: 60, capacity: 20 }),
      ],
    })
  : null;

export async function protectOpenAiRequest(request: Request): Promise<Response | null> {
  if (!protection) return null;
  try {
    const decision = await protection.protect(request, { requested: 1 });
    if (!decision.isDenied()) return null;
    const rateLimited = decision.reason.isRateLimit();
    return Response.json(
      { error: rateLimited ? "Too many requests. Please wait before trying again." : "Request blocked by the security policy." },
      { status: rateLimited ? 429 : 403 },
    );
  } catch {
    // Arcjet's documented failure mode is fail-open; API request validation remains active.
    return null;
  }
}
