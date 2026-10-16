import { RequestDecisionError,validateRequestDecision,decideRequestInTransaction } from '@/lib/workspace-decisions';
import { db } from '@/lib/db';
import { getRequestSession } from '@/lib/request-session';
import { workspaceAccess } from '@/lib/workspace-access';
import { permitted } from '@/lib/workspace-permissions';
import { requireSameOrigin } from '@/lib/service-review/ingestion';
import { randomUUID } from 'node:crypto';
export const runtime='nodejs';
export async function GET(request:Request) {
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 const member=await workspaceAccess(actor),scope=new URL(request.url).searchParams.get('scope')||'own';
 if(!member.active||!['own','team','all'].includes(scope)||(scope==='team'&&!permitted(member,'team'))||(scope==='all'&&!permitted(member,'admin')))return Response.json({error:'This request scope is not permitted.'},{status:403});
 const focused=new URL(request.url).searchParams.get('request');
 if(focused&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(focused))return Response.json({error:'Invalid request ID.'},{status:400});
 const clause=scope==='own'?'r.user_id=$1':scope==='team'?"m.manager_id=$1 AND r.user_id<>$1 AND r.kind<>'ticket_topup'":'$1::text IS NOT NULL';
 const requests=await db.query(`SELECT r.*,u.name AS employee_name,u.email AS employee_email,m.department,m.manager_id,m.role AS employee_role,manager.name AS manager_name,decider.name AS decided_by_name FROM employee_service_requests r JOIN "user" u ON u.id=r.user_id JOIN workspace_members m ON m.user_id=r.user_id LEFT JOIN "user" manager ON manager.id=m.manager_id LEFT JOIN "user" decider ON decider.id=r.decided_by WHERE ${clause} ORDER BY (r.id=$2::uuid) DESC NULLS LAST,r.created_at DESC LIMIT 200`,[actor,focused]);
 const team=scope==='own'?[]:(await db.query(`SELECT m.user_id,m.role,m.department,m.employee_id,m.active,m.employment_verified_at,u.name,u.email FROM workspace_members m JOIN "user" u ON u.id=m.user_id WHERE ${scope==='team'?'m.manager_id=$1':'$1::text IS NOT NULL'} ORDER BY u.name`,[actor])).rows;
 return Response.json({requests:requests.rows,team,scope,member,deleteEnabled:process.env.NODE_ENV==='development'},{headers:{'Cache-Control':'private, no-store'}});
}
export async function DELETE(request:Request) {
 if(process.env.NODE_ENV!=='development')return Response.json({error:'Temporary request deletion is disabled outside development.'},{status:403});
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 let b:Record<string,unknown>;
 try{const raw=await request.text();if(raw.length>1000)throw new Error();b=JSON.parse(raw);}catch{return Response.json({error:'Invalid deletion request.'},{status:400});}
 if(!b||typeof b.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)||typeof b.confirmation!=='string')return Response.json({error:'Confirm the request number to delete.'},{status:400});
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(8470220029)');
  const member=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1',[actor])).rows[0];
  const item=(await client.query('SELECT r.*,m.manager_id FROM employee_service_requests r JOIN workspace_members m ON m.user_id=r.user_id WHERE r.id=$1 FOR UPDATE OF r',[b.id])).rows[0];
  if(!member?.active||!item||!(item.user_id===actor||member.role==='admin'||(member.role==='manager'&&item.manager_id===actor)))throw new RequestDecisionError('Request not found or deletion not permitted.',403);
  if(b.confirmation!==item.request_number)throw new RequestDecisionError('Request number confirmation does not match.');
  await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,request_id,action,details) VALUES($1,$2,$3,$4,'request.deleted',$5::jsonb)",[randomUUID(),actor,item.user_id,item.id,JSON.stringify({request_number:item.request_number,kind:item.kind,status:item.status,development_only:true})]);
  await client.query('DELETE FROM employee_service_requests WHERE id=$1',[item.id]);
  await client.query('COMMIT');return Response.json({notice:`${item.request_number} deleted. This temporary action is available only in development.`});
 }catch(e){await client.query('ROLLBACK');return Response.json({error:e instanceof RequestDecisionError?e.message:'Could not delete the request.'},{status:e instanceof RequestDecisionError?e.status:503});}finally{client.release();}
}
export async function PATCH(request:Request) {
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 let b:Record<string,unknown>;
 try{const raw=await request.text();if(raw.length>8000)throw new Error();b=JSON.parse(raw);}catch{return Response.json({error:'Invalid decision.'},{status:400});}
 try{validateRequestDecision(b);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 const client=await db.connect();
 try{
  await client.query('BEGIN');const result=await decideRequestInTransaction(client,actor,b);
  await client.query('COMMIT');return Response.json(result);
 }catch(e){await client.query('ROLLBACK');return Response.json({error:e instanceof RequestDecisionError?e.message:'Could not save the decision.'},{status:e instanceof RequestDecisionError?e.status:503});}finally{client.release();}
}
