import { isStandaloneGreeting } from "./epace/greetings";

export { isStandaloneGreeting };
export const BRIEF_CHAT_STYLE =
    "Answer directly and concisely. For a simple question use one or two short sentences. Give detailed explanations or code when the question needs them or the user asks. Avoid repeating the question or adding generic introductions.";

// Keep complete recent turns; never split a message or erase the current question.
export function recentChat<T extends { role: string; content: string }>(
    messages: T[],
    maxChars = 8000,
): T[] {
    const selected: T[] = [];
    let chars = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (selected.length && (selected.length >= 8 || chars + message.content.length > maxChars))
            break;
        selected.unshift(message);
        chars += message.content.length;
    }
    while (selected.length > 1 && selected[0].role === "assistant") selected.shift();
    return selected;
}
