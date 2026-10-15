import { createHash, randomUUID } from 'node:crypto';
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { db } from '@/lib/db';
import type { Reading } from './model';
import { enrichReadings } from './enrichment';

export function validateReading(value: unknown): Reading | null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const item=value as Record<string,unknown>,p=item.payload as Record<string,unknown>;
 if(!p||typeof p!=='object'||Array.isArray(p)||typeof item.recordKey!=='string'||!item.recordKey.trim()||item.recordKey.length>180)return null;
 const str=(k:string,n=240)=>typeof p[k]==='string'&&String(p[k]).trim().length>0&&String(p[k]).length<=n;
 const num=(k:string)=>typeof p[k]==='number'&&Number.isFinite(p[k]);
 const count=()=>num('count')&&Number.isInteger(p.count)&&Number(p.count)>=0;
 const valid=item.recordType==='metric'?str('label')&&num('value')&&(p.unit===undefined||typeof p.unit==='string'&&p.unit.length<=24)
  :item.recordType==='health'?str('device',180)&&str('status',40)
  :item.recordType==='inventory'?str('region',80)&&str('category',80)&&count()
  :item.recordType==='lifecycle'?str('stage',80)&&count()
  :item.recordType==='forecast'?str('environment',40)&&str('period',40)&&num('lowerBound')&&num('upperBound')&&Number(p.lowerBound)<=Number(p.upperBound)&&(p.actual===undefined||num('actual'))
  :item.recordType==='availability'?str('service',180)&&num('availability')&&Number(p.availability)>=0&&Number(p.availability)<=100:false;
 const observedAt=item.observedAt===undefined?new Date():new Date(String(item.observedAt));
 if(!valid||!Number.isFinite(observedAt.getTime())||observedAt.getTime()>Date.now()+300000||JSON.stringify(p).length>16384)return null;
 return {recordType:item.recordType as Reading['recordType'],recordKey:item.recordKey.trim(),payload:p,observedAt:observedAt.toISOString()};
}
export class IngestionError extends Error {constructor(message:string,public status:number){super(message);}}
export async function ingestReadings(user:string, body: unknown) {
 const b=body as {records?:unknown;batchId?:unknown;sourceName?:unknown};
 if(!b||!Array.isArray(b.records)||b.records.length<1||b.records.length>250)throw new IngestionError('Send between 1 and 250 readings.',400);
 if(typeof b.batchId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.batchId))throw new IngestionError('A UUID batchId is required so retries cannot create duplicates.',400);
 const readings=b.records.map(validateReading);
 if(readings.some(r=>!r))throw new IngestionError('Invalid reading: check required fields, numeric ranges and observation timestamps.',400);
 const name=typeof b.sourceName==='string'?b.sourceName.trim():'External collector';
 if(!name||name.length>120)throw new IngestionError('sourceName must have 1–120 characters.',400);
 // Hash original readings rather than generated timestamps so retries without observedAt stay idempotent.
 const hash=createHash('sha256').update(JSON.stringify({records:b.records,sourceName:name})).digest('hex');
 const priorBatch=(await db.query('SELECT body_hash,accepted FROM service_review_ingestions WHERE user_id=$1 AND batch_id=$2',[user,b.batchId])).rows[0];
 if(priorBatch){if(priorBatch.body_hash!==hash)throw new IngestionError('This batchId was already used for different readings.',409);return {accepted:priorBatch.accepted,duplicate:true};}
 await enrichReadings(user,readings as Reading[]);
 const client=await db.connect();
 try {
  await client.query('BEGIN');
  const added=await client.query(`INSERT INTO service_review_ingestions(user_id,batch_id,body_hash,accepted) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING batch_id`,[user,b.batchId,hash,readings.length]);
  if(!added.rowCount){
   const prior=(await client.query('SELECT body_hash,accepted FROM service_review_ingestions WHERE user_id=$1 AND batch_id=$2',[user,b.batchId])).rows[0];
   if(prior.body_hash!==hash)throw new IngestionError('This batchId was already used for different readings.',409);
   await client.query('COMMIT');return {accepted:prior.accepted,duplicate:true};
  }
  for(const r of readings as Reading[])await client.query(`INSERT INTO service_review_records(id,user_id,record_type,record_key,payload,observed_at,source_kind,source_name) VALUES($1,$2,$3,$4,$5::jsonb,$6,'external',$7)`,[randomUUID(),user,r.recordType,r.recordKey,JSON.stringify(r.payload),r.observedAt,name]);
  await client.query('COMMIT');return {accepted:readings.length,duplicate:false};
 } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function collectorUser(request:Request):Promise<string|null> {
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return null;
 const hash=createHash('sha256').update(token).digest('hex');
 const result=await db.query(`UPDATE service_review_tokens SET last_used_at=now() WHERE token_hash=$1 AND expires_at>now() AND (last_used_at IS NULL OR last_used_at<now()-interval '1 second') RETURNING user_id`,[hash]);
 if(result.rowCount) { const user=result.rows[0].user_id; if(!permitted(await workspaceAccess(user),new URL(request.url).pathname.includes("vulnerabilities")?"security":"operations"))throw new IngestionError("Collector owner no longer has access.",403); return user; }
 const exists=await db.query('SELECT user_id FROM service_review_tokens WHERE token_hash=$1 AND expires_at>now()',[hash]);
 if(exists.rowCount)throw new IngestionError('Collector is sending too quickly. Retry after one second.',429);
 throw new IngestionError('Invalid or expired collector token.',401);
}

export function requireSameOrigin(request:Request) {
 const origin=request.headers.get('origin');
 const allowed=[new URL(request.url).origin,process.env.BETTER_AUTH_URL].filter(Boolean);
 if(request.headers.get('sec-fetch-site')==='cross-site'||origin&&!allowed.includes(origin))throw new IngestionError('Cross-site changes are not allowed.',403);
}
