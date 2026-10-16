import '../scripts/load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
const notifications=load('lib/request-notifications.ts',{'./db':{db:{query:(...args)=>c.query(...args)}}});
try{
 await c.query('BEGIN');const people={};
 for(const [key,role]of [['admin','admin'],['manager','manager'],['otherManager','manager'],['employee','employee'],['outside','employee'],['managerReport','manager'],['user','user']]){
  const id=people[key]=randomUUID();await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Notification '+key,id+'@example.invalid']);await c.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[id,role]);
 }
 await c.query('UPDATE workspace_members SET manager_id=$2 WHERE user_id=ANY($1::text[])',[[people.employee,people.managerReport],people.manager]);
 await c.query('UPDATE workspace_members SET manager_id=$2 WHERE user_id=$1',[people.outside,people.otherManager]);
 const requests={};
 for(const [key,user,kind,status]of [['team',people.employee,'equipment','pending_approval'],['topup',people.employee,'ticket_topup','pending_approval'],['managerLeave',people.managerReport,'leave','pending_approval'],['outside',people.outside,'room','pending_approval'],['adminOwn',people.admin,'access','pending_approval'],['managerOwn',people.manager,'access','pending_approval'],['approved',people.employee,'leave','approved']]){
  const id=requests[key]=randomUUID();await c.query('INSERT INTO employee_service_requests(id,user_id,request_number,kind,status,details) VALUES($1,$2,$3,$4,$5,$6)',[id,user,'REQ-'+id,kind,status,JSON.stringify({reason:'PRIVATE_CONTENT_NOT_FOR_POPUP'})]);
 }
 const manager=await notifications.requestNotificationSnapshot(people.manager);
 assert.deepEqual(manager.notifications.map(n=>n.id),[requests.team]);assert.equal(manager.unreadCount,1);
 assert.equal(JSON.stringify(manager).includes('PRIVATE_CONTENT_NOT_FOR_POPUP'),false);assert.ok(manager.cursor);
 const admin=await notifications.requestNotificationSnapshot(people.admin);
 for(const id of [requests.team,requests.topup,requests.managerLeave,requests.outside,requests.managerOwn])assert.ok(admin.notifications.some(n=>n.id===id));
 assert.ok(!admin.notifications.some(n=>n.id===requests.adminOwn||n.id===requests.approved));
 for(const role of ['user','employee'])await assert.rejects(()=>notifications.requestNotificationSnapshot(people[role]),e=>e.status===403);
 for(const id of [requests.outside,requests.topup,requests.managerLeave,requests.managerOwn])await assert.rejects(()=>notifications.dismissRequestNotification(people.manager,id),e=>e.status===403);
 await notifications.dismissRequestNotification(people.manager,requests.team);await notifications.dismissRequestNotification(people.manager,requests.team);
 assert.equal((await notifications.requestNotificationSnapshot(people.manager)).unreadCount,0,'dismissal persists on subsequent login reads');
 assert.ok((await notifications.requestNotificationSnapshot(people.admin)).notifications.some(n=>n.id===requests.team),'dismissal belongs only to its reviewer');
 assert.equal((await c.query('SELECT status FROM employee_service_requests WHERE id=$1',[requests.team])).rows[0].status,'pending_approval','dismissal must never approve');
 await c.query("UPDATE employee_service_requests SET status='cancelled',updated_at=now() WHERE id=$1",[requests.topup]);assert.ok(!(await notifications.requestNotificationSnapshot(people.admin)).notifications.some(n=>n.id===requests.topup));
 await c.query('UPDATE workspace_members SET active=false WHERE user_id=$1',[people.admin]);await assert.rejects(()=>notifications.requestNotificationSnapshot(people.admin),e=>e.status===403);
 await c.query('UPDATE workspace_members SET active=true WHERE user_id=$1',[people.admin]);
 await c.query('UPDATE workspace_members SET manager_id=$2 WHERE user_id=$1',[people.outside,people.manager]);assert.ok((await notifications.requestNotificationSnapshot(people.manager)).notifications.some(n=>n.id===requests.outside));
 const batch=Array.from({length:25},()=>randomUUID());await c.query("INSERT INTO employee_service_requests(id,user_id,request_number,kind,details) SELECT x,$2,'REQ-'||x::text,'equipment','{}'::jsonb FROM unnest($1::uuid[]) x",[batch,people.employee]);
 const paged=await notifications.requestNotificationSnapshot(people.manager);assert.equal(paged.notifications.length,20);assert.equal(paged.unreadCount,26);
 await notifications.dismissRequestNotification(people.manager,paged.notifications[0].id);const next=await notifications.requestNotificationSnapshot(people.manager);assert.equal(next.notifications.length,20);assert.equal(next.unreadCount,25);
 await c.query('ROLLBACK');
 // Commit a no-op statement: the real DB trigger must wake the shared LISTEN connection.
 const events=load('lib/request-notification-events.ts');let received;
 const wake=new Promise(resolve=>{received=resolve;});let listening=false;
 const sub=events.subscribeRequestChanges(()=>{if(listening)received();});
 try{
  await sub.ready;listening=true;
  await pool.query('UPDATE employee_service_requests SET status=status WHERE false');
  let timer;try{await Promise.race([wake,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No database push received')),10000);})]);}finally{clearTimeout(timer);}
 }finally{sub.unsubscribe();}
 console.log('PASS: real database push, catch-up inbox, reviewer scope, Admin-only top-ups/Manager leave, no self-alerts, durable per-reviewer dismissal, no approval side effects, cancellation, membership changes, privacy and pagination. Fixtures rolled back; no external messages.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
