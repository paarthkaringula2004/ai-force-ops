import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require = createRequire(import.meta.url);
function load(path, deps = {}) { const m = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => name in deps ? deps[name] : require(name), m, m.exports); return m.exports; }
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), client = await pool.connect();
const db = { query: (...args) => client.query(...args), connect: async () => ({ query: (sql, args) => client.query(sql.startsWith('BEGIN') ? 'SAVEPOINT share_test' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT share_test' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT share_test' : sql, args), release: () => {} }) };
const graphs = load('lib/agent-studio-graph.ts');
const permissions = load('lib/workspace-permissions.ts');
const access = load('lib/workspace-access.ts', { '@/lib/db': { db } });
const flows = load('lib/agent-flow.ts', {'./eassist/transport':{InputError},'./agent-studio-graph':graphs});
const sharing = load('lib/agent-sharing.ts', { './agent-flow':flows, './db': { db }, './workspace-access': access, './agent-studio-graph': graphs, './eassist/transport': { InputError } });
try {
  await client.query('BEGIN');
  const owner = randomUUID(), another = randomUUID(), agentId = randomUUID(), childId = randomUUID();
  const people = {};
  for (const [id, name, role] of [[owner, 'Owner', 'admin'], [another, 'Another Admin', 'admin'], ...['user', 'manager', 'employee'].flatMap(role => [[randomUUID(), role + ' one', role], [randomUUID(), role + ' two', role]])]) {
    await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [id, name, id + '@example.invalid']);
    await client.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1', [id, role]);
    (people[role] ??= []).push(id);
  }
  const root = graphs.studioGraph('Security Agent'), child = graphs.studioGraph('Security reports');
  root.nodes.push({ id: 'child', type: 'ReferenceNode', position: { x: 0, y: 0 }, data: { label: 'Security reports', referenceKind: 'agent', referenceId: childId } }); root.edges.push({ id: 'child-edge', source: 'agents', target: 'child' });
  child.nodes.push({ id: 'scan', type: 'ReferenceNode', position: { x: 0, y: 0 }, data: { label: 'Reports', referenceKind: 'builtin', referenceId: 'scan_reports', apiKey: 'must-not-be-in-snapshot' } }); child.edges.push({ id: 'scan-edge', source: 'tools', target: 'scan' });
  for (const [id, graph] of [[agentId, root], [childId, child]]) { await client.query("INSERT INTO agents(id,user_id,name,model_id,instructions) VALUES($1,$2,$3,'gpt-4.1-mini','Use evidence')", [id, owner, id === agentId ? 'Security Agent' : 'Security reports']); await client.query('INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)', [owner, id, JSON.stringify(graph)]); }
  await assert.rejects(() => sharing.saveAgentShare(people.user[0], agentId, ['user']), error => error.status === 403);
  await assert.rejects(() => sharing.saveAgentShare(another, agentId, ['user']), error => error.status === 404);
  assert.deepEqual(sharing.parseShareRoles(['admin']), ['admin']); assert.throws(() => sharing.parseShareRoles(['owner']), /Choose/); assert.throws(() => sharing.parseShareRoles(['user', 'user']), /Choose/);
  const saved = await sharing.saveAgentShare(owner, agentId, ['manager', 'employee']); assert.equal(saved.shared, true); assert.ok(saved.shareId);
  for (const role of ['manager', 'employee']) for (const person of people[role]) { const clone = await sharing.loadSharedAgent(person, saved.shareId); assert.equal(clone.ownerId, owner); assert.equal(Object.keys(clone.snapshot.releases).length, 2); assert.equal((await sharing.listAgentShares(person)).shared[0].id, saved.shareId); assert.equal(JSON.stringify(clone.snapshot).includes('must-not-be-in-snapshot'), false); }
  for (const person of people.user) await assert.rejects(() => sharing.loadSharedAgent(person, saved.shareId), error => error.status === 403);
  await client.query("UPDATE agent_workflows SET graph=jsonb_set(graph,'{nodes,1,data,instructions}','\"Changed draft\"') WHERE user_id=$1 AND agent_id=$2", [owner, agentId]);
  assert.equal(JSON.stringify((await sharing.loadSharedAgent(people.manager[0], saved.shareId)).snapshot).includes('Changed draft'), false);
  const updated = await sharing.saveAgentShare(owner, agentId, ['user']); assert.equal(updated.shareId, saved.shareId); assert.equal(updated.version, 2);
  for (const person of people.user) assert.equal((await sharing.loadSharedAgent(person, saved.shareId)).version, 2);
  const newUser = randomUUID();
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [newUser, 'New User after sharing', newUser + '@example.invalid']);
  assert.equal((await sharing.listAgentShares(newUser)).shared[0].id, saved.shareId);
  assert.equal((await sharing.loadSharedAgent(newUser, saved.shareId)).version, 2);

  await assert.rejects(() => sharing.loadSharedAgent(people.manager[0], saved.shareId), error => error.status === 403);
  await client.query('UPDATE workspace_members SET active=false WHERE user_id=$1', [people.user[0]]); await assert.rejects(() => sharing.loadSharedAgent(people.user[0], saved.shareId), error => error.status === 403);
  await client.query('UPDATE workspace_members SET active=false WHERE user_id=$1', [owner]); await assert.rejects(() => sharing.loadSharedAgent(people.user[1], saved.shareId), error => error.status === 403); await client.query('UPDATE workspace_members SET active=true WHERE user_id=$1', [owner]);
  await client.query('UPDATE agents SET deleted_at=now() WHERE user_id=$1 AND id=$2', [owner, agentId]); await assert.rejects(() => sharing.loadSharedAgent(people.user[1], saved.shareId), error => error.status === 403); await client.query('UPDATE agents SET deleted_at=NULL WHERE user_id=$1 AND id=$2', [owner, agentId]);
  const routeDeps = { '@/lib/request-session': { getRequestSession: async () => ({ user: { id: people.user[1] } }) }, '@/lib/agent-sharing': sharing, '@/lib/eassist/transport': { InputError, boundedJson: async request => request.json() }, '@/lib/service-review/ingestion': { requireSameOrigin: () => {} }, '@/config/Arcjet': { protectOpenAiRequest: async () => null }, '@/lib/agent-studio-runtime': { runStudioAgent: async (actor, id, messages, deps) => { assert.equal(actor, owner); assert.equal(id, agentId); assert.equal(deps.sharedViewer, people.user[1]); assert.ok(deps.releases[childId]); assert.deepEqual(Object.keys(messages[0]).sort(), ['content', 'role']); await deps.checkSharedAccess(); return { reply: 'Verified', charts: [], trace: [], usage: {} }; } } };
  const route = load('app/api/agents/[agentId]/shared/route.ts', routeDeps), context = { params: Promise.resolve({ agentId: saved.shareId }) };
  const meta = await (await route.GET(new Request('http://localhost/api/agents/shared'), context)).json(); assert.equal(meta.agent.name, 'Security Agent'); assert.equal(meta.snapshot, undefined); assert.equal(meta.agent.instructions, undefined);
  const response = await route.POST(new Request('http://localhost/api/agents/shared', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Show vulnerabilities', apiKey: 'client-injection' }] }) }), context); assert.equal(response.status, 200); assert.equal((await response.json()).reply, 'Verified');
  assert.equal((await route.POST(new Request('http://localhost/api/agents/shared', { method: 'POST', body: JSON.stringify({ approvalToken: 'forged' }) }), context)).status, 403);
  await client.query("INSERT INTO agents(id,user_id,name,model_id) VALUES($1,$2,'Different owner same UUID','gpt-4.1-mini')",[agentId,another]);await client.query('INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)',[another,agentId,JSON.stringify(graphs.studioGraph('Other'))]);
  const otherShare=await sharing.saveAgentShare(another,agentId,['user']);assert.notEqual(otherShare.shareId,saved.shareId);assert.equal((await sharing.loadSharedAgent(people.user[1],saved.shareId)).ownerId,owner);assert.equal((await sharing.loadSharedAgent(people.user[1],otherShare.shareId)).ownerId,another);await sharing.saveAgentShare(another,agentId,[]);
  await sharing.saveAgentShare(owner, agentId, []); await assert.rejects(() => sharing.loadSharedAgent(people.user[1], saved.shareId), error => error.status === 403); assert.equal((await sharing.listAgentShares(people.user[1])).shared.length, 0);
  assert.equal((await route.POST(new Request('http://localhost/api/agents/shared', { method: 'POST', body: '{}' }), context)).status, 403);
  const managerOwner=people.manager[0],managerAgent=randomUUID();
  await client.query("INSERT INTO agents(id,user_id,name,model_id) VALUES($1,$2,'Manager owned fixture','gpt-4.1-mini')",[managerAgent,managerOwner]);
  await client.query('INSERT INTO agent_workflows(user_id,agent_id,graph) VALUES($1,$2,$3)',[managerOwner,managerAgent,JSON.stringify(graphs.studioGraph('Manager owned fixture'))]);
  await assert.rejects(()=>sharing.saveAgentShare(managerOwner,agentId,['user'],[people.user[1]]),e=>e.status===404);
  const managerShare=await sharing.saveAgentShare(managerOwner,managerAgent,['admin','employee','user'],[people.user[1]]);
  const managerListing=await sharing.listAgentShares(managerOwner);
  assert.equal(managerListing.shareMode,'recipients');assert.equal(managerListing.canShare,true);assert.ok(managerListing.own.some(s=>s.id===managerAgent));
  for(const person of [another,people.employee[0],people.user[1]]){
   assert.equal((await sharing.loadSharedAgent(person,managerShare.shareId)).ownerId,managerOwner);
   assert.ok((await sharing.listAgentShares(person)).shared.some(s=>s.id===managerShare.shareId));
  }
  await assert.rejects(()=>sharing.loadSharedAgent(people.manager[1],managerShare.shareId),e=>e.status===403);
  await client.query("UPDATE workspace_members SET role='employee' WHERE user_id=$1",[managerOwner]);
  await assert.rejects(()=>sharing.loadSharedAgent(another,managerShare.shareId),e=>e.status===403);
  await assert.rejects(()=>sharing.saveAgentShare(managerOwner,managerAgent,['admin']),e=>e.status===403);
  await client.query("UPDATE workspace_members SET role='manager' WHERE user_id=$1",[managerOwner]);
  await sharing.saveAgentShare(managerOwner,managerAgent,[]);
  await assert.rejects(()=>sharing.loadSharedAgent(another,managerShare.shareId),e=>e.status===403);
  console.log('PASS: Manager-owned sharing to Employee, Admin and User; own sharing controls enabled; foreign-agent resharing denied; unselected roles, owner demotion and revocation enforced.');
  console.log('PASS: all members of selected roles including accounts created after sharing, excluded roles, Admin/Manager ownership, frozen specialist clones, secret stripping, current-source execution context, disabled accounts/owners, deleted agents, role changes, revocation, safe preview metadata and rejected approvals. Real database fixtures rolled back; no provider calls.');
} finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
