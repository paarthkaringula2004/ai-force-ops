import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";

import { getRequestSession } from "@/lib/request-session";

import {
    studioPresets,
    presetGraph,
    ensureCyberAssistTools,
    ensureMeetingRoomTool,
    type StudioPreset,
} from "@/lib/agent-studio-presets";

import { projectTools } from "@/lib/agent-project-tools";

import { workspaceAccess } from "@/lib/workspace-access";

import { permitted } from "@/lib/workspace-permissions";

import { requireSameOrigin } from "@/lib/service-review/ingestion";

export async function POST(request: Request) {
    const session = await getRequestSession(request);

    if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });

    if (!permitted(await workspaceAccess(session.user.id), "agent_studio"))
        return Response.json({ error: "Agent Studio access required." }, { status: 403 });

    try {
        requireSameOrigin(request);
    } catch {
        return Response.json({ error: "Invalid origin." }, { status: 403 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Choose a starter." }, { status: 400 });
    }

    if (!body || !Object.hasOwn(studioPresets, body.preset))
        return Response.json(
            { error: "Choose CyberOps, Workplace or Actionable." },
            { status: 400 },
        );

    const preset = studioPresets[body.preset as StudioPreset],
        client = await db.connect();

    try {
        await client.query("BEGIN");

        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `studio-presets:${session.user.id}`,
        ]);

        async function create(
            name: string,
            purpose: string,
            graph: ReturnType<typeof presetGraph>,
        ) {
            const old = await client.query(
                `SELECT a.id,a.model_id,w.graph FROM agents a LEFT JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id WHERE a.user_id=$1 AND a.name=$2 AND a.deleted_at IS NULL ORDER BY a.created_at LIMIT 1`,
                [session!.user.id, name],
            );

            if (old.rowCount) {
                const row = old.rows[0];

                // Installing a starter replaces legacy sample steps once, with a recoverable backup.

                // Reopening an installed starter never overwrites later edits.

                if (
                    row.graph?.nodes?.some(
                        (n: { data?: { studioPreset?: boolean } }) => n.data?.studioPreset,
                    )
                ) {
                    const upgraded =
                        name === "CyberOpsAgent"
                            ? ensureCyberAssistTools(row.graph)
                            : name === "MeetRoom"
                              ? ensureMeetingRoomTool(row.graph)
                              : row.graph;

                    if (upgraded !== row.graph)
                        await client.query(
                            "UPDATE agent_workflows SET graph=$3::jsonb,updated_at=now() WHERE user_id=$1 AND agent_id=$2",
                            [session!.user.id, row.id, JSON.stringify(upgraded)],
                        );

                    return { id: row.id as string, created: false };
                }

                if (name === "CyberOpsAgent") graph = ensureCyberAssistTools(graph);

                if (row.graph)
                    await client.query(
                        `INSERT INTO agent_studio_backups(id,user_id,agent_id,graph) VALUES($1,$2,$3,$4)`,
                        [randomUUID(), session!.user.id, row.id, JSON.stringify(row.graph)],
                    );

                const modelNode = graph.nodes.find((n) => n.type === "ModelNode"),
                    main = graph.nodes.find((n) => n.type === "AgentNode");

                if (modelNode) modelNode.data.modelId = row.model_id || "gpt-4.1-mini";

                if (main) main.data.studioPreset = true;

                await client.query(
                    `INSERT INTO agent_workflows (user_id,agent_id,graph) VALUES ($1,$2,$3::jsonb) ON CONFLICT (user_id,agent_id) DO UPDATE SET graph=EXCLUDED.graph,updated_at=now()`,
                    [session!.user.id, row.id, JSON.stringify(graph)],
                );

                return { id: row.id as string, created: false };
            }

            if (name === "CyberOpsAgent") graph = ensureCyberAssistTools(graph);

            const id = randomUUID();

            const main = graph.nodes.find((n) => n.type === "AgentNode");
            if (main) main.data.studioPreset = true;

            await client.query(
                `INSERT INTO agents (id,user_id,name,purpose,model_id,instructions) VALUES ($1,$2,$3,$4,$5,$6)`,
                [
                    id,
                    session!.user.id,
                    name,
                    purpose,
                    "gpt-4.1-mini",
                    graph.nodes.find((n) => n.type === "AgentNode")?.data.instructions || "",
                ],
            );

            await client.query(
                `INSERT INTO agent_workflows (user_id,agent_id,graph) VALUES ($1,$2,$3::jsonb)`,
                [session!.user.id, id, JSON.stringify(graph)],
            );

            return { id, created: true };
        }

        const graph = presetGraph(preset.name, preset.purpose);

        for (const [index, child] of preset.children.entries()) {
            const childGraph = presetGraph(child.name, child.purpose);

            for (const [toolIndex, toolId] of child.tools.entries()) {
                const tool = projectTools.find((t) => t.id === toolId)!;

                const id = `tool-${toolId}`;

                childGraph.nodes.push({
                    id,
                    type: "ReferenceNode",
                    position: { x: 940, y: 400 + toolIndex * 110 },
                    data: {
                        label: tool.name,
                        referenceKind: "builtin",
                        referenceId: toolId,
                        purpose: tool.purpose,
                    },
                });

                childGraph.edges.push({
                    id: `tools-${id}`,
                    source: "tools",
                    sourceHandle: "children",
                    target: id,
                });
            }

            const saved = await create(child.name, child.purpose, childGraph),
                id = `agent-${index}`;

            graph.nodes.push({
                id,
                type: "ReferenceNode",
                position: { x: 980, y: 30 + index * 110 },
                data: {
                    label: child.name,
                    referenceKind: "agent",
                    referenceId: saved.id,
                    purpose: child.purpose,
                },
            });

            graph.edges.push({ id: `agents-${id}`, source: "agents", target: id });
        }

        const main = await create(preset.name, preset.purpose, graph);

        await client.query("COMMIT");

        return Response.json({ agentId: main.id, created: main.created });
    } catch {
        await client.query("ROLLBACK");
        return Response.json(
            { error: "Could not create the starter. Your existing agents were preserved." },
            { status: 503 },
        );
    } finally {
        client.release();
    }
}
