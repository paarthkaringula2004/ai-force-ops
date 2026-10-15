/** Explicitly disabling either setting disables every paid Review Center path. */
export function reviewAiEnabled(){
 return !!process.env.OPENAI_API_KEY&&process.env.REVIEW_CHAT_ENABLE_PAID_AI!=='false'&&process.env.REVIEW_CHAT_NATURAL_AI!=='false';
}
