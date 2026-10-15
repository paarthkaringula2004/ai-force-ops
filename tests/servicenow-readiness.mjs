import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, deps) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => name in deps ? deps[name] : require(name), module, module.exports);
  return module.exports;
}
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const connection = { id: '12345678-1234-1234-1234-123456789012', user_id: 'owner', kind: 'servicenow', enabled: true, base_url: 'https://fixture.invalid' };
let lease = true, failure = false, response = { result: [] }, imported = 0;
const updates = [], written = [];
const db = { query: async (sql, args) => { updates.push({ sql, args }); return { rowCount: sql.includes('RETURNING id') ? Number(lease) : 1, rows: [] }; } };
const types = load('lib/eassist/types.ts', {});
const sync = load('lib/eassist/sync.ts', {
  '@/lib/db': { db }, './types': types,
  './transport': { remote: async () => { if (failure) throw new Error('Fixture API unavailable'); return response; } },
  './store': { putRecord: async (...args) => written.push(args), recordData: async () => ({}) },
  '@/lib/workspace-access': {}, '@/lib/workspace-permissions': {}, './platform': {},
  '@/lib/service-review/bridge': { importConnection: async () => { imported++; } }
});
assert.deepEqual(await sync.syncConnection(connection, true), { ok: true });
assert.equal(imported, 1); // Empty incidents still constitute a successful API response.
assert.match(updates.at(-1).sql, /state='connected'/);
lease = false;
assert.deepEqual(await sync.syncConnection(connection, true), { ok: false, reason: 'busy_or_disabled' });
assert.equal(imported, 1);
lease = true; failure = true;
assert.deepEqual(await sync.syncConnection(connection, true), { ok: false, reason: 'failed' });
assert.match(updates.at(-1).sql, /state='error'/);
failure = false; response = { result: [{ missing: 'sys_id' }] };
assert.deepEqual(await sync.syncConnection(connection, true), { ok: false, reason: 'failed' });
assert.equal(written.filter(args => args[1] === 'incidents').length, 0);
response = { result: [{ sys_id: 'fixture', number: 'INC123456' }] };
assert.deepEqual(await sync.syncConnection(connection, true), { ok: true });
assert.equal(written.find(args => args[1] === 'incidents')[2], 'fixture');

let checkResult = { ok: false, reason: 'failed' };
const actions = load('lib/eassist/actions.ts', {
  './organization-context': { sharedOperationsOwner: async () => 'owner' }, './organization-alerts': {}, '@/lib/organization': {},
  '@/lib/workspace-access': { workspaceAccess: async () => ({}) }, '@/lib/workspace-permissions': { permitted: () => true }, './platform': {},
  '@/lib/db': { db }, './store': { connection: async (owner) => { assert.equal(owner, 'owner'); return connection; } }, './types': types,
  './transport': { InputError }, './sync': { syncConnection: async () => checkResult }, './security': { securityPolicy: async () => ({ require_https: true }) }
});
const check = () => actions.action('admin', { action: 'connection.test', connectionId: connection.id });
await assert.rejects(check, error => error.status === 502);
checkResult = { ok: false, reason: 'busy_or_disabled' };
await assert.rejects(check, error => error.status === 409);
checkResult = { ok: true };
const verified = await check(); assert.equal(verified.ok, true); assert.ok(verified.verifiedAt);
console.log('PASS: real collector and connection-test control flow: valid empty/nonempty responses, malformed identities, upstream failure, occupied lease, failure propagation and verification timestamp. Isolated API fixtures; no live tenant contacted.');
