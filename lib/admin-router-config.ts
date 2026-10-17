export function configuredAdminRouterModel() {
    return process.env.OPENAI_ADMIN_ROUTER_MODEL?.trim() || "gpt-4.1-mini";
}
export function adminRouterModel(answerModel: string) {
    const configured = configuredAdminRouterModel();
    return configured === "selected" ? answerModel : configured;
}
