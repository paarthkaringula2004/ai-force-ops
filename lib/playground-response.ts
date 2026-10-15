import {OrganizationPolicyError} from './organization-security';
export function playgroundOutcome(response: { status?: string | null; output_text?: string; incomplete_details?: { reason?: string } | null }, limit?: number) {
  const reply = response.output_text?.trim() ?? "";
  if (response.status === "completed" && reply) return { reply, warning: "", error: "" };
  if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
    const message = `The ${limit ? `${limit}-token` : "output"} limit was reached${reply ? ". Increase Max tokens for a longer answer." : " before an answer was ready. Increase Max tokens or choose a non-reasoning model."}`;
    return { reply, warning: reply ? message : "", error: reply ? "" : message };
  }
  return { reply: "", warning: "", error: "OpenAI could not complete this answer. Your question is kept in the input box; try again." };
}
export function playgroundError(error: unknown) {
  if(error instanceof OrganizationPolicyError)return error.message;
  const info = error && typeof error === "object" ? error as { status?: number; code?: string; name?: string } : {};
  if (info.status === 401) return "The server’s OpenAI credential was rejected. Ask your workspace administrator to check it.";
  if (info.status === 403 || info.status === 404) return "OpenAI denied access to this model. Refresh the Models list and choose another model.";
  if (info.status === 429) return info.code === "insufficient_quota" ? "The OpenAI account has reached its credit or spending limit. Your administrator needs to check API billing." : "OpenAI’s request limit was reached. Wait a moment, then retry.";
  if (info.status === 400) return "OpenAI rejected this model’s request settings. Refresh the model list and retry with model defaults.";
  if (/timeout|connection/i.test(info.name ?? "")) return "OpenAI did not respond in time. Your question is restored; try again.";
  return "The answer could not be completed. Your question is restored; try again.";
}
