import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { InputError, type PrivateConnection } from './transport';
import { object, type Json } from './types';
import { securityPolicy } from './security';

export async function connection(user: string,id: string) {
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new InputError('Select an integration.');
  const result=await db.query<PrivateConnection>('SELECT * FROM eassist_connections WHERE user_id=$1 AND id=$2',[user,id]);
  if(!result.rows[0])throw new InputError('Integration not found.',404);
  return result.rows[0];
}
export async function audit(user:string,connectionId:string|null,action:string,target='',detail='') {
  await db.query('INSERT INTO eassist_activity(user_id,connection_id,action,target,detail) VALUES($1,$2,$3,$4,$5)',[user,connectionId,action,target,detail.slice(0,4000)]);
}
export async function putRecord(c:PrivateConnection,kind:string,id:string,data:Json) {
  await db.query(`INSERT INTO eassist_records(id,user_id,connection_id,kind,external_id,data) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(user_id,connection_id,kind,external_id) DO UPDATE SET data=EXCLUDED.data,observed_at=now(),updated_at=now()
    WHERE eassist_records.data IS DISTINCT FROM EXCLUDED.data`,[randomUUID(),c.user_id,c.id,kind,id,JSON.stringify(data)]);
}
export async function snapshot(user:string) {
  // Read the cursor first: a concurrent write must cause another refresh,
  // rather than advancing the client beyond data it has not received yet.
  const revision=await db.query('SELECT revision::text FROM eassist_revisions WHERE user_id=$1',[user]);
  const [connections,records,activity]=await Promise.all([
    db.query(`SELECT id,name,kind,base_url,project_id,auth_type,username,enabled,state,last_error,checked_at,secret_cipher<>'' AS has_secret,webhook_hash IS NOT NULL AS has_webhook FROM eassist_connections WHERE user_id=$1 ORDER BY created_at`,[user]),
    db.query(`SELECT id,connection_id,kind,external_id,data,observed_at,updated_at FROM eassist_records WHERE user_id=$1 AND kind NOT IN ('output','journal','monitoring') ORDER BY updated_at DESC LIMIT 5000`,[user]),
    db.query('SELECT id,action,target,detail,created_at FROM eassist_activity WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[user]),
  ]);
  const operations=await db.query(`SELECT id,connection_id,action,target,state,created_at,result FROM eassist_operations WHERE user_id=$1 AND state IN ('unknown','pending') ORDER BY created_at DESC LIMIT 100`,[user]);
  return {connections:connections.rows,records:records.rows,activity:activity.rows,operations:operations.rows,security:await securityPolicy(user),revision:revision.rows[0]?.revision || '0',limits:{records:5000,activity:100}};
}
export async function recordData(user:string,connectionId:string,kind:string,id:string) {
  const r=await db.query('SELECT data FROM eassist_records WHERE user_id=$1 AND connection_id=$2 AND kind=$3 AND external_id=$4',[user,connectionId,kind,id]);
  return object(r.rows[0]?.data);
}
