import { randomUUID } from "node:crypto";
import { db } from "../db";
import { InputError } from "../eassist/transport";
import { listProviders } from "./registry";
import { parseMappings } from "./store";

export type ProjectBinding = {
    id: string;
    name: string;
    purpose: string;
    provider: string;
    operation: string;
    defaults: Record<string, unknown>;
    revision: number;
};
export async function projectBindings(user: string) {
    return (
        await db.query<ProjectBinding>(
            "SELECT id,name,purpose,provider,operation,defaults,revision FROM project_tool_bindings WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at",
            [user],
        )
    ).rows;
}
export async function resolveProjectBinding(user: string, id: string) {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw new InputError("Invalid project tool.");
    const row = (
        await db.query<ProjectBinding>(
            "SELECT id,name,purpose,provider,operation,defaults,revision FROM project_tool_bindings WHERE user_id=$1 AND id=$2 AND deleted_at IS NULL",
            [user, id],
        )
    ).rows[0];
    if (!row) throw new InputError("This project tool was deleted or is unavailable.", 404);
    return row;
}
export async function providerOperations(user: string) {
    const providers = await listProviders(user);
    const saved = (
        await db.query(
            "SELECT provider,config,enabled FROM integration_connections WHERE user_id=$1",
            [user],
        )
    ).rows;
    return providers.map((p) => {
        const c = saved.find((c) => c.provider === p.id);
        const operations =
            p.custom && c?.config.mapping ? parseMappings(c.config.mapping) : p.operations;
        return {
            id: p.id,
            name: p.name,
            configured: !!c?.enabled,
            operations: operations.map((o) => ({
                id: o.id,
                label: o.label,
                write: !!o.write,
                example: o.example || {},
            })),
        };
    });
}
export async function saveProjectBinding(user: string, value: Record<string, unknown>) {
    const name = typeof value.name === "string" ? value.name.trim() : "",
        purpose = typeof value.purpose === "string" ? value.purpose.trim() : "",
        provider = String(value.provider || ""),
        operation = String(value.operation || "");
    if (!name || name.length > 100 || purpose.length > 2000)
        throw new InputError("Enter a tool name and purpose under 2,000 characters.");
    const defaults = value.defaults === undefined ? {} : value.defaults;
    if (
        !defaults ||
        typeof defaults !== "object" ||
        Array.isArray(defaults) ||
        JSON.stringify(defaults).length > 32000
    )
        throw new InputError("Default inputs must be a JSON object under 32 KB.");
    const p = (await providerOperations(user)).find((p) => p.id === provider);
    if (!p?.operations.some((o) => o.id === operation))
        throw new InputError(
            "Choose an integration and one of its configured operations. Set up custom API mappings first.",
        );
    if (value.id) {
        const old = await resolveProjectBinding(user, String(value.id));
        await db.query(
            "UPDATE project_tool_bindings SET name=$3,purpose=$4,provider=$5,operation=$6,defaults=$7,revision=revision+1 WHERE user_id=$1 AND id=$2",
            [user, old.id, name, purpose, provider, operation, JSON.stringify(defaults)],
        );
        return old.id;
    }
    const id = randomUUID();
    await db.query(
        "INSERT INTO project_tool_bindings(id,user_id,name,purpose,provider,operation,defaults) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, user, name, purpose, provider, operation, JSON.stringify(defaults)],
    );
    return id;
}
export function bindingTool(row: ProjectBinding) {
    return {
        id: `project:${row.id}`,
        name: row.name,
        purpose: `${row.purpose} Uses integration ${row.provider}, operation ${row.operation}. Pass a JSON object with the operation inputs, or {"inputs":{...}}. Defaults are applied by the server. Never include API credentials. Changes require an exact approval.`,
        referenceKind: "builtin" as const,
    };
}
