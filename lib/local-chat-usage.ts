import { recordModelUsage } from "./model-usage";

export async function recordLocalChat(user: string, source: string) {
  await recordModelUsage(user, source, {modelId:"local", inputTokens:0, outputTokens:0, cachedInputTokens:0, usageKind:"local"});
}
