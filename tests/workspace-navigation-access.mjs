import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/workspace-permissions.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { permitted, requiredPermission } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const base = { user_id: 'test', manager_id: null, department: '', employee_id: '', permissions: [], active: true };
const employee = { ...base, role: 'employee' };
const confirmed = { ...employee, employment_verified_at: '2026-10-07T00:00:00Z' };
const manager = { ...base, role: 'manager' };
const admin = { ...base, role: 'admin' };
const user = { ...base, role: 'user' };
for (const member of [user, employee, manager, admin]) assert.equal(permitted(member, 'agent_studio'), true);
for (const member of [user, admin]) assert.equal(permitted(member, requiredPermission('/dashboard/payments')), true);
for (const member of [employee, manager]) assert.equal(permitted(member, requiredPermission('/dashboard/payments')), true, 'Staff can inspect their own past billing and cancel renewal; purchase handlers remain restricted');
assert.equal(permitted(user, 'employee'), false);
assert.equal(permitted(user, 'knowledge'), false);
assert.equal(requiredPermission('/api/eassist/report'), 'signed_in', 'Every role can report runtime failures without gaining eAssist access');

for (const path of ['/api/epace', '/service-review-center/epace']) {
  const permission = requiredPermission(path);
  assert.equal(permitted(employee, permission), false, 'Unconfirmed accounts cannot open ePACE');
  for (const member of [confirmed, manager, admin]) assert.equal(permitted(member, permission), true);
}
for (const path of ['/service-review-center', '/api/service-review-center/records']) {
  const permission = requiredPermission(path);
  for (const member of [employee, confirmed]) assert.equal(permitted(member, permission), false);
  for (const member of [manager, admin]) assert.equal(permitted(member, permission), true);
}
for (const path of ['/api/eassist', '/service-review-center/eassist']) {
  const permission = requiredPermission(path);
  for (const member of [employee, confirmed, manager, { ...manager, permissions: ['integrations'] }]) assert.equal(permitted(member, permission), false, 'Legacy grants cannot bypass eAssist restriction');
  assert.equal(permitted(admin, permission), true);
}
for (const permission of ['employee', 'team', 'admin', 'knowledge', 'integrations', 'operations', 'security', 'agent_studio']) {
  assert.equal(permitted(admin, permission), true, 'Admin retains every permission');
  assert.equal(permitted({ ...admin, active: false }, permission), false);
}
assert.equal(permitted(manager, 'security'), false);
assert.equal(permitted({ ...manager, permissions: ['security'] }, 'security'), false);
assert.equal(permitted(manager, 'agent_studio'), true);
assert.equal(permitted({ ...confirmed, active: false }, 'knowledge'), false);
console.log('PASS: confirmed employee ePACE, Manager Review Center/ePACE, eAssist restriction including legacy grants, disabled accounts and unrestricted Admin.');
