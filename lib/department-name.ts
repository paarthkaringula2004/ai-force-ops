export const departmentCommand = (text: string) =>
    text.match(
        /^(?:(?:as of now|for now|now|please|i want to|can you|i need you to)\s*[,:-]?\s+)*(?:create|add)(?:\s+(?:a|the|another))?(?:\s+new)?\s+department(?:\s+(?:called|named))?\s*[:=–—-]?\s*(.*)$/i,
    );
export function suppliedDepartmentName(input: string, fieldAnswer = false): string | null {
    const text = input.trim(),
        command = departmentCommand(text);
    if (command) return command[1].trim().replace(/^["“']|["”']$/g, "") || null;
    // Preserve the supplied name; explanatory suffixes are not part of the catalog entry.
    const quoted = text.match(
        /^["“']([^"”'\n]+)["”']\s*(?:--?>|→|[-–—:])?\s*(?:is\s+)?(?:the\s+)?(?:new\s+)?(?:dept\.?|department)(?:\s+name)?[.!]?$/i,
    );
    if (quoted) return quoted[1].trim();
    return fieldAnswer ? text.replace(/^["“']|["”']$/g, "") : null;
}
