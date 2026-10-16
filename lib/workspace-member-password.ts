import {randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import type {PoolClient} from 'pg';
import {permitted} from './workspace-permissions';
import {MemberUpdateError} from './workspace-members';
import {organizationWriteAllowed} from './organization-security';

export async function resetMemberPassword(client:PoolClient,actor:string,input:Record<string,unknown>){
 if(typeof input.userId!=='string'||typeof input.password!=='string'||input.password.length<8||input.password.length>128||input.confirm!==true)throw new MemberUpdateError('Confirm a new password of 8–128 characters.');
 await organizationWriteAllowed(actor,client);
 await client.query('SELECT pg_advisory_xact_lock(8470220029)');
 const acting=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1 FOR UPDATE',[actor])).rows[0];
 if(!acting||!permitted(acting,'admin'))throw new MemberUpdateError('Active Admin access required.',403);
 if(actor===input.userId)throw new MemberUpdateError('Change your own password in Account settings using your current password.',409);
 const target=(await client.query('SELECT user_id FROM workspace_members WHERE user_id=$1 FOR UPDATE',[input.userId])).rows[0];
 if(!target)throw new MemberUpdateError('Account not found.',404);
 const count=(await client.query("SELECT count(*)::int AS count FROM workspace_audit WHERE actor_id=$1 AND action='member.password_reset' AND created_at>now()-interval '15 minutes'",[actor])).rows[0]?.count||0;
 if(count>=10)throw new MemberUpdateError('Password reset limit reached. Try again in 15 minutes.',429);
 const credential=(await client.query(`SELECT id FROM account WHERE "userId"=$1 AND "providerId"='credential' AND password IS NOT NULL FOR UPDATE`,[input.userId])).rows[0];
 if(!credential)throw new MemberUpdateError('This account uses an external sign-in provider. Its password must be managed there.',409);
 const passwordHash=await hashPassword(input.password);
 await client.query('UPDATE account SET password=$2,"updatedAt"=now() WHERE id=$1',[credential.id,passwordHash]);
 await client.query('DELETE FROM session WHERE "userId"=$1',[input.userId]);
 await client.query("DELETE FROM verification WHERE value=$1 AND starts_with(identifier,'reset-password:')",[input.userId]);
 await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,'member.password_reset',$4::jsonb)",[randomUUID(),actor,input.userId,JSON.stringify({sessionsRevoked:true})]);
 return {saved:true,notice:'Password reset. Existing sessions have been signed out.'};
}
