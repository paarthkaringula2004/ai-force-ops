import { db } from "@/lib/db";
import { PaceError } from "./store";

function limit(name: string, fallback: number, min: number, max: number) {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new PaceError(`Invalid server configuration: ${name}.`, 503);
  return value;
}
function booleanPolicy(name: string) {
  const value = process.env[name];
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new PaceError(
    `Invalid server configuration: ${name} must be true or false.`,
    503,
  );
}
export function runtimePolicy() {
  return {
    requestsPerMinute: limit("EPACE_REQUESTS_PER_MINUTE", 12, 1, 1000),
    requestsPerDay: limit("EPACE_REQUESTS_PER_DAY", 200, 1, 100000),
    dailyTokens: limit("EPACE_DAILY_TOKEN_LIMIT", 500000, 1000, 100000000),
    requireSafety: booleanPolicy("EPACE_REQUIRE_SAFETY"),
    blockFlagged: booleanPolicy("EPACE_BLOCK_FLAGGED"),
    runTimeoutMs: 240000,
  };
}
export async function boundedBody(
  request: Request,
  max: number,
): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > max)
    throw new PaceError("Request exceeds the size limit.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PaceError("A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new PaceError("Request exceeds the size limit.", 413);
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function boundedJson(request: Request, max = 200000) {
  try {
    const value = JSON.parse(
      new TextDecoder().decode(await boundedBody(request, max)),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new PaceError("Send a JSON object.");
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) throw new PaceError("Send valid JSON.");
    throw error;
  }
}
export async function admitProviderRequest(user: string) {
  await (await import('@/lib/organization-security')).organizationExecutionAllowed(user);
  const policy = runtimePolicy(),
    c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `epace-budget:${user}`,
    ]);
    const usage = (
      await c.query(
        `SELECT COALESCE(sum(total_tokens),0)::bigint AS tokens FROM usage_events WHERE user_id=$1 AND source='epace' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
        [user],
      )
    ).rows[0];
    if (Number(usage.tokens) >= policy.dailyTokens)
      throw new PaceError(
        "Your daily ePACE token allowance has been reached. Try again after midnight UTC or ask the operator to review the limit.",
        429,
      );
    for (const [kind, max] of [
      ["minute", policy.requestsPerMinute],
      ["day", policy.requestsPerDay],
    ] as const) {
      const result = await c.query(
        `INSERT INTO epace_request_limits(user_id,window_start,window_kind,requests) VALUES($1,date_trunc($2,now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',$2,1)
    ON CONFLICT(user_id,window_start,window_kind) DO UPDATE SET requests=epace_request_limits.requests+1 WHERE epace_request_limits.requests<$3 RETURNING requests`,
        [user, kind, max],
      );
      if (!result.rowCount)
        throw new PaceError(
          `Your ePACE ${kind === "minute" ? "per-minute" : "daily"} request limit has been reached. Please wait before retrying.`,
          429,
        );
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
export async function checkTokenAllowance(user: string) {
  const r = await db.query(
    `SELECT COALESCE(sum(total_tokens),0)::bigint AS tokens FROM usage_events WHERE user_id=$1 AND source='epace' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    [user],
  );
  if (Number(r.rows[0].tokens) >= runtimePolicy().dailyTokens)
    throw new PaceError(
      "Daily ePACE token allowance reached. The next provider stage was stopped.",
      429,
    );
}
