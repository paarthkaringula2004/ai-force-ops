import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {getRequestSession} from '@/lib/request-session';
import {requireSameOrigin} from '@/lib/service-review/ingestion';
import {RequestDecisionError} from '@/lib/workspace-decisions';
import {organizationWriteAllowed,OrganizationPolicyError} from '@/lib/organization-security';
export const runtime='nodejs';
export async function POST(request:Request){
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 let target:string;
 try{const raw=await request.text();if(raw.length>1000)throw new Error();const body=JSON.parse(raw);if(typeof body?.userId!=='string'||body.userId.length>200||body.confirm!==true)throw new Error();target=body.userId;}catch{return Response.json({error:'Confirm employment for an existing member.'},{status:400});}
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(8470220029)');
  await organizationWriteAllowed(actor,client);
  const member=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1',[actor])).rows[0];
  const person=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1 FOR UPDATE',[target])).rows[0];
  if(!member?.active||!person?.active||actor===target||!(member.role==='admin'||(member.role==='manager'&&person.manager_id===actor)))throw new RequestDecisionError('Only the assigned Manager or an Admin can confirm another active member’s employment.',403);
  if(person.role!=='employee')throw new RequestDecisionError('Employment confirmation is only required for Employees. Manager and Admin roles are assigned by an Admin.',409);
  if(person.employment_verified_at){await client.query('COMMIT');return Response.json({employeeId:person.employee_id,notice:'Employment was already confirmed. The employee ID is unchanged.'});}
  if(!person.department_code||!person.qualification_code)throw new RequestDecisionError('Ask an Admin to select the department and highest completed qualification first.',409);
  const employeeId=(await client.query('UPDATE workspace_members SET employment_verified_at=now(),employment_verified_by=$2,updated_at=now() WHERE user_id=$1 RETURNING employee_id',[target,actor])).rows[0].employee_id;
  await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,'member.employment_confirmed',$4::jsonb)",[randomUUID(),actor,target,JSON.stringify({employee_id:employeeId,generated:!person.employee_id})]);
  await client.query('COMMIT');return Response.json({employeeId,notice:`Employment confirmed. Employee ID: ${employeeId}.`});
 }catch(e){await client.query('ROLLBACK');return Response.json({error:e instanceof RequestDecisionError||e instanceof OrganizationPolicyError?e.message:'Could not confirm employment.'},{status:e instanceof RequestDecisionError||e instanceof OrganizationPolicyError?e.status:503});}finally{client.release();}
}
