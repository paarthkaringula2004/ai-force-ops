import { listPlaygroundTools, playgroundConnectionSources } from "./playground-tools";
import { db } from "./db";
import { readToolKnowledge } from "./tool-knowledge";
import { listAgentShares } from "./agent-sharing";
import { agentReferences } from "./agent-flow";
import type { WorkflowGraph } from "@/types/workflow";
import type { WorkspaceAccess } from "./workspace-permissions";

type Entry = {
    id: string;
    name: string;
    category: string;
    purpose: string;
    status: string;
    details: string[];
    href: string;
};
type Message = { role: "user" | "assistant"; content: string };
const clean = (value: unknown, max = 4000) =>
    typeof value === "string" ? value.replace(/[\\`*_{}\[\]<>]/g, "").slice(0, max) : "";
const normalized = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
const mentions = (input: string, name: string) =>
    !!normalized(name) && (" " + normalized(input) + " ").includes(" " + normalized(name) + " ");
function knowledgeDetails(value: unknown): string[] {
    if (!value || typeof value !== "object") return [];
    const k = value as {
        limits?: string;
        integration?: string;
        operation?: string;
        lastCheck?: string;
        checkedAt?: string;
        operations?: { name: string; requiresApproval: boolean }[];
    };
    return [
        k.limits ? "Capability limits: " + k.limits : "",
        k.integration ? "Integration: " + k.integration : "",
        k.operation ? "Operation: " + k.operation : "",
        k.lastCheck
            ? "Last saved connection check: " +
              k.lastCheck +
              (k.checkedAt ? " at " + k.checkedAt : "")
            : "",
        ...(k.operations ?? []).map(
            (o) => "Operation: " + o.name + (o.requiresApproval ? " — requires approval" : ""),
        ),
    ].filter(Boolean);
}
export function catalogQuestion(input: string) {
    if (
        !/\b(?:agent|tool)\b/i.test(input) &&
        /^(?:(?:what is|show me|tell me about|view|read)\s+)?my\s+(?:profile|(?:workplace )?requests)[?!.]*$/i.test(
            input.trim(),
        )
    )
        return false;
    if (/^(?:Agent management|Tool management)$/i.test(input.trim())) return false;
    return (
        /\b(?:agents?|tools?|tool library)\b/i.test(input) ||
        /^(?:what (?:does|is|can)|tell me about|explain|describe|how does|show me|list|about|do (?:i|we) have)\b/i.test(
            input,
        )
    );
}
export async function playgroundCatalogReply(
    user: string,
    member: WorkspaceAccess,
    input: string,
    messages: Message[] = [],
) {
    if (!member.active || !catalogQuestion(input)) return null;
    if (
        /\b(?:using|use|via|run|execute|search|find|fetch|look up|latest|current|today|how many|count)\b/i.test(
            input,
        ) &&
        !/\b(?:what does|capabilities|purpose|configuration|configured|what can|what all)\b/i.test(
            input,
        )
    )
        return null;
    // Mutations and execution stay in their existing, separately authorized workflows.
    if (
        /\b(?:create|delete|remove|rename|run|execute|invoke|launch|configure|edit|connect|disconnect|add)\b/i.test(
            input,
        ) &&
        !/[?]|\b(?:what|how|does|can|explain|tell|describe)\b/i.test(input)
    )
        return null;
    const [agents, custom, knowledge, shares, connections] = await Promise.all([
        db.query<{
            id: string;
            name: string;
            purpose: string;
            modelId: string;
            graph: WorkflowGraph | null;
        }>(
            `SELECT a.id,a.name,a.purpose,a.model_id AS "modelId",w.graph FROM agents a LEFT JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id WHERE a.user_id=$1 AND a.deleted_at IS NULL ORDER BY a.updated_at DESC`,
            [user],
        ),
        db.query<{
            id: string;
            name: string;
            purpose: string;
            method: string;
            summary: string | null;
            operations: unknown;
            analyzedAt: Date | null;
            updatedAt: Date;
        }>(
            `SELECT t.id,t.name,t.purpose,t.method,t.updated_at AS "updatedAt",k.summary,k.operations,k.analyzed_at AS "analyzedAt" FROM tools t LEFT JOIN tool_knowledge k ON k.user_id=t.user_id AND k.tool_id=t.id WHERE t.user_id=$1 ORDER BY t.updated_at DESC`,
            [user],
        ),
        readToolKnowledge(user, member.role === "admin"),
        listAgentShares(user),
        listPlaygroundTools(user, member),
    ]);
    const tools: Entry[] = [
        ...custom.rows.map((t) => {
            const current = !!t.analyzedAt && new Date(t.analyzedAt) >= new Date(t.updatedAt);
            return {
                id: t.id,
                name: t.name,
                category: "Custom tool",
                purpose: t.purpose,
                status: "Saved API tool definition; endpoint availability and credentials have not been checked by this catalog read.",
                details: [
                    `HTTP method: ${t.method}`,
                    current && t.summary
                        ? "Saved analysis: " + clean(t.summary)
                        : "Analysis: NULL — analyze this tool in Tool Library to add a current summary.",
                    ...(current && Array.isArray(t.operations)
                        ? t.operations
                              .filter((o): o is string => typeof o === "string")
                              .map((o) => "Declared operation: " + clean(o))
                        : []),
                ],
                href: "/dashboard/tools",
            };
        }),
        ...knowledge.items.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            purpose: t.purpose,
            status: t.status,
            details: [
                t.configured
                    ? "Configuration: enabled/configured metadata. This is not an execution or health check."
                    : "Configuration: NULL — configure this tool to add meaningful data.",
                ...knowledgeDetails(t.knowledge),
            ],
            href: "/dashboard/tools",
        })),
    ];
    const owned: Entry[] = agents.rows.map((a) => {
        let refs: ReturnType<typeof agentReferences> = [],
            status = "No saved workflow. Configure this agent in Agent Studio.";
        if (a.graph) {
            try {
                refs = agentReferences(a.graph);
                status =
                    "Saved workflow metadata; execution readiness has not been verified by this read.";
            } catch {
                status =
                    "Saved workflow needs attention before execution. Review its connections in Agent Studio.";
            }
        }
        return {
            id: a.id,
            name: a.name,
            category: "Your agent",
            purpose: a.purpose,
            status,
            details: [
                `Model: ${a.modelId || "NULL — choose a model"}`,
                `Connected references: ${refs.length}`,
                ...refs.map((r) => {
                    const id = String(r.data.referenceId || "");
                    const item =
                        r.data.referenceKind === "agent"
                            ? agents.rows.find((a) => a.id === id)
                            : tools.find((t) => t.id === id);
                    return `Connected ${r.data.referenceKind === "agent" ? "agent" : "tool"}: ${item ? clean(item.name) : "unavailable or outside your accessible catalog"}`;
                }),
            ],
            href: "/agent-builder/" + a.id,
        };
    });
    const resolvedConnections = await playgroundConnectionSources(user, member, connections);
    const connected: Entry[] = connections.map((c) => {
        const source = tools.find(
            (t) =>
                t.id ===
                (c.source_kind === "project" ? "project:" + c.reference_id : c.reference_id),
        );
        const available = resolvedConnections.get(c.id)?.available ?? false;
        return {
            id: "playground:" + c.id,
            name: c.name,
            purpose: c.purpose,
            category: c.shared ? "Admin-shared Playground tool" : "Playground tool",
            status: !c.enabled
                ? "Disabled in Playground."
                : available
                  ? "Connected to Playground for read-only questions; inputs and current permissions are checked before each use."
                  : "NULL — the source is deleted or inaccessible. Reconfigure this connection.",
            details: ["Source kind: " + c.source_kind, ...(source ? [source.status] : [])],
            href: "/dashboard/tools#playground-tools",
        };
    });
    const entries: Entry[] = [
        ...connected,
        ...owned,
        ...shares.shared.map((s) => ({
            id: s.id,
            name: s.name,
            purpose: s.purpose,
            category: "Shared agent",
            status: `Shared release version ${s.version}. Private owner configuration is not included.`,
            details: ["Changes appear here after the owner updates the shared release."],
            href: "/agent-builder/" + s.id + "/shared",
        })),
        ...tools,
    ];
    let selected = entries.filter((e) => mentions(input, e.name));
    if (!selected.length && /\b(?:it|that|this)\b/i.test(input)) {
        const previous = [...messages]
            .reverse()
            .find(
                (m) =>
                    m.role === "user" &&
                    m.content !== input &&
                    entries.some((e) => mentions(m.content, e.name)),
            );
        if (previous) selected = entries.filter((e) => mentions(previous.content, e.name));
    }
    const explicit = /\b(?:agents?|tools?|tool library)\b/i.test(input);
    if (!selected.length && !explicit) return null;
    const specific =
        explicit &&
        /\b(?:what does|tell me about|explain|describe|is there|named|called)\b/i.test(input) &&
        !/\b(?:all|list|available|my agents|my tools|tool library)\b/i.test(input);
    if (!selected.length && !specific) {
        const agentOnly = /\bagents?\b/i.test(input) && !/\btools?\b/i.test(input),
            toolOnly = /\btools?\b/i.test(input) && !/\bagents?\b/i.test(input);
        selected = entries.filter((e) =>
            agentOnly
                ? e.category.endsWith("agent")
                : toolOnly
                  ? !e.category.endsWith("agent")
                  : true,
        );
    }
    const detail =
        entries.some((e) => mentions(input, e.name)) ||
        (/\b(?:it|that|this)\b/i.test(input) && selected.length === 1);
    const shown = selected.slice(0, 40);
    const reply =
        `**Your accessible agents and tools**\n\nChecked the saved catalog just now. ${owned.length} owned agents, ${shares.shared.length} shared agents and ${tools.length} source tools and ${connections.length} Playground connections are visible to your account.\n\n` +
        (shown.length
            ? shown
                  .map(
                      (e) =>
                          `### ${clean(e.name)} · ${e.category}\n${clean(e.purpose) || "Purpose: NULL — add a meaningful description."}\n\n${e.status}\n` +
                          (detail ? e.details.map((d) => "- " + clean(d)).join("\n") + "\n" : "") +
                          `[Open ${clean(e.name)}](${e.href})`,
                  )
                  .join("\n\n")
            : "No matching saved items are visible to your account. Check the exact name and your sharing permissions.") +
        (selected.length > shown.length
            ? `\n\nShowing ${shown.length} of ${selected.length} matching items. Ask about an exact name to see its details.`
            : "") +
        "\n\nThis reads saved definitions and configuration metadata. It does not run agents, call tool endpoints, or verify live source data. New owned agents and tools are included on your next question; deleted items and revoked shares are excluded.";
    return {
        reply,
        choices: ["List my agents", "List my tools"],
        responseMode: "workspace",
        recordedAt: new Date().toISOString(),
    };
}
