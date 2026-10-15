import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.WORKSPACE_TEST_URL || 'http://localhost:3000';
const users = [];
async function account(role) {
  const response = await fetch(base + '/api/auth/sign-up/email', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Disposable ticket policy test', email: `tickets-${randomUUID()}@example.invalid`, password: randomUUID() + 'Aa1!' }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const id = (await response.json()).user.id;
  users.push(id);
  const member = (await db.query('SELECT role FROM workspace_members WHERE user_id=$1', [id])).rows[0];
  assert.equal(member.role, 'user');
  if (role !== 'user') await db.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1', [id, role]);
  return { id, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function call(account, path, body, status = 200) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET', headers: { Cookie: account.cookie, Origin: base, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, status, path + ': ' + JSON.stringify(data));
  return data;
}
try {
  const user = await account('user'), employee = await account('employee'), manager = await account('manager'), admin = await account('admin');
  const balance = async a => (await call(a, '/api/workspace/tickets')).balance;
  assert.equal(await balance(user), 5);
  assert.equal(await balance(employee), 50);
  assert.equal(await balance(manager), 100);
  assert.equal((await call(admin, '/api/workspace/tickets')).unlimited, true);
  await db.query('UPDATE ticket_wallets SET balance=40 WHERE user_id=$1', [employee.id]);
  assert.equal(await balance(employee), 40, 'Same-day balance is retained');
  await db.query("UPDATE ticket_wallets SET last_refill_date=(now() AT TIME ZONE 'Asia/Kolkata')::date-1 WHERE user_id=$1", [employee.id]);
  assert.equal(await balance(employee), 50, 'Daily refill resets, rather than adds');
  await db.query("UPDATE ticket_wallets SET balance=80,last_refill_date=(now() AT TIME ZONE 'Asia/Kolkata')::date-1 WHERE user_id=$1", [manager.id]);
  assert.equal(await balance(manager), 100);
  await db.query("UPDATE workspace_members SET role='manager' WHERE user_id=$1", [employee.id]);
  assert.equal(await balance(employee), 100, 'Promotion immediately changes the allowance');
  const topup = { userId: manager.id, amount: 20, requestId: randomUUID() };
  assert.equal((await call(admin, '/api/workspace/tickets', topup)).balance, 120);
  assert.equal((await call(admin, '/api/workspace/tickets', topup)).balance, 120, 'Retry cannot double-credit');
  await call(manager, '/api/workspace/tickets', { ...topup, requestId: randomUUID() }, 403);
  await call(user, '/api/workspace/tickets', { ...topup, requestId: randomUUID() }, 403);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM workspace_audit WHERE id=$1 AND details->>'payment'='false'", [topup.requestId])).rows[0].count, 1);
  assert.equal((await call(manager, '/api/workspace/access')).member.ticket_balance, 120);
  await db.query("UPDATE ticket_wallets SET last_refill_date=(now() AT TIME ZONE 'Asia/Kolkata')::date-1 WHERE user_id=$1", [manager.id]);
  assert.equal(await balance(manager), 100, 'Top-ups do not accumulate across daily resets');
  console.log('PASS: User 5, Employee 50, Manager 100, Admin unlimited; IST daily reset; promotion; audited payment-free top-up; retry safety; header balance API.');
} finally {
  await db.query('DELETE FROM organization_security_events WHERE actor_id=ANY($1::text[])', [users]);
  await db.query('DELETE FROM workspace_audit WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])', [users]);
  for (const id of users) await db.query('DELETE FROM "user" WHERE id=$1', [id]);
  await db.end();
}
