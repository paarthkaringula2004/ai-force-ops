import { db } from "./db";
import { projectTools } from "./agent-project-tools";
import { InputError } from "./eassist/transport";
import { adminLibrarySettingsOwner } from "./admin-library";

const definitions = projectTools.filter((t) => !t.id.startsWith("integration:"));
type Saved = {
    tool_id: string;
    name: string;
    purpose: string;
    enabled: boolean;
    default_request: string;
    deleted_at: string | null;
    revision: number;
};
export function builtinDefinition(id: string) {
    const definition = definitions.find((t) => t.id === id);
    if (!definition) throw new InputError("Choose a built-in project tool.", 404);
    return definition;
}
export async function builtinTools(user: string, includeDeleted = false) {
    user = await adminLibrarySettingsOwner(user);
    const rows = (
        await db.query<Saved>(
            "SELECT tool_id,name,purpose,enabled,default_request,deleted_at,revision FROM builtin_project_tool_settings WHERE user_id=$1",
            [user],
        )
    ).rows;
    return definitions
        .map((t) => {
            const row = rows.find((r) => r.tool_id === t.id);
            return {
                ...t,
                ...(row
                    ? {
                          name: row.name,
                          purpose: row.purpose,
                          enabled: row.enabled,
                          defaultRequest: row.default_request,
                          deleted: !!row.deleted_at,
                          revision: row.revision,
                      }
                    : { enabled: true, defaultRequest: "", deleted: false, revision: 0 }),
                capabilityPurpose: t.purpose,
            };
        })
        .filter((t) => includeDeleted || !t.deleted);
}
export async function builtinTool(user: string, id: string) {
    builtinDefinition(id);
    const tool = (await builtinTools(user, true)).find((t) => t.id === id)!;
    if (tool.deleted || !tool.enabled)
        throw new InputError(
            "This project tool is deleted or disabled. Configure or restore it in Tool Library.",
            409,
        );
    return tool;
}
export function validateDefaultRequest(id: string, value: unknown) {
    if (typeof value !== "string" || value.length > 12000)
        throw new InputError("Default request must be text under 12,000 characters.");
    const request = value.trim();
    if (!request) return "";
    if (id === "chart_visualizer") {
        let data;
        try {
            data = JSON.parse(request);
        } catch {
            throw new InputError('Use chart JSON such as {"source":"requests"}.');
        }
        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data) ||
            Object.keys(data).length !== 1 ||
            !["requests", "incidents", "scan_reports"].includes(data.source)
        )
            throw new InputError("Choose requests, incidents or scan_reports as the chart source.");
    } else if (id === "meeting_rooms") {
        let data;
        try {
            data = JSON.parse(request);
        } catch {
            throw new InputError("Use a JSON object for default meeting-room inputs.");
        }
        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data) ||
            Object.keys(data).some((k) => !["start", "end", "attendees"].includes(k))
        )
            throw new InputError("Meeting-room defaults accept start, end and attendees only.");
        if ((data.start === undefined) !== (data.end === undefined))
            throw new InputError("Supply both start and end for a room interval.");
        if (
            data.start !== undefined &&
            (![data.start, data.end].every(
                (v) =>
                    typeof v === "string" &&
                    /(Z|[+-]\d{2}:\d{2})$/.test(v) &&
                    Number.isFinite(Date.parse(v)),
            ) ||
                Date.parse(data.end) <= Date.parse(data.start))
        )
            throw new InputError("Use an increasing ISO date interval with explicit timezones.");
        if (
            data.attendees !== undefined &&
            (!Number.isInteger(data.attendees) || data.attendees < 1 || data.attendees > 10000)
        )
            throw new InputError("Attendees must be a positive whole number up to 10,000.");
    } else if (id === "incidents") {
        if (!/^INC\d+$/i.test(request))
            throw new InputError(
                "Use an INC incident number as the default, or leave it blank for the incident list.",
            );
    } else throw new InputError("This capability has no configurable default inputs.");
    return request;
}
export async function changeBuiltinTool(
    user: string,
    action: string,
    value: Record<string, unknown>,
) {
    user = await adminLibrarySettingsOwner(user);
    const id = String(value.id || ""),
        definition = builtinDefinition(id);
    if (action === "save_builtin") {
        const name = typeof value.name === "string" ? value.name.trim() : "",
            purpose = typeof value.purpose === "string" ? value.purpose.trim() : "";
        if (
            !name ||
            name.length > 100 ||
            purpose.length > 2000 ||
            typeof value.enabled !== "boolean"
        )
            throw new InputError(
                "Provide a name, purpose under 2,000 characters and enabled state.",
            );
        const request = validateDefaultRequest(id, value.defaultRequest ?? "");
        await db.query(
            `INSERT INTO builtin_project_tool_settings(user_id,tool_id,name,purpose,enabled,default_request) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,tool_id) DO UPDATE SET name=$3,purpose=$4,enabled=$5,default_request=$6,revision=builtin_project_tool_settings.revision+1,updated_at=now()`,
            [user, id, name, purpose, value.enabled, request],
        );
    } else if (action === "delete_builtin" || action === "restore_builtin") {
        const deleted = action === "delete_builtin";
        await db.query(
            `INSERT INTO builtin_project_tool_settings(user_id,tool_id,name,purpose,enabled,deleted_at) VALUES($1,$2,$3,$4,false,${deleted ? "now()" : "NULL"}) ON CONFLICT(user_id,tool_id) DO UPDATE SET deleted_at=${deleted ? "now()" : "NULL"},enabled=false,revision=builtin_project_tool_settings.revision+1,updated_at=now()`,
            [user, id, definition.name, definition.purpose],
        );
    } else throw new InputError("Unsupported built-in tool action.");
}
