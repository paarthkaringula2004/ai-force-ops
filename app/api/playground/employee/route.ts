import { getRequestSession } from "@/lib/request-session";
import { employeeSnapshot, resetEmployeeDraft } from "@/lib/employee-playground";
import { requireSameOrigin } from "@/lib/service-review/ingestion";
import { workspaceAccess } from '@/lib/workspace-access';
import { userChoices } from '@/lib/user-playground';
export const runtime="nodejs";
export async function GET(request:Request) {
  const user=(await getRequestSession(request))?.user?.id;
  if(!user)return Response.json({error:"Sign in required."},{status:401});
  const member=await workspaceAccess(user);
  if(member.role==='user')return Response.json({profile:{name:'',role:'user',department:'',employeeId:'',manager:null},choices:userChoices,requests:[],draft:null},{headers:{'Cache-Control':'private, no-store'}});
  try { return Response.json(await employeeSnapshot(user),{headers:{"Cache-Control":"private, no-store"}}); }
  catch { return Response.json({error:"Could not load employee requests."},{status:503}); }
}
export async function DELETE(request:Request) {
  const user=(await getRequestSession(request))?.user?.id;
  if(!user)return Response.json({error:"Sign in required."},{status:401});
  try{requireSameOrigin(request);}catch{return Response.json({error:"Invalid origin."},{status:403});}
  await resetEmployeeDraft(user);return Response.json({cleared:true});
}
