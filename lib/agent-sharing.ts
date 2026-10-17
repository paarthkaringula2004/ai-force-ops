import { randomUUID } from "node:crypto";
import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { studioDependencies } from "./agent-studio-graph";
import { isActualAgent, validateAgentFlow, agentReferences } from "./agent-flow";
import { InputError } from "./eassist/transport";
import type { Agent } from "./agent-studio-runtime";
import type { WorkflowGraph } from "@/types/workflow";

export const shareRoles = ["user", "manager", "employee", "admin"] as const;
export type ShareRole = (typeof shareRoles)[number];
type Snapshot = { releases: Record<string, { agent: Agent; graph: WorkflowGraph }> };
const sharedAccess = `(
 (s.sharing_mode='roles' AND m.role='admin' AND s.roles ? v.role)
 OR (s.sharing_mode='recipients' AND m.role IN ('employee','manager')
  AND EXISTS(SELECT 1 FROM agent_share_recipients r WHERE r.share_id=s.share_id AND r.user_id=v.user_id)
  AND (m.role='manager' OR v.role='user' OR (v.role='employee' AND m.department_code IS NOT NULL AND m.department_code=v.department_code)))
 OR (s.sharing_mode='scoped' AND m.role IN ('employee','manager') AND s.roles ? v.role
  AND ((v.role='user' AND EXISTS(SELECT 1 FROM agent_share_recipients r WHERE r.share_id=s.share_id AND r.user_id=v.user_id))
   OR (v.role<>'user' AND (m.role='manager' OR (v.role IN ('manager','employee') AND m.department_code IS NOT NULL AND m.department_code=v.department_code)))))
)`;
export function parseRecipientIds(value: unknown): string[] {
    if (
        !Array.isArray(value) ||
        value.length > 50 ||
        value.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    )
        throw new InputError("Enter up to 50 valid user_id values.");
    return [...new Set(value)] as string[];
}
export function parseShareRoles(value: unknown): ShareRole[] {
    if (
        !Array.isArray(value) ||
        value.length > 4 ||
        value.some((role) => !shareRoles.includes(role)) ||
        new Set(value).size !== value.length
    )
        throw new InputError("Choose User, Manager, Employee or Admin.");
    return shareRoles.filter((role) => value.includes(role));
}
function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(
                ([key]) =>
                    !["apiKey", "apiKeyDraft", "apiKeyConfigured", "clearApiKey"].includes(key),
            )
            .map(([key, item]) => [key, clean(item)]),
    );
}
export async function saveAgentShare(
    owner: string,
    agentId: string,
    input: unknown,
    recipientsInput: unknown = [],
) {
    const member = await workspaceAccess(owner);
    if (!member.active || !["admin", "manager", "employee"].includes(member.role))
        throw new InputError("Your role cannot share agents.", 403);
    const direct = member.role === "employee" || member.role === "manager";
    const roles = parseShareRoles(input ?? []),
        recipientIds = parseRecipientIds(recipientsInput);
    if (member.role === "employee" && roles.includes("admin"))
        throw new InputError("Employees can share with Manager, Employee or User only.", 403);
    if (direct && roles.includes("user") && !recipientIds.length)
        throw new InputError("Enter at least one User ID when User is selected.");
    if (direct && !roles.includes("user") && recipientIds.length)
        throw new InputError("Select User before entering User IDs.");
    if (
        member.role === "employee" &&
        roles.some((r) => r === "manager" || r === "employee") &&
        member.department_code == null
    )
        throw new InputError("An assigned department is required for staff sharing.", 403);
    if (!direct && recipientIds.length) throw new InputError("Use role sharing for Admin agents.");
    const client = await db.connect();
    try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        const own = await client.query(
            "SELECT id FROM agents WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [agentId, owner],
        );
        if (!own.rowCount) throw new InputError("Agent not found in your workspace.", 404);
        if (!roles.length && !recipientIds.length) {
            await client.query("DELETE FROM agent_role_shares WHERE agent_id=$1 AND owner_id=$2", [
                agentId,
                owner,
            ]);
            await client.query("COMMIT");
            return { roles, recipientIds, shared: false };
        }
        if (direct) {
            const recipients = (
                await client.query(
                    `SELECT user_id,role,department_code FROM workspace_members WHERE user_id=ANY($1::text[]) AND active=true`,
                    [recipientIds],
                )
            ).rows;
            if (
                recipients.length !== recipientIds.length ||
                recipients.some((r) => r.user_id === owner || r.role !== "user")
            )
                throw new InputError(
                    "Enter IDs belonging to active User accounts, not company staff.",
                    403,
                );
        }
        const releases: Snapshot["releases"] = {};
        async function freeze(id: string, ancestors: string[]) {
            if (ancestors.includes(id) || ancestors.length >= 4)
                throw new InputError(
                    "Remove circular or overly deep agent connections before sharing.",
                );
            if (releases[id]) return;
            if (Object.keys(releases).length >= 30)
                throw new InputError("Too many connected agents to share.");
            const row = (
                await client.query(
                    'SELECT a.id,a.name,a.purpose,a.model_id AS "modelId",a.instructions,w.graph FROM agents a JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id WHERE a.user_id=$1 AND a.id=$2 AND a.deleted_at IS NULL',
                    [owner, id],
                )
            ).rows[0];
            if (!row)
                throw new InputError(
                    "Configure this agent and its connected specialists before sharing.",
                );
            const graph = clean(row.graph) as WorkflowGraph;
            if (isActualAgent(graph)) validateAgentFlow(graph);
            else if (
                !studioDependencies(graph).root ||
                graph.nodes.some((node) =>
                    ["ApiNode", "IfElseNode", "WhileNode", "UserApprovalNode"].includes(
                        node.type || "",
                    ),
                )
            )
                throw new InputError("Use a connected Agent Studio workflow before sharing.");
            releases[id] = {
                agent: {
                    id,
                    name: row.name,
                    purpose: row.purpose,
                    modelId: row.modelId,
                    instructions: row.instructions,
                },
                graph,
            };
            for (const node of agentReferences(graph).filter(
                (node) => node.data.referenceKind === "agent",
            ))
                await freeze(String(node.data.referenceId), [...ancestors, id]);
        }
        await freeze(agentId, []);
        const result = await client.query(
            'INSERT INTO agent_role_shares(agent_id,owner_id,roles,snapshot,share_id,sharing_mode) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,agent_id) DO UPDATE SET roles=excluded.roles,snapshot=excluded.snapshot,sharing_mode=excluded.sharing_mode,version=agent_role_shares.version+1,updated_at=now() RETURNING version,share_id AS "shareId"',
            [
                agentId,
                owner,
                JSON.stringify(roles),
                JSON.stringify({ releases }),
                randomUUID(),
                direct ? "scoped" : "roles",
            ],
        );
        const shareId = result.rows[0].shareId;
        await client.query("DELETE FROM agent_share_recipients WHERE share_id=$1", [shareId]);
        if (recipientIds.length)
            await client.query(
                "INSERT INTO agent_share_recipients(share_id,user_id) SELECT $1,unnest($2::text[])",
                [shareId, recipientIds],
            );
        await client.query("COMMIT");
        return { roles, recipientIds, shared: true, version: result.rows[0].version, shareId };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function loadSharedAgent(viewer: string, agentId: string) {
    const member = await workspaceAccess(viewer);
    if (!member.active) throw new InputError("Shared agent access is unavailable.", 403);
    const result = await db.query<{
        ownerId: string;
        agentId: string;
        version: number;
        snapshot: Snapshot;
        ownerName: string;
    }>(
        `SELECT s.owner_id AS "ownerId",s.agent_id AS "agentId",s.version,s.snapshot,u.name AS "ownerName" FROM agent_role_shares s JOIN agents a ON a.id=s.agent_id AND a.user_id=s.owner_id JOIN workspace_members m ON m.user_id=s.owner_id JOIN workspace_members v ON v.user_id=$2 JOIN "user" u ON u.id=s.owner_id WHERE s.share_id=$1 AND a.deleted_at IS NULL AND m.active=true AND v.active=true AND (${sharedAccess} OR s.owner_id=v.user_id)`,
        [agentId, viewer],
    );
    if (!result.rows[0])
        throw new InputError(
            "This agent is not shared with your role, or sharing has been removed.",
            403,
        );
    const share = result.rows[0];
    const root = share.snapshot.releases[share.agentId];
    if (!root) throw new InputError("Shared preview is unavailable.", 409);
    return { ...share, agent: root.agent };
}

export async function listAgentShares(viewer: string) {
    const member = await workspaceAccess(viewer);
    if (!member.active) throw new InputError("Account disabled.", 403);
    const canShare = ["admin", "manager", "employee", "user"].includes(member.role);
    const own = canShare
        ? (
              await db.query(
                  `SELECT agent_id AS id,share_id AS "shareId",roles,version,sharing_mode AS "sharingMode",ARRAY(SELECT r.user_id FROM agent_share_recipients r WHERE r.share_id=s.share_id ORDER BY r.user_id) AS "recipientIds" FROM agent_role_shares s WHERE owner_id=$1`,
                  [viewer],
              )
          ).rows
        : [];
    const shared = (
        await db.query(
            `SELECT s.share_id AS id,s.version,s.updated_at AS "updatedAt",s.snapshot->'releases'->(s.agent_id::text)->'agent'->>'name' AS name,s.snapshot->'releases'->(s.agent_id::text)->'agent'->>'purpose' AS purpose,u.name AS "ownerName" FROM agent_role_shares s JOIN agents a ON a.id=s.agent_id AND a.user_id=s.owner_id JOIN workspace_members m ON m.user_id=s.owner_id JOIN workspace_members v ON v.user_id=$1 JOIN "user" u ON u.id=s.owner_id WHERE ${sharedAccess} AND s.owner_id<>$1 AND a.deleted_at IS NULL AND m.active=true AND v.active=true ORDER BY s.updated_at DESC`,
            [viewer],
        )
    ).rows;
    for (const item of own) {
        if (item.sharingMode === "recipients") {
            item.legacySharing = true;
            const users = (
                await db.query(
                    "SELECT user_id FROM workspace_members WHERE user_id=ANY($1::text[]) AND role='user'",
                    [item.recipientIds],
                )
            ).rows;
            item.recipientIds = users.map((u) => u.user_id);
            item.roles = item.recipientIds.length ? ["user"] : [];
        }
    }
    return {
        viewerRole: member.role,
        canShare,
        shareMode:
            member.role === "user" ? "copy" : member.role === "admin" ? "roles" : "recipients",
        recipientScope: member.role === "manager" ? "all" : "department",
        own,
        shared,
    };
}
