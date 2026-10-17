export function validAgentOrder(value: unknown, ownedIds: string[]): value is string[] {
    return (
        Array.isArray(value) &&
        value.length === ownedIds.length &&
        new Set(value).size === value.length &&
        value.every((id) => typeof id === "string" && ownedIds.includes(id))
    );
}
export function moveAgent<T extends { id: string }>(
    items: T[],
    source: string,
    target: string,
): T[] {
    const from = items.findIndex((item) => item.id === source),
        to = items.findIndex((item) => item.id === target);
    if (from < 0 || to < 0 || from === to) return items;
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
}
