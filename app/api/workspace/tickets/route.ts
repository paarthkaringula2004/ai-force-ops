import { db } from '@/lib/db';
import { getRequestSession } from '@/lib/request-session';
import { workspaceAccess } from '@/lib/workspace-access';
import { ticketBalance } from '@/lib/tickets';
import { requireSameOrigin } from '@/lib/service-review/ingestion';
import {organizationWriteAllowed,OrganizationPolicyError} from '@/lib/organization-security';
export const runtime='nodejs';
export async function GET(request:Request) {
 const user=(await getRequestSession(request))?.user?.id;
 if(!user)return Response.json({error:'Sign in required.'},{status:401});
 return Response.json(await ticketBalance(user),{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request) {
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 try {requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 if((await workspaceAccess(actor)).role!=='admin')return Response.json({error:'Admin access required.'},{status:403});
 let body;
 try{body=await request.json();}catch{return Response.json({error:'Invalid ticket allocation.'},{status:400});}
 if(typeof body.userId!=='string'||!Number.isSafeInteger(body.amount)||body.amount<1||body.amount>1000000||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.requestId))return Response.json({error:'Enter 1–1,000,000 tickets and a request ID.'},{status:400});
 const client=await db.connect();
 try {
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(8470220029)');
  await organizationWriteAllowed(actor,client);
  const admin=(await client.query('SELECT role,active FROM workspace_members WHERE user_id=$1',[actor])).rows[0];
  const target=(await client.query('SELECT role,active FROM workspace_members WHERE user_id=$1 FOR UPDATE',[body.userId])).rows[0];
  if(admin?.role!=='admin'||!admin.active){await client.query('ROLLBACK');return Response.json({error:'Admin access required.'},{status:403});}
  if(!target?.active||!['employee','manager'].includes(target.role)){await client.query('ROLLBACK');return Response.json({error:'Top-ups are available for active Employees and Managers. Admin tickets are unlimited.'},{status:400});}
  const prior=(await client.query('SELECT user_id,actor_id,amount FROM ticket_ledger WHERE id=$1',[body.requestId])).rows[0];
  await client.query('SELECT refresh_ticket_wallet($1)',[body.userId]);
  if(prior&&(prior.user_id!==body.userId||prior.actor_id!==actor||Number(prior.amount)!==body.amount)){await client.query('ROLLBACK');return Response.json({error:'This allocation ID has already been used.'},{status:409});}
  if(!prior){
   await client.query('UPDATE ticket_wallets SET balance=balance+$2,updated_at=now() WHERE user_id=$1',[body.userId,body.amount]);
   await client.query("INSERT INTO ticket_ledger(id,user_id,actor_id,amount,kind) VALUES($1,$2,$3,$4,'topup')",[body.requestId,body.userId,actor,body.amount]);
   await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,'tickets.topped_up',$4::jsonb)",[body.requestId,actor,body.userId,JSON.stringify({tickets:body.amount,payment:false})]);
  }
  const balance=Number((await client.query('SELECT balance FROM ticket_wallets WHERE user_id=$1',[body.userId])).rows[0].balance);
  await client.query('COMMIT');return Response.json({balance,notice:`${body.amount} tickets allocated. No payment was made.`});
 }catch(e){await client.query('ROLLBACK');return Response.json({error:e instanceof OrganizationPolicyError?e.message:'Could not allocate tickets.'},{status:e instanceof OrganizationPolicyError?e.status:503});}finally{client.release();}
}
