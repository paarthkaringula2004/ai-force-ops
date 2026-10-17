import { compareModelBudgets, modelRates } from "./model-pricing";
import OpenAI from "openai";

export function supportsPlaygroundModel(model: string): boolean {
    return (
        /^(?:gpt-[0-9]+[a-z0-9.-]*|o[1-9][a-z0-9.-]*|chat-latest)$/.test(model) &&
        !/(?:audio|image|realtime|transcrib|tts|search|instruct)/.test(model)
    );
}
const modelNameOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export function compareModelIds(a: string, b: string): number {
    const version = (id: string) => {
        const match = /^(gpt-|o)(\d+)(?:\.(\d+))?/.exec(id);
        return match
            ? [match[1] === "gpt-" ? 0 : 1, Number(match[2]), Number(match[3] ?? 0)]
            : [2, 0, 0];
    };
    const left = version(a),
        right = version(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return modelNameOrder.compare(a, b);
}
export type ModelEntry = {
    id: string;
    usable: boolean;
    status: string;
    reason: string;
    rates?: { input: number; output: number } | null;
};
const documentation = new Map<string, { supported: boolean | null; expires: number }>();
let catalog: { entries: ModelEntry[]; checkedAt: string; expires: number } | undefined;
let pending: Promise<{ entries: ModelEntry[]; checkedAt: string }> | undefined;

async function responsesSupport(id: string): Promise<boolean | null> {
    const base = id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    const cached = documentation.get(base);
    if (cached && cached.expires > Date.now()) return cached.supported;
    try {
        const response = await fetch(
            `https://developers.openai.com/api/docs/models/${encodeURIComponent(base)}.md`,
            { signal: AbortSignal.timeout(6000), cache: "no-store" },
        );
        if (!response.ok) return null;
        const text = await response.text();
        const supported =
            /\| Responses \| `v1\/responses` \| Supported \|/.test(text) &&
            /Output modalities: text/.test(text);
        documentation.set(base, { supported, expires: Date.now() + 3600000 });
        return supported;
    } catch {
        return null;
    }
}

export async function playgroundModelCatalog() {
    if (catalog && catalog.expires > Date.now()) return catalog;
    if (pending) return pending;
    pending = (async () => {
        const page = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).models.list();
        const ids = page.data.map((item) => item.id).sort((a, b) => compareModelIds(a, b));
        const entries: ModelEntry[] = [];
        // Bounded concurrency; metadata requests do not generate billable model replies.
        let cursor = 0;
        await Promise.all(
            Array.from({ length: 6 }, async () => {
                while (cursor < ids.length) {
                    const id = ids[cursor++];
                    if (!supportsPlaygroundModel(id)) {
                        entries.push({
                            id,
                            usable: false,
                            status: "Not supported here",
                            reason: "Requires a different API or modality; this Playground produces text through Responses.",
                        });
                        continue;
                    }
                    const supported = await responsesSupport(id);
                    entries.push({
                        id,
                        usable: supported === true,
                        status:
                            supported === true
                                ? "API listed · compatible"
                                : supported === false
                                  ? "Not supported here"
                                  : "Not verified",
                        reason:
                            supported === true
                                ? "OpenAI lists this model for your key; official documentation supports text Responses. Generation access still depends on permissions and quota."
                                : supported === false
                                  ? "Official model documentation does not support text Responses."
                                  : "Could not verify current model capabilities from official OpenAI documentation.",
                    });
                }
            }),
        );
        // Preserve previously seen IDs so removals are visible instead of silently disappearing.
        for (const previous of catalog?.entries ?? [])
            if (!ids.includes(previous.id))
                entries.push({
                    ...previous,
                    usable: false,
                    status: "Unavailable",
                    reason: "No longer listed by OpenAI for this API key.",
                });
        for (const entry of entries) entry.rates = modelRates(entry.id);
        entries.sort(
            (a, b) => Number(b.usable) - Number(a.usable) || compareModelBudgets(a.id, b.id),
        );
        catalog = { entries, checkedAt: new Date().toISOString(), expires: Date.now() + 60000 };
        return catalog;
    })();
    try {
        return await pending;
    } finally {
        pending = undefined;
    }
}
