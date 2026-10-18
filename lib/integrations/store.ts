import { adminLibrarySettingsOwner } from "../admin-library";
import { db } from "../db";
import { seal, unseal, InputError, type PrivateConnection } from "../eassist/transport";
import type { Operation } from "./catalog";
import { resolveProvider } from "./registry";

export type Connection = {
    config: Record<string, string>;
    secrets: Record<string, string>;
    enabled: boolean;
    revision: number;
};
export type Mapping = Operation & { headers?: Record<string, string> };
export function parseMappings(value: string): Mapping[] {
    let rows: unknown;
    try {
        rows = JSON.parse(value);
    } catch {
        throw new InputError("Operation mappings must be valid JSON.");
    }
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 30)
        throw new InputError("Provide 1–30 documented operation mappings.");
    const ids = new Set<string>();
    return rows.map((row) => {
        if (!row || typeof row !== "object") throw new InputError("Invalid operation mapping.");
        const r = row as Record<string, unknown>;
        if (typeof r.id !== "string" || !/^[a-z][a-z0-9_]{0,49}$/.test(r.id) || ids.has(r.id))
            throw new InputError("Mapping IDs must be unique lowercase identifiers.");
        ids.add(r.id);
        if (
            typeof r.label !== "string" ||
            !r.label.trim() ||
            r.label.length > 100 ||
            typeof r.path !== "string" ||
            !r.path.startsWith("/") ||
            r.path.startsWith("//") ||
            /[\\\r\n#]/.test(r.path) ||
            r.path.length > 2000
        )
            throw new InputError("Each mapping needs a label and relative API path.");
        const method = String(r.method || "GET").toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
            throw new InputError("Unsupported mapping method.");
        // POST can be a read only for built-in reviewed operations. Custom POST defaults to a change.
        const contentType = String(r.contentType || "application/json");
        if (
            ![
                "application/json",
                "application/xml",
                "text/xml",
                "text/plain",
                "application/x-www-form-urlencoded",
            ].includes(contentType)
        )
            throw new InputError("Choose JSON, XML, text or form content type.");
        const form: Record<string, string> = {},
            headers: Record<string, string> = {};
        for (const [target, source] of [
            [form, r.form],
            [headers, r.headers],
        ] as const) {
            if (
                source !== undefined &&
                (!source ||
                    typeof source !== "object" ||
                    Array.isArray(source) ||
                    Object.keys(source).length > 40)
            )
                throw new InputError("Operation form and headers must be bounded string objects.");
            for (const [key, value] of Object.entries(source || {})) {
                if (typeof value !== "string" || value.length > 2000 || /[\r\n]/.test(key + value))
                    throw new InputError("Invalid operation form or header value.");
                if (
                    target === headers &&
                    (!/^[A-Za-z][A-Za-z0-9-]{0,80}$/.test(key) ||
                        /^(authorization|proxy-authorization|host|cookie|set-cookie|content-length|connection|transfer-encoding)$/i.test(
                            key,
                        ))
                )
                    throw new InputError(
                        "Credentials belong in connection authentication, not operation headers.",
                    );
                target[key] = value;
            }
        }
        return {
            id: r.id,
            label: r.label,
            path: r.path,
            method,
            write: method !== "GET",
            run: method !== "GET",
            contentType,
            ...(Object.keys(form).length ? { form } : {}),
            headers,
            example:
                r.example && typeof r.example === "object"
                    ? (r.example as Record<string, unknown>)
                    : {},
        };
    });
}
export async function loadConnection(user: string, provider: string): Promise<Connection | null> {
    const settingsOwner = await adminLibrarySettingsOwner(user);
    const row = (
        await db.query(
            "SELECT config,secret_cipher,enabled,revision,user_id FROM integration_connections WHERE admin_library_access($1,user_id) AND provider=$2 ORDER BY (user_id=$3) DESC,user_id LIMIT 1",
            [user, provider, settingsOwner],
        )
    ).rows[0];
    if (!row) return null;
    user = row.user_id || user;
    const result: Connection = {
        config: row.config,
        secrets: row.secret_cipher ? JSON.parse(unseal(row.secret_cipher)) : {},
        enabled: row.enabled,
        revision: row.revision,
    };
    if (result.config.reuseId) {
        const old = (
            await db.query<PrivateConnection>(
                "SELECT * FROM eassist_connections WHERE user_id=$1 AND id=$2 AND kind=$3",
                [user, result.config.reuseId, (await resolveProvider(user, provider))?.reuse],
            )
        ).rows[0];
        if (!old?.enabled)
            throw new InputError("The linked integration is unavailable or disabled.", 409);
        result.config = {
            ...result.config,
            baseUrl: old.base_url,
            username: old.username,
            projectId: old.project_id,
        };
        const token = unseal(old.secret_cipher);
        result.secrets = old.auth_type === "basic" ? { password: token } : { token };
    }
    return result;
}
export async function saveConnection(user: string, provider: string, value: unknown) {
    const definition = await resolveProvider(user, provider);
    if (!definition) throw new InputError("Unknown integration.", 404);
    user = await adminLibrarySettingsOwner(user);
    if (!value || typeof value !== "object") throw new InputError("Enter connection details.");
    const body = value as Record<string, unknown>;
    const input = body.config;
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new InputError("Enter connection details.");
    const existing = (
        await db.query(
            "SELECT secret_cipher FROM integration_connections WHERE user_id=$1 AND provider=$2",
            [user, provider],
        )
    ).rows[0];
    const config: Record<string, string> = {},
        secrets: Record<string, string> = existing?.secret_cipher
            ? JSON.parse(unseal(existing.secret_cipher))
            : {};
    const fields = [
        ...definition.fields,
        { key: "reuseId", optional: true },
        { key: "authHeader", optional: true },
        { key: "authPrefix", optional: true },
    ];
    for (const f of fields) {
        const v = (input as Record<string, unknown>)[f.key];
        if (
            v !== undefined &&
            (typeof v !== "string" || v.length > (f.key === "mapping" ? 24000 : 4000))
        )
            throw new InputError("Invalid connection field.");
        const text = typeof v === "string" ? ("secret" in f && f.secret ? v : v.trim()) : "";
        if ("secret" in f && f.secret) {
            if (text) secrets[f.key] = text;
        } else if (text) config[f.key] = text;
    }
    if (config.reuseId) {
        if (!definition.reuse || !/^[a-f\d-]{36}$/i.test(config.reuseId))
            throw new InputError("Select a compatible existing integration.");
        const linked = await db.query(
            "SELECT id FROM eassist_connections WHERE user_id=$1 AND id=$2 AND kind=$3 AND enabled=true",
            [user, config.reuseId, definition.reuse],
        );
        if (!linked.rowCount) throw new InputError("Existing integration unavailable.");
    } else {
        for (const f of definition.fields)
            if (
                body.enabled === true &&
                !f.optional &&
                !(f.secret ? secrets[f.key] : config[f.key])
            )
                throw new InputError(`Complete ${f.label}.`);
    }
    if (config.baseUrl) {
        let url: URL;
        try {
            url = new URL(config.baseUrl);
        } catch {
            throw new InputError("Enter a valid HTTPS URL.");
        }
        if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search)
            throw new InputError(
                "Use HTTPS without embedded credentials, query strings or fragments.",
            );
        config.baseUrl = url.toString().replace(/\/$/, "");
    }
    if (config.tokenUrl) {
        let tokenUrl: URL;
        try {
            tokenUrl = new URL(config.tokenUrl);
        } catch {
            throw new InputError("Enter a valid OAuth token URL.");
        }
        if (
            tokenUrl.protocol !== "https:" ||
            tokenUrl.username ||
            tokenUrl.password ||
            tokenUrl.hash ||
            tokenUrl.search
        )
            throw new InputError("Use an HTTPS token URL without credentials or query parameters.");
    }
    if (config.region && !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(config.region))
        throw new InputError("Enter a valid AWS region, such as ap-south-1.");
    for (const id of ["tenantId", "clientId", "subscriptionId"])
        if (definition.auth === "azure" && config[id] && !/^[a-f\d-]{36}$/i.test(config[id]))
            throw new InputError(`Enter a valid ${id}.`);
    if (definition.custom && (config.mapping || body.enabled === true))
        parseMappings(config.mapping || "");
    if (config.authHeader && !/^[A-Za-z][A-Za-z0-9-]{0,80}$/.test(config.authHeader))
        throw new InputError("Invalid authentication header.");
    if (
        config.authHeader &&
        /^(host|cookie|set-cookie|content-length|connection|transfer-encoding)$/i.test(
            config.authHeader,
        )
    )
        throw new InputError("Choose an API authentication header.");
    for (const value of Object.values(secrets))
        if (/[\r\n]/.test(value))
            throw new InputError("API credentials must not contain line breaks.");
    // Preserve the intentional empty prefix for raw API-key authentication.
    if ((input as Record<string, unknown>).authPrefix === "") config.authPrefix = "";
    else if ((input as Record<string, unknown>).authPrefix === "Bearer ")
        config.authPrefix = "Bearer ";
    if (/\r|\n/.test(config.authPrefix || ""))
        throw new InputError("Invalid authentication prefix.");
    await db.query(
        `INSERT INTO integration_connections(user_id,provider,config,secret_cipher,enabled) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(user_id,provider) DO UPDATE SET config=EXCLUDED.config,secret_cipher=EXCLUDED.secret_cipher,enabled=EXCLUDED.enabled,revision=integration_connections.revision+1,check_state='not_checked',check_message='',checked_at=NULL,updated_at=now()`,
        [
            user,
            provider,
            JSON.stringify(config),
            seal(JSON.stringify(secrets)),
            body.enabled === true,
        ],
    );
}
