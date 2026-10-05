export type AgentRecord = {
  id: string;
  name: string;
  purpose: string;
  modelId: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  purgeAt?: string | null;
};

const AGENT_DRAFTS_STORAGE_KEY = "aiforce-ops:agent-drafts:v1";
const LEGACY_AGENT_DRAFTS_KEY = AGENT_DRAFTS_STORAGE_KEY;
const LEGACY_STORAGE_OWNER_KEY = "aiforce-ops:legacy-browser-data-owner:v1";
export const LOCAL_WORKSPACE_ID = "local-browser";

function storageKey(userId: string) {
  return `${AGENT_DRAFTS_STORAGE_KEY}:${encodeURIComponent(userId)}`;
}

export function readAgentDrafts(userId: string): AgentRecord[] {
  try {
    if (userId === LOCAL_WORKSPACE_ID) return readAllAgentDrafts();
    const saved = window.localStorage.getItem(storageKey(userId));
    if (saved !== null) return parseAgentDrafts(saved);

    const legacy = window.localStorage.getItem(LEGACY_AGENT_DRAFTS_KEY);
    if (!legacy) return [];
    const legacyOwner = window.localStorage.getItem(LEGACY_STORAGE_OWNER_KEY);
    const legacyAgents = parseAgentDrafts(legacy);
    if (!legacyOwner && legacyAgents.length > 0) {
      window.localStorage.setItem(LEGACY_STORAGE_OWNER_KEY, userId);
      window.localStorage.setItem(storageKey(userId), JSON.stringify(legacyAgents));
      return legacyAgents;
    }
    if (legacyOwner === userId) {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(legacyAgents));
      return legacyAgents;
    }
    return [];
  } catch {
    return [];
  }
}

function readAllAgentDrafts(): AgentRecord[] {
  const agentsById = new Map<string, AgentRecord>();
  const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter((key): key is string => key !== null);

  for (const key of keys) {
    if (key !== LEGACY_AGENT_DRAFTS_KEY && !key.startsWith(`${AGENT_DRAFTS_STORAGE_KEY}:`)) continue;
    const serialized = window.localStorage.getItem(key);
    if (!serialized) continue;
    for (const agent of parseAgentDrafts(serialized)) {
      const previous = agentsById.get(agent.id);
      if (!previous || agent.updatedAt > previous.updatedAt) agentsById.set(agent.id, agent);
    }
  }

  return [...agentsById.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function readLocalAgentDrafts(): AgentRecord[] {
  try {
    const localDrafts = window.localStorage.getItem(storageKey(LOCAL_WORKSPACE_ID));
    if (localDrafts !== null) return parseAgentDrafts(localDrafts);
    const legacyOwner = window.localStorage.getItem(LEGACY_STORAGE_OWNER_KEY);
    if (legacyOwner && legacyOwner !== LOCAL_WORKSPACE_ID) return [];
    return parseAgentDrafts(window.localStorage.getItem(LEGACY_AGENT_DRAFTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function parseAgentDrafts(json: string): AgentRecord[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is AgentRecord =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.createdAt === "string",
    );
  } catch {
    return [];
  }
}

export function saveAgentDrafts(agents: AgentRecord[], userId: string) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(agents));
}

export function findAgentDraft(id: string, userId: string) {
  return readAgentDrafts(userId).find((agent) => agent.id === id) ?? null;
}
