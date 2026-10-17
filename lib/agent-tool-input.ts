import { InputError } from "./eassist/transport";
export function resolveToolEndpoint(endpoint: string, request: string) {
    endpoint = endpoint.replace(/%7B([A-Za-z][A-Za-z0-9_]*)%7D/gi, "{$1}");
    const slots = [...endpoint.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
    if (!slots.length) return endpoint;
    if (/\{/.test(endpoint.split("/").slice(0, 3).join("/")))
        throw new InputError("Tool hosts cannot contain placeholders.");
    const base = new URL(endpoint);
    let values: Record<string, unknown>;
    try {
        values = JSON.parse(request);
    } catch {
        throw new InputError(`Provide JSON inputs for: ${slots.join(", ")}.`);
    }
    if (!values || typeof values !== "object" || Array.isArray(values))
        throw new InputError("Provide tool inputs as a JSON object.");
    const resolved = endpoint.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name: string) => {
        const value = values[name];
        if (typeof value !== "string" && typeof value !== "number")
            throw new InputError(`Provide the tool input: ${name}.`);
        if (String(value).length > 1000 || [".", ".."].includes(String(value)))
            throw new InputError(`Invalid tool input: ${name}.`);
        return encodeURIComponent(String(value));
    });
    if (new URL(resolved).origin !== base.origin)
        throw new InputError("Tool inputs cannot change the configured host.");
    return resolved;
}
