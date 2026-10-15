import {readStaffCatalog} from '@/lib/staff-catalog';
import { MemberUpdateError, validateMemberUpdate, updateMemberInTransaction } from '@/lib/workspace-members';
import { db } from '@/lib/db';
import { getRequestSession } from '@/lib/request-session';
import { workspaceAccess } from '@/lib/workspace-access';
import { permitted } from '@/lib/workspace-permissions';
import { requireSameOrigin } from '@/lib/service-review/ingestion';
import {deleteMemberInTransaction} from '@/lib/workspace-member-deletion';
export const runtime='nodejs';
export async function GET(request:Request) {
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 if(!permitted(await workspaceAccess(actor),'admin'))return Response.json({error:'Admin access required.'},{status:403});
 await db.query('SELECT refresh_ticket_wallet(user_id) FROM workspace_members WHERE active');
 const [users,audit]=await Promise.all([
  db.query(`SELECT m.*,u.name,u.email,manager.name AS manager_name,w.balance AS ticket_balance FROM workspace_members m JOIN "user" u ON u.id=m.user_id LEFT JOIN "user" manager ON manager.id=m.manager_id LEFT JOIN ticket_wallets w ON w.user_id=m.user_id ORDER BY u.name,m.user_id`),
  db.query(`SELECT a.id,a.action,a.details,a.created_at,actor.name AS actor_name,target.name AS target_name FROM workspace_audit a LEFT JOIN "user" actor ON actor.id=a.actor_id LEFT JOIN "user" target ON target.id=a.target_id ORDER BY a.created_at DESC LIMIT 100`)
 ]);
 return Response.json({users:users.rows,audit:audit.rows,permissions:[],viewerId:actor,catalog:await readStaffCatalog(db)},{headers:{'Cache-Control':'private, no-store'}});
}
export async function PATCH(request:Request) {
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 let b:Record<string,unknown>;
 try{const raw=await request.text();if(raw.length>16000)throw new Error();b=JSON.parse(raw);if(!b||Array.isArray(b)||typeof b!=='object')throw new Error();}catch{return Response.json({error:'Invalid member update.'},{status:400});}
 try{validateMemberUpdate(b);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 const client=await db.connect();
 try {
  await client.query('BEGIN');
  await updateMemberInTransaction(client,actor,b);
  await client.query('COMMIT');return Response.json({saved:true});
 }catch(e){await client.query('ROLLBACK');return Response.json({error:e instanceof MemberUpdateError?e.message:(e as {code?:string}).code==='23505'?'Employee ID is already assigned.':'Could not update the member.'},{status:e instanceof MemberUpdateError?e.status:400});}finally{client.release();}
}
export async function DELETE(request:Request) {
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 let body;try{const raw=await request.text();if(raw.length>2000)throw new Error();body=JSON.parse(raw);}catch{return Response.json({error:'Invalid deletion request.'},{status:400});}
 const client=await db.connect();
 try{await client.query('BEGIN');const result=await deleteMemberInTransaction(client,actor,body);await client.query('COMMIT');return Response.json(result);}
 catch(error){await client.query('ROLLBACK');return Response.json({error:error instanceof MemberUpdateError?error.message:'Could not delete the account.'},{status:error instanceof MemberUpdateError?error.status:500});}
 finally{client.release();}
}
