import { db } from '@/lib/db';
import { InputError } from './transport';
export const defaultSecurity={allow_runs:true,allow_writes:true,allow_deletes:false,require_confirmation:true,require_https:true,max_concurrent:3};
export type SecurityPolicy=typeof defaultSecurity;
export async function securityPolicy(user:string):Promise<SecurityPolicy>{return (await db.query('SELECT allow_runs,allow_writes,allow_deletes,require_confirmation,require_https,max_concurrent FROM eassist_security WHERE user_id=$1',[user])).rows[0]||defaultSecurity;}
export async function consumeLaunch(user:string,connectionId:string,templateId:string,approval:unknown){
  const client=await db.connect();
  try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`eassist-launch:${user}`]);
    const policy=(await client.query('SELECT * FROM eassist_security WHERE user_id=$1',[user])).rows[0]||defaultSecurity;
    if(!policy.allow_runs)throw new InputError('Task launches are disabled in Security configurations.',403);
    const count=await client.query(`SELECT (SELECT count(*) FROM eassist_records WHERE user_id=$1 AND kind='tasks' AND data->>'status' IN ('waiting','running','starting','stopping')) +
      (SELECT count(*) FROM eassist_operations WHERE user_id=$1 AND action='task.run' AND state IN ('pending','unknown')) AS total`,[user]);
    if(Number(count.rows[0].total)>policy.max_concurrent)throw new InputError('The configured concurrent-run limit has been reached.',409);
    if(policy.require_confirmation){
      if(typeof approval!=='string'||!/^[a-f0-9-]{36}$/i.test(approval))throw new InputError('Confirm this task launch first.',403);
      const used=await client.query(`UPDATE eassist_run_approvals SET consumed_at=now() WHERE id=$1 AND user_id=$2 AND connection_id=$3 AND template_id=$4 AND consumed_at IS NULL AND expires_at>now() RETURNING id`,[approval,user,connectionId,templateId]);
      if(!used.rowCount)throw new InputError('Launch confirmation expired or was already used. Confirm the task again.',403);
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
