import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const base = process.env.WORKSPACE_TEST_URL || 'http://localhost:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const users = [];
async function account(role) {
  const response = await fetch(base + '/api/auth/sign-up/email', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Disposable navigation ' + role, email: `navigation-${randomUUID()}@example.invalid`, password: randomUUID() + 'Aa1!' }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const id = (await response.json()).user.id;
  users.push(id);
  await pool.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1', [id, role]);
  return { id, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function check(account, path, expected) {
  const response = await fetch(base + path, { headers: { Cookie: account.cookie }, redirect: 'manual' });
  assert.equal(response.status, expected, path + ': ' + (await response.text()).slice(0, 200));
}
try {
  const [employee, manager, admin] = await Promise.all(['employee', 'manager', 'admin'].map(account));
  const confirmation = await fetch(base + '/api/workspace/employment', {
    method: 'POST', headers: { Cookie: admin.cookie, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: manager.id, confirm: true }),
  });
  assert.equal(confirmation.status, 409);
  assert.match((await confirmation.json()).error, /only required for Employees/);
  await Promise.all([
    check(employee, '/api/epace', 403),
    check(employee, '/api/service-review-center/records', 403),
    check(manager, '/api/service-review-center/records', 200),
    check(manager, '/api/epace', 200),
    check(manager, '/api/eassist', 403),
    check(admin, '/api/eassist', 200),
    check(admin, '/api/epace', 200),
  ]);
  await pool.query('UPDATE workspace_members SET employment_verified_at=now() WHERE user_id=$1', [employee.id]);
  await check(employee, '/api/epace', 200);
  await pool.query("UPDATE workspace_members SET permissions=ARRAY['integrations']::text[] WHERE user_id=$1", [manager.id]);
  await check(manager, '/api/eassist', 403);
  console.log('PASS: live API role gates, confirmed Employee ePACE and full Admin eAssist/ePACE access.');
} finally {
  await pool.query('DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])', [users]);
  for (const id of users) await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  await pool.end();
}
