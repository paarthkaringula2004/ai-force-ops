import 'dotenv/config';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
const email=process.argv[2];
if(!email)throw new Error('Supply the existing login email: node scripts/bootstrap-workspace-admin.mjs email@example.com');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}); const client=await pool.connect();
try {
 await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(8470220029)");
 if((await client.query("SELECT 1 FROM workspace_members WHERE role='admin' AND active=true")).rowCount)throw new Error('An Admin already exists. Use Administration to assign roles.');
 const row=(await client.query('SELECT id FROM "user" WHERE lower(email)=lower($1)',[email])).rows[0];
 if(!row)throw new Error('No existing account matches that email.');
 await client.query("UPDATE workspace_members SET role='admin',active=true,permissions='{}',updated_at=now() WHERE user_id=$1",[row.id]);
 await client.query("INSERT INTO workspace_audit(id,target_id,action,details) VALUES($1,$2,'admin.bootstrap','{}'::jsonb)",[randomUUID(),row.id]);
 await client.query('COMMIT');console.log('Initial Admin assigned to the specified account.');
} catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
