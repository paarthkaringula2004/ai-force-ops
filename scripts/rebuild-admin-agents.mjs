import "./load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import { load } from "../tests/helpers/load-ts.mjs";

// Local maintenance utility: rebuild saved source definitions without replacing edits.
const email = process.argv[2];
if (!email) throw new Error("Supply the existing Admin email, followed by --apply to rebuild.");
const db = new pg.Pool({ ...postgresConnectionOptions(), max: 2 });
const created = [];
const preserved = [];

try {
    const account = (await db.query(`SELECT u.id,u.email,m.role,m.active FROM "user" u JOIN workspace_members m ON m.user_id=u.id WHERE lower(u.email)=lower($1)`, [email])).rows[0];
    if (!account || account.role !== "admin" || !account.active)
        throw new Error("Recovery requires the specified existing active Admin account.");
    const user = account.id;
    const { studioPresets, presetGraph, ensureCyberAssistTools } = load("lib/agent-studio-presets.ts");
    const { studioGraph, studioDependencies } = load("lib/agent-studio-graph.ts");
    const { normalizeWorkflowGraph } = load("lib/workflow-graph.ts");
    const { projectTools } = load("lib/agent-project-tools.ts");
    const { demoAgentTemplates } = load("lib/integrations/templates.ts");
    const { installIntegrationTemplate } = load("lib/integrations/install.ts", {
        "../db": { db }, "@/lib/db": { db },
    });
    const names = new Set(demoAgentTemplates.map(t => t.name));
    for (const preset of Object.values(studioPresets)) {
        names.add(preset.name);
        for (const child of preset.children) names.add(child.name);
    }
    names.add("Actual Agent");

    if (!process.argv.includes("--apply")) {
        console.log(JSON.stringify({ email: account.email, plannedAgents: [...names], mode: "dry-run" }));
    } else {
        const directory = join(homedir(), "Documents", "AIForce-Ops-Recovery", new Date().toISOString().replaceAll(":", "-"));
        await mkdir(directory, { recursive: true });
        async function snapshot(label) {
            const agents = (await db.query("SELECT a.*,w.graph FROM agents a LEFT JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id WHERE a.user_id=$1", [user])).rows;
            const tools = (await db.query("SELECT * FROM tools WHERE user_id=$1", [user])).rows;
            await writeFile(join(directory, label + ".json"), JSON.stringify({ email: account.email, savedAt: new Date().toISOString(), agents, tools }, null, 2));
        }
        await snapshot("before-rebuild");

        // An empty migrated database has no integration owner. Admin agent runs
        // require this organization binding, even when no provider is connected.
        const owner = await db.query("UPDATE organization_workspace SET owner_id=$1,updated_at=now() WHERE id=true AND owner_id IS NULL RETURNING owner_id", [user]);
        if (owner.rowCount)
            await db.query("INSERT INTO workspace_audit(id,target_id,action,details) VALUES($1,$2,$3,$4::jsonb)", [randomUUID(), user, "organization.owner_recovered", JSON.stringify({ reason: "Initialize missing integration owner during Admin agent reconstruction" })]);

        // Keep the richer Qualys integration graph when CyberOps reuses that specialist.
        for (const template of demoAgentTemplates) {
            const saved = await installIntegrationTemplate(user, template.id);
            (saved.created ? created : preserved).push(saved.name);
        }

        async function save(client, name, purpose, graph) {
            const existing = (await client.query("SELECT id FROM agents WHERE user_id=$1 AND name=$2 AND deleted_at IS NULL ORDER BY created_at LIMIT 1", [user, name])).rows[0];
            if (existing) { preserved.push(name); return existing.id; }
            const normalized = normalizeWorkflowGraph(graph.nodes, graph.edges);
            const root = studioDependencies(normalized).root;
            if (root) root.data.studioPreset = true;
            const id = randomUUID();
            await client.query("INSERT INTO agents(id,user_id,name,purpose,model_id,instructions) VALUES($1,$2,$3,$4,$5,$6)", [id, user, name, purpose, root?.data.modelId || "gpt-4.1-mini", root?.data.instructions || ""]);
            await client.query("INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3::jsonb)", [user, id, JSON.stringify(normalized)]);
            created.push(name);
            return id;
        }

        for (const preset of Object.values(studioPresets)) {
            const client = await db.connect();
            try {
                await client.query("BEGIN");
                await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`studio-presets:${user}`]);
                let graph = presetGraph(preset.name, preset.purpose);
                for (const [index, child] of preset.children.entries()) {
                    const childGraph = presetGraph(child.name, child.purpose);
                    for (const [toolIndex, toolId] of child.tools.entries()) {
                        const tool = projectTools.find(t => t.id === toolId);
                        assert.ok(tool, `Missing built-in tool ${toolId}`);
                        const id = `tool-${toolId}`;
                        childGraph.nodes.push({ id, type: "ReferenceNode", position: { x: 940, y: 400 + toolIndex * 110 }, data: { label: tool.name, referenceKind: "builtin", referenceId: toolId, purpose: tool.purpose } });
                        childGraph.edges.push({ id: `tools-${id}`, source: "tools", sourceHandle: "children", target: id });
                    }
                    const childId = await save(client, child.name, child.purpose, childGraph);
                    const id = `agent-${index}`;
                    graph.nodes.push({ id, type: "ReferenceNode", position: { x: 980, y: 30 + index * 110 }, data: { label: child.name, referenceKind: "agent", referenceId: childId, purpose: child.purpose } });
                    graph.edges.push({ id: `agents-${id}`, source: "agents", target: id });
                }
                if (preset.name === "CyberOpsAgent") graph = ensureCyberAssistTools(graph);
                await save(client, preset.name, preset.purpose, graph);
                await client.query("COMMIT");
            } catch (error) { await client.query("ROLLBACK"); throw error; }
            finally { client.release(); }
        }

        // The historical audit recorded this unfinished draft with Start only.
        const draft = studioGraph("Actual Agent");
        draft.nodes = draft.nodes.filter(n => n.type === "StartNode");
        draft.nodes[0].data = { label: "Start", workflowMode: "actual" };
        draft.edges = [];
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`studio-presets:${user}`]);
            await save(client, "Actual Agent", "", draft);
            await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }

        // Historical tool audit retained this public repository lookup. Replace
        // the OWNER/REPO sample with inputs supported by the existing tool runtime.
        await db.query(`INSERT INTO tools(id,user_id,name,purpose,method,endpoint_url)
            SELECT $1,$2,'GitHub repository lookup',$3,'GET','https://api.github.com/repos/{owner}/{repo}'
            WHERE NOT EXISTS (SELECT 1 FROM tools WHERE user_id=$2 AND name='GitHub repository lookup')`,
            [randomUUID(), user, 'Retrieve current public GitHub repository details. Supply JSON {"owner":"repository-owner","repo":"repository-name"}. Returns the source repository name, description, stars, forks, open issues, language, branch, license, and timestamps.']);

        const all = (await db.query("SELECT a.id,a.name,w.graph FROM agents a JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id WHERE a.user_id=$1 AND a.deleted_at IS NULL", [user])).rows;
        const byId = new Map(all.map(a => [a.id, a]));
        const toolIds = new Set(projectTools.map(t => t.id));
        for (const name of names) assert.ok(all.some(a => a.name === name), `Missing agent ${name}`);
        for (const agent of all.filter(a => names.has(a.name))) {
            normalizeWorkflowGraph(agent.graph.nodes, agent.graph.edges);
            for (const ref of studioDependencies(agent.graph).references) {
                if (ref.data.referenceKind === "agent") assert.ok(byId.has(ref.data.referenceId), `Broken specialist in ${agent.name}`);
                if (ref.data.referenceKind === "builtin") assert.ok(toolIds.has(ref.data.referenceId), `Unknown tool in ${agent.name}`);
            }
        }
        await db.query("INSERT INTO workspace_audit(id,target_id,action,details) VALUES($1,$2,$3,$4::jsonb)", [randomUUID(), user, "agents.rebuilt_from_source", JSON.stringify({ created, preserved: [...new Set(preserved)], source: "saved presets, integration templates, and historical audit; not a Railway database restore" })]);
        await snapshot("after-rebuild");
        const report = { email: account.email, created, preserved: [...new Set(preserved)], agentCount: all.length, verifiedGraphs: true, backupDirectory: directory, missing: ["deleted database credentials", "uploaded knowledge", "old sharing records", "unrecorded custom edits"] };
        await writeFile(join(directory, "rebuild-report.json"), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    }
} finally { await db.end(); }
