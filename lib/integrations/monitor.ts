import { requireIntegrationAccess } from "./access";
import { db } from "../db";
import { InputError, seal, unseal } from "../eassist/transport";
import { integrationCapabilities, prepareIntegration } from "./runtime";

export async function configureMonitor(user:string,provider:string,operation:string,inputs:unknown,interval:number,enabled:boolean) {
 await requireIntegrationAccess(user,provider);
 const capabilities=await integrationCapabilities(user,provider);
 if(!capabilities.configured)throw new InputError("Save the provider connection first.",409);
 if(!capabilities.operations.some(o=>o.id===operation&&!o.requiresApproval))throw new InputError("Only read operations can be monitored.");
 if(!Number.isInteger(interval)||interval<60||interval>86400)throw new InputError("Choose an interval from 60 seconds to one day.");
 if(!inputs||typeof inputs!=="object"||Array.isArray(inputs)||JSON.stringify(inputs).length>64000)throw new InputError("Provide monitor inputs as a JSON object under 64 KB.");
 await db.query(`INSERT INTO integration_monitors(user_id,provider,operation,inputs_cipher,enabled,interval_seconds) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(user_id,provider) DO UPDATE SET operation=EXCLUDED.operation,inputs_cipher=EXCLUDED.inputs_cipher,enabled=EXCLUDED.enabled,interval_seconds=EXCLUDED.interval_seconds,next_run_at=now(),lease_until=NULL,result_cipher=NULL,last_status='not_checked'`,[user,provider,operation,seal(JSON.stringify(inputs)),enabled,interval]);
}
export async function maintainIntegrationMonitors() {
 // A small leased batch bounds work and prevents multiple app workers polling the same source.
 const jobs=(await db.query(`WITH due AS (SELECT m.user_id,m.provider FROM integration_monitors m JOIN integration_connections c USING(user_id,provider) JOIN workspace_members w USING(user_id) WHERE m.enabled AND c.enabled AND w.active AND m.next_run_at<=now() AND (m.lease_until IS NULL OR m.lease_until<now()) ORDER BY m.next_run_at FOR UPDATE OF m SKIP LOCKED LIMIT 2)
 UPDATE integration_monitors m SET lease_until=now()+interval '3 minutes',next_run_at=now()+m.interval_seconds*interval '1 second' FROM due WHERE m.user_id=due.user_id AND m.provider=due.provider RETURNING m.*`)).rows;
 await Promise.allSettled(jobs.map(async job=>{
  try {
   const capabilities=await integrationCapabilities(job.user_id,job.provider);
   if(!capabilities.operations.some(o=>o.id===job.operation&&!o.requiresApproval))throw new InputError("Monitor operation is no longer read-only.");
   const result=await prepareIntegration(job.user_id,job.provider,job.operation,JSON.parse(unseal(job.inputs_cipher)));
   await db.query("UPDATE integration_monitors SET result_cipher=$3,last_status='completed',last_checked_at=now(),lease_until=NULL WHERE user_id=$1 AND provider=$2 AND operation=$4 AND inputs_cipher=$5 AND enabled=true",[job.user_id,job.provider,seal(JSON.stringify(result)),job.operation,job.inputs_cipher]);
  }catch {
   await db.query("UPDATE integration_monitors SET last_status='failed',last_checked_at=now(),lease_until=NULL WHERE user_id=$1 AND provider=$2 AND operation=$3 AND inputs_cipher=$4 AND enabled=true",[job.user_id,job.provider,job.operation,job.inputs_cipher]);
  }
 }));
 // Retain operational metadata for 90 days; never store raw API bodies in history.
 await db.query("DELETE FROM integration_executions WHERE created_at<now()-interval '90 days'");
 await db.query("DELETE FROM integration_approvals WHERE expires_at<now()-interval '1 day'");
 return {processed:jobs.length};
}
export async function monitorSnapshot(user:string,provider:string) {
 await requireIntegrationAccess(user,provider);
 const row=(await db.query("SELECT operation,enabled,interval_seconds,last_status,last_checked_at,result_cipher FROM integration_monitors WHERE user_id=$1 AND provider=$2",[user,provider])).rows[0];
 if(!row)return {configured:false};
 const {result_cipher,...meta}=row;
 return {configured:true,...meta,lastRecordedResult:result_cipher?JSON.parse(unseal(result_cipher)):null,guidance:"Recorded polling result, not a new source check. Check last_status and last_checked_at; a failed latest check may leave an older successful result."};
}
