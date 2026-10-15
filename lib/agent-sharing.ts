import { randomUUID } from "node:crypto";
import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { studioDependencies } from "./agent-studio-graph";
import { isActualAgent, validateAgentFlow, agentReferences } from "./agent-flow";
import { InputError } from "./eassist/transport";
import type { Agent } from "./agent-studio-runtime";
import type { WorkflowGraph } from "@/types/workflow";

export const shareRoles = ["user", "manager", "employee"] as const;
export type ShareRole = typeof shareRoles[number];
type Snapshot = { releases: Record<string, { agent: Agent; graph: WorkflowGraph }> };
export function parseShareRoles(value: unknown): ShareRole[] {
  if (!Array.isArray(value) || value.length > 3 || value.some(role => !shareRoles.includes(role)) || new Set(value).size !== value.length) throw new InputError("Choose User, Manager or Employee.");
  return shareRoles.filter(role => value.includes(role));
}
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["apiKey", "apiKeyDraft", "apiKeyConfigured", "clearApiKey"].includes(key)).map(([key, item]) => [key, clean(item)]));
}
export async function saveAgentShare(owner: string, agentId: string, input: unknown) {
  const member = await workspaceAccess(owner);
  if (!member.active || member.role !== "admin") throw new InputError("Only an Admin can share agents.", 403);
  const roles = parseShareRoles(input);
  const client = await db.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const own = await client.query("SELECT id FROM agents WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE", [agentId, owner]);
    if (!own.rowCount) throw new InputError("Agent not found in your workspace.", 404);
    if (!roles.length) {
      await client.query("DELETE FROM agent_role_shares WHERE agent_id=$1 AND owner_id=$2", [agentId, owner]);
      await client.query("COMMIT");
      return { roles, shared: false };
    }
    const releases: Snapshot["releases"] = {};
    async function freeze(id: string, ancestors: string[]) {
      if (ancestors.includes(id) || ancestors.length >= 4) throw new InputError("Remove circular or overly deep agent connections before sharing.");
      if (releases[id]) return;
      if (Object.keys(releases).length >= 30) throw new InputError("Too many connected agents to share.");
      const row = (await client.query("SELECT a.id,a.name,a.purpose,a.model_id AS \"modelId\",a.instructions,w.graph FROM agents a JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id WHERE a.user_id=$1 AND a.id=$2 AND a.deleted_at IS NULL", [owner, id])).rows[0];
      if (!row) throw new InputError("Configure this agent and its connected specialists before sharing.");
      const graph = clean(row.graph) as WorkflowGraph;
      if (isActualAgent(graph)) validateAgentFlow(graph);
      else if (!studioDependencies(graph).root || graph.nodes.some(node => ["ApiNode", "IfElseNode", "WhileNode", "UserApprovalNode"].includes(node.type || ""))) throw new InputError("Use a connected Agent Studio workflow before sharing.");
      releases[id] = { agent: { id, name: row.name, purpose: row.purpose, modelId: row.modelId, instructions: row.instructions }, graph };
      for (const node of agentReferences(graph).filter(node => node.data.referenceKind === "agent")) await freeze(String(node.data.referenceId), [...ancestors, id]);
    }
    await freeze(agentId, []);
    const result = await client.query("INSERT INTO agent_role_shares(agent_id,owner_id,roles,snapshot,share_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id,agent_id) DO UPDATE SET roles=excluded.roles,snapshot=excluded.snapshot,version=agent_role_shares.version+1,updated_at=now() RETURNING version,share_id AS \"shareId\"", [agentId, owner, JSON.stringify(roles), JSON.stringify({ releases }),randomUUID()]);
    await client.query("COMMIT");
    return { roles, shared: true, version: result.rows[0].version, shareId: result.rows[0].shareId };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function loadSharedAgent(viewer: string, agentId: string) {
  const member = await workspaceAccess(viewer);
  if (!member.active) throw new InputError("Shared agent access is unavailable.", 403);
  const result = await db.query<{ ownerId: string; agentId: string; version: number; snapshot: Snapshot; ownerName: string }>(`SELECT s.owner_id AS "ownerId",s.agent_id AS "agentId",s.version,s.snapshot,u.name AS "ownerName" FROM agent_role_shares s JOIN agents a ON a.id=s.agent_id AND a.user_id=s.owner_id JOIN workspace_members m ON m.user_id=s.owner_id JOIN "user" u ON u.id=s.owner_id WHERE s.share_id=$1 AND a.deleted_at IS NULL AND m.active=true AND m.role='admin' AND (s.roles ? $2 OR s.owner_id=$3)`, [agentId, member.role, viewer]);
  if (!result.rows[0]) throw new InputError("This agent is not shared with your role, or sharing has been removed.", 403);
  const share = result.rows[0];
  const root = share.snapshot.releases[share.agentId];
  if (!root) throw new InputError("Shared preview is unavailable.", 409);
  return { ...share, agent: root.agent };
}

export async function listAgentShares(viewer: string) {
  const member = await workspaceAccess(viewer);
  if (!member.active) throw new InputError("Account disabled.", 403);
  const own = member.role === "admin" ? (await db.query("SELECT agent_id AS id,share_id AS \"shareId\",roles,version FROM agent_role_shares WHERE owner_id=$1", [viewer])).rows : [];
  const shared = (await db.query(`SELECT s.share_id AS id,s.version,s.updated_at AS "updatedAt",s.snapshot->'releases'->(s.agent_id::text)->'agent'->>'name' AS name,s.snapshot->'releases'->(s.agent_id::text)->'agent'->>'purpose' AS purpose,u.name AS "ownerName" FROM agent_role_shares s JOIN agents a ON a.id=s.agent_id AND a.user_id=s.owner_id JOIN workspace_members m ON m.user_id=s.owner_id JOIN "user" u ON u.id=s.owner_id WHERE s.roles ? $1 AND s.owner_id<>$2 AND a.deleted_at IS NULL AND m.active=true AND m.role='admin' ORDER BY s.updated_at DESC`, [member.role, viewer])).rows;
  return { canShare: member.role === "admin", own, shared };
}
