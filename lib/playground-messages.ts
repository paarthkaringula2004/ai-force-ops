// Input and generated answers have different size requirements.
export const PLAYGROUND_QUESTION_LIMIT = 12_000;
export const PLAYGROUND_REPLY_LIMIT = 60_000;
export function playgroundMessageLimit(role: string) {
  return role === "assistant" ? PLAYGROUND_REPLY_LIMIT : PLAYGROUND_QUESTION_LIMIT;
}
