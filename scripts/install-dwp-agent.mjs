import "./load-env.mjs";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { postgresConnectionOptions } from "../config/postgres.mjs";
import { load } from "../tests/helpers/load-ts.mjs";

const email = process.argv.find((arg) => arg.includes("@"));
if (!email) throw new Error("Provide the existing workspace owner's email and optionally --apply.");
const db = new pg.Pool({ ...postgresConnectionOptions(), max: 1 });
const client = await db.connect();
try {
    const account = (await client.query(`SELECT u.id,m.role,m.active FROM "user" u
        JOIN workspace_members m ON m.user_id=u.id WHERE lower(u.email)=lower($1)`, [email])).rows[0];
    if (!account?.active || account.role !== "admin") throw new Error("Choose an active Admin account.");
    const user = account.id;
    const { studioPresets, presetGraph, ensureDwpTools } = load("lib/agent-studio-presets.ts");
    const { normalizeWorkflowGraph } = load("lib/workflow-graph.ts");
    const { defaultSettings } = load("lib/epace/types.ts");
    const preset = studioPresets.workplace;
    const names = [preset.name, ...preset.children.map(c => c.name)];
    const before = (await client.query(`SELECT a.id,a.name,a.purpose,a.instructions,w.graph
        FROM agents a LEFT JOIN agent_workflows w ON w.user_id=a.user_id AND w.agent_id=a.id
        WHERE a.user_id=$1 AND a.deleted_at IS NULL AND a.name=ANY($2::text[])`, [user, names])).rows;
    if (!process.argv.includes("--apply")) {
        console.log(JSON.stringify({ mode: "dry-run", planned: names, existing: before.map(a=>a.name) }));
    } else {
        const directory = join(homedir(), "Documents", "AIForce-Ops-Recovery", "dwp-" + Date.now());
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, "before.json"), JSON.stringify(before, null, 2));
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`studio-presets:${user}`]);
        const installed = [];
        async function save(name, purpose, incoming) {
            const existing = before.find(a => a.name === name);
            const id = existing?.id || randomUUID();
            const graph = ensureDwpTools(existing?.graph || incoming, name);
            normalizeWorkflowGraph(graph.nodes, graph.edges);
            if (!existing)
                await client.query(`INSERT INTO agents(id,user_id,name,purpose,model_id,instructions)
                    VALUES($1,$2,$3,$4,'gpt-4.1-mini',$5)`, [id,user,name,purpose,graph.nodes.find(n=>n.type==='AgentNode')?.data.instructions || ""]);
            if (existing?.graph && JSON.stringify(graph) !== JSON.stringify(existing.graph))
                await client.query("INSERT INTO agent_studio_backups(id,user_id,agent_id,graph) VALUES($1,$2,$3,$4::jsonb)", [randomUUID(),user,id,JSON.stringify(existing.graph)]);
            await client.query(`INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3::jsonb)
                ON CONFLICT(user_id,agent_id) DO UPDATE SET graph=EXCLUDED.graph,updated_at=now()
                WHERE agent_workflows.graph IS DISTINCT FROM EXCLUDED.graph`, [user,id,JSON.stringify(graph)]);
            installed.push({ id, name });
            return { id, graph };
        }
        const children = [];
        for (const child of preset.children) children.push({ ...child,
            saved: await save(child.name, child.purpose, presetGraph(child.name, child.purpose)) });
        const rootBefore = before.find(a=>a.name===preset.name);
        const graph = ensureDwpTools(rootBefore?.graph || presetGraph(preset.name,preset.purpose), preset.name);
        const hub = graph.nodes.find(n=>n.type==='AgentsNode');
        for (const [index, child] of children.entries()) {
            let node = graph.nodes.find(n=>n.data.referenceKind==='agent' && n.data.referenceId===child.saved.id);
            if (!node) {
                let id = `dwp-specialist-${index}`;
                while(graph.nodes.some(n=>n.id===id)) id='dwp-'+id;
                node={id,type:'ReferenceNode',position:{x:1420,y:40+index*120},data:{label:child.name,referenceKind:'agent',referenceId:child.saved.id,purpose:child.purpose}};
                graph.nodes.push(node);
            }
            if(!graph.edges.some(e=>e.source===hub.id && e.target===node.id))
                graph.edges.push({id:`${hub.id}-${node.id}`,source:hub.id,target:node.id});
        }
        // Root specialist additions must also be preserved by save().
        const old = rootBefore?.graph;
        if(rootBefore) rootBefore.graph=graph;
        const root = await save(preset.name,preset.purpose,graph);
        if(old && JSON.stringify(old)!==JSON.stringify(root.graph))
            await client.query("INSERT INTO agent_studio_backups(id,user_id,agent_id,graph) VALUES($1,$2,$3,$4::jsonb)",[randomUUID(),user,root.id,JSON.stringify(old)]);
        await client.query(`INSERT INTO epace_projects(id,user_id,name,settings)
            SELECT $1,$2,'HR Collection',$3::jsonb WHERE NOT EXISTS (SELECT 1 FROM epace_projects WHERE user_id=$2
            AND (settings->>'dwpCollection'='true' OR lower(name)='hr collection'))`,[randomUUID(),user,JSON.stringify({...defaultSettings,dwpCollection:true})]);
        await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$2,'dwp.installed',$3::jsonb)",[randomUUID(),user,JSON.stringify({agents:installed,backupDirectory:directory})]);
        await client.query("COMMIT");
        writeFileSync(join(directory,"installed.json"),JSON.stringify(installed,null,2));
        console.log(JSON.stringify({installed:installed.map(a=>a.name),backupDirectory:directory}));
    }
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await db.end(); }
