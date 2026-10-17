import type { Source } from "./types";

// Broad collection questions need representative evidence, not a topic-keyword match.
export function isKnowledgeOverview(question: string) {
    const q = question.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
    const collection =
        "(?:my|our|this|the|uploaded|available|project|all(?: of)?(?: my| our| the)?)";
    const noun = "(?:data|datasets?|documents?|docs|files?|knowledge|uploads?|knowledge sources?)";
    return (
        (new RegExp(
            `\\b(?:what(?:s| is| are)?|tell me|show me|list|summari[sz]e|overview|describe|explain|explore)\\b.{0,45}\\b${collection}\\s+${noun}\\b`,
        ).test(q) &&
            !new RegExp(
                `\\b${noun}\\b.{0,35}\\b(?:about|regarding|related to|concerning)\\s+\\S`,
            ).test(q)) ||
        /\b(?:what|which)\s+(?:data|documents?|files?|knowledge sources?)\s+(?:do (?:i|we) have|(?:is|are) (?:available|uploaded|in (?:this|my|our) project))\b/.test(
            q,
        ) ||
        /\b(?:summari[sz]e|overview of|describe)\s+(?:everything|all (?:the )?uploads)\b/.test(q)
    );
}

export type KnowledgeRow = {
    id: string;
    document_id: string;
    name: string;
    content: string;
    ordinal: number;
    embedding?: number[];
};
export function overviewSources(rows: KnowledgeRow[], limit = 5): Source[] {
    const documents = new Map<string, KnowledgeRow[]>();
    for (const row of rows) {
        const chunks = documents.get(row.document_id) || [];
        chunks.push(row);
        documents.set(row.document_id, chunks);
    }
    return [...documents.values()].slice(0, limit).map((chunks) => {
        chunks.sort((a, b) => a.ordinal - b.ordinal);
        const selected = [...new Set([0, Math.floor(chunks.length / 2), chunks.length - 1])].map(
            (index) => chunks[index],
        );
        return {
            id: chunks[0].id,
            documentId: chunks[0].document_id,
            name: chunks[0].name,
            score: 1,
            content: selected
                .map((c) => `Excerpt from passage ${c.ordinal + 1}:\n${c.content}`)
                .join("\n\n"),
        };
    });
}

export function groupedSources(sources: Source[]) {
    const groups = new Map<string, { source: Source; references: number[] }>();
    sources.forEach((source, index) => {
        const key = source.documentId || source.id;
        const group = groups.get(key) || { source, references: [] };
        group.references.push(index + 1);
        groups.set(key, group);
    });
    return [...groups.values()];
}
