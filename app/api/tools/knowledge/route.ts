import {getRequestSession} from '@/lib/request-session';
import {workspaceAccess} from '@/lib/workspace-access';
import {permitted} from '@/lib/workspace-permissions';
import {readToolKnowledge} from '@/lib/tool-knowledge';

export const runtime='nodejs';
export async function GET(request:Request){
 const session=await getRequestSession(request);
 if(!session?.user)return Response.json({error:'Sign in to view tool knowledge.'},{status:401});
 try{
  const member=await workspaceAccess(session.user.id);
  return Response.json(await readToolKnowledge(session.user.id,permitted(member,'admin')),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not refresh tool knowledge. Previously displayed metadata may be stale.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
