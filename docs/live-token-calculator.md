# Live Token Calculator

Input changes trigger a debounced server request to OpenAI Responses input-token counting after 750 ms. The provider count includes request formatting for the submitted plain text; it is not the old character/4 approximation. No response generation is requested and no application tickets are debited by counting.

The output control is a planned token budget, not a prediction. Cost forecasts use the existing shared model pricing catalog, configured USD/INR conversion and application multiplier. Source timestamps and the configured FX basis are visible; unavailable pricing is not displayed as zero. A real run can add system instructions, history, tools, reasoning and different output.

The latest recorded non-local model run is fetched from the signed-in user's Usage endpoint every five seconds while visible, and on focus. This is polling of actual recorded provider usage, not token-by-token generation streaming. Failed refreshes are explicitly marked. Counts for edited text are hidden until the current request succeeds, and obsolete requests are aborted.

Input, legacy output sample, model selection and budget remain scoped to the signed-in user's PostgreSQL record. The legacy sample is retained even though the new UI uses an output budget. Migration 0067 adds model/budget columns and a database-backed 60-count-requests-per-user-per-minute limit. Render startup applies it through the existing migration runner.

Verification: production build, TypeScript and scoped ESLint passed; live-token-calculator.mjs covers authentication, CSRF, bounded input/budget, model validation, Unicode provider response, empty input, limiter, private/no-store results, sanitized provider failures and owner-scoped persistence. Direct OpenAI check returned 13 input tokens for the synthetic verification text without generating a reply.

Official reference: https://developers.openai.com/api/docs/guides/token-counting

The Vercel-only vercel.json was removed at the owner's request. Its daily agent-bin purge schedule is not scheduled by Render automatically. The authenticated purge endpoint remains available for an operator-configured scheduler.
