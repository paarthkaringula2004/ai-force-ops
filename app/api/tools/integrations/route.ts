import { providerById } from "@/lib/integrations/catalog";
import {
    requireIntegrationAccess,
    requireIntegrationCreate,
    integrationShares,
    saveIntegrationShare,
    integrationShareOptions,
} from "@/lib/integrations/access";
import { getRequestSession } from "@/lib/request-session";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
import { boundedJson, InputError, unseal } from "@/lib/eassist/transport";
import { listProviders, createProvider, archiveProvider } from "@/lib/integrations/registry";
import { saveConnection } from "@/lib/integrations/store";
import {
    approveIntegration,
    integrationCapabilities,
    prepareIntegration,
} from "@/lib/integrations/runtime";
import { db } from "@/lib/db";
import { adminLibrarySettingsOwner } from "@/lib/admin-library";
import { configureMonitor, monitorSnapshot } from "@/lib/integrations/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
    const known = error instanceof InputError || error instanceof IngestionError;
    return reply(
        {
            error: known
                ? error.message
                : "Integration request could not be completed. Check the connection and try again.",
        },
        known ? error.status : 503,
    );
}
export async function GET(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return reply({ error: "Sign in first." }, 401);
    try {
        const access = await requireIntegrationAccess(session.user.id);
        const libraryOwner = await adminLibrarySettingsOwner(session.user.id);
        const privateRows = (
            await db.query(
                "SELECT provider,config,enabled,revision,checked_at,check_state,check_message,updated_at,secret_cipher FROM integration_connections WHERE user_id=$1",
                [libraryOwner],
            )
        ).rows;
        const rows = privateRows.map((row) => {
            const { secret_cipher, ...metadata } = row;
            let credential_fields: string[] = [];
            try {
                const credentials = JSON.parse(unseal(secret_cipher));
                credential_fields = Object.keys(credentials).filter((k) => !!credentials[k]);
            } catch {
                credential_fields = [];
            }
            return { ...metadata, has_secret: credential_fields.length > 0, credential_fields };
        });
        const existing = (
            await db.query(
                "SELECT id,name,kind FROM eassist_connections WHERE user_id=$1 AND enabled=true AND kind IN ('servicenow','semaphore') ORDER BY name",
                [libraryOwner],
            )
        ).rows;
        const history = (
            await db.query(
                "SELECT id,provider,operation,status,summary,created_at FROM integration_executions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
                [session.user.id],
            )
        ).rows;
        const monitors = (
            await db.query(
                "SELECT provider,operation,enabled,interval_seconds,last_status,last_checked_at FROM integration_monitors WHERE user_id=$1",
                [libraryOwner],
            )
        ).rows;
        const catalog = await listProviders(session.user.id),
            all = await listProviders(session.user.id, true);
        const removed = all
            .filter((p) => !catalog.some((v) => v.id === p.id))
            .map((p) => ({ id: p.id, name: p.name }));
        return reply({
            catalog,
            connections: rows.filter((r) => catalog.some((p) => p.id === r.provider)),
            existing,
            history,
            monitors,
            removed,
            canShare: access.admin || access.manager,
            canCreate: access.canCreate,
            canGrantCreation: access.admin,
            shareableProviders: catalog
                .map((p) => ({ provider: p.id, roles: integrationShareOptions(access, p.id) }))
                .filter((p) => p.roles.length),
            deletableProviders: all
                .filter((p) => access.own.includes(p.id) || (access.admin && providerById(p.id)))
                .map((p) => p.id),
            shares: access.admin || access.manager ? await integrationShares(session.user.id) : [],
        });
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    const session = await getRequestSession(request);
    if (!session?.user) return reply({ error: "Sign in first." }, 401);
    try {
        requireSameOrigin(request);
        await requireIntegrationAccess(session.user.id);
        const raw = await boundedJson(request);
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new InputError("Invalid request.");
        const b = raw as Record<string, unknown>,
            provider = String(b.provider || "");
        if (b.action === "share") {
            await saveIntegrationShare(session.user.id, provider, b.roles);
            return reply({ saved: true });
        }
        if (b.action === "create_provider") {
            await requireIntegrationCreate(session.user.id);
            return reply({ provider: await createProvider(session.user.id, b) }, 201);
        }
        if (b.action !== "approve") await requireIntegrationAccess(session.user.id, provider);
        if (b.action === "archive_provider" || b.action === "restore_provider") {
            await archiveProvider(session.user.id, provider, b.action === "restore_provider");
            return reply({ saved: true });
        }
        if (b.action === "monitor") {
            await configureMonitor(
                session.user.id,
                provider,
                String(b.operation || ""),
                b.inputs || {},
                Number(b.interval),
                b.enabled === true,
            );
            return reply({ saved: true });
        }
        if (b.action === "monitor_snapshot")
            return reply(await monitorSnapshot(session.user.id, provider));
        if (b.action === "save") {
            await saveConnection(session.user.id, provider, b);
            return reply({
                saved: true,
                message: "Configuration saved. Run a connection check when your account is ready.",
            });
        }
        if (b.action === "disconnect") {
            await db.query("DELETE FROM integration_connections WHERE user_id=$1 AND provider=$2", [
                await adminLibrarySettingsOwner(session.user.id),
                provider,
            ]);
            await db.query("DELETE FROM integration_approvals WHERE user_id=$1 AND provider=$2", [
                session.user.id,
                provider,
            ]);
            return reply({ disconnected: true });
        }
        if (b.action === "capabilities")
            return reply(await integrationCapabilities(session.user.id, provider));
        if (b.action === "approve")
            return reply(await approveIntegration(session.user.id, String(b.token || "")));
        if (b.action === "run" || b.action === "check") {
            const inputs = b.inputs === undefined ? {} : b.inputs;
            if (!inputs || typeof inputs !== "object" || Array.isArray(inputs))
                throw new InputError("Inputs must be a JSON object.");
            const operation = String(b.operation || "");
            if (b.action === "check") {
                const cap = await integrationCapabilities(session.user.id, provider);
                if (cap.operations.find((o) => o.id === operation)?.requiresApproval !== false)
                    throw new InputError("Choose a read operation for a connection check.");
            }
            const revision =
                b.action === "check"
                    ? (
                          await db.query(
                              "SELECT revision FROM integration_connections WHERE user_id=$1 AND provider=$2",
                              [await adminLibrarySettingsOwner(session.user.id), provider],
                          )
                      ).rows[0]?.revision
                    : undefined;
            try {
                const result = await prepareIntegration(
                    session.user.id,
                    provider,
                    operation,
                    inputs as Record<string, unknown>,
                );
                if (b.action === "check")
                    await db.query(
                        "UPDATE integration_connections SET checked_at=now(),check_state='reachable',check_message='Selected read operation succeeded. Other operations require their own permissions.' WHERE user_id=$1 AND provider=$2 AND revision=$3",
                        [await adminLibrarySettingsOwner(session.user.id), provider, revision],
                    );
                return reply(result);
            } catch (error) {
                if (b.action === "check")
                    await db.query(
                        "UPDATE integration_connections SET checked_at=now(),check_state='failed',check_message=$3 WHERE user_id=$1 AND provider=$2 AND revision=$4",
                        [
                            await adminLibrarySettingsOwner(session.user.id),
                            provider,
                            error instanceof InputError ? error.message : "Connection check failed",
                            revision,
                        ],
                    );
                throw error;
            }
        }
        throw new InputError("Choose a supported integration action.");
    } catch (error) {
        return failure(error);
    }
}
