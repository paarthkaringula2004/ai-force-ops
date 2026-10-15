import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
import { InputError, boundedJson } from "@/lib/eassist/transport";
import { builtinTools, changeBuiltinTool } from "@/lib/builtin-project-tool-settings";
import { projectBindings, providerOperations, saveProjectBinding } from "@/lib/integrations/project-tools";
import { requireIntegrationAdmin } from "@/lib/integrations/runtime";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
export const runtime="nodejs";
function failure(e:unknown){const known=e instanceof InputError||e instanceof IngestionError;return Response.json({error:known?e.message:"Could not complete the project tool request."},{status:known?e.status:503});}
export async function GET(request:Request) {
 const session=await getRequestSession(request);if(!session?.user)return Response.json({error:"Sign in first."},{status:401});
 try {
  const canManage=permitted(await workspaceAccess(session.user.id),"admin");
  const all=await builtinTools(session.user.id,true);
  const builtin=all.filter(t=>!t.deleted&&(canManage||["profile","requests","agent_assist","chart_visualizer","meeting_rooms"].includes(t.id)));
  return Response.json({builtin,canManage,removedBuiltin:canManage?all.filter(t=>t.deleted):[],tools:canManage?await projectBindings(session.user.id):[],integrations:canManage?await providerOperations(session.user.id):[],removed:canManage?(await db.query("SELECT id,name FROM project_tool_bindings WHERE user_id=$1 AND deleted_at IS NOT NULL ORDER BY name",[session.user.id])).rows:[]},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e);}
}
export async function POST(request:Request) {
 const session=await getRequestSession(request);if(!session?.user)return Response.json({error:"Sign in first."},{status:401});
 try {
  requireSameOrigin(request);await requireIntegrationAdmin(session.user.id);
  const raw=await boundedJson(request);if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new InputError("Provide a JSON object.");const b=raw as Record<string,unknown>;
  if(["save_builtin","delete_builtin","restore_builtin"].includes(String(b.action))) {
   await changeBuiltinTool(session.user.id,String(b.action),b);return Response.json({saved:true});
  }
  if(b.action==="delete"||b.action==="restore") {
   if(typeof b.id!=="string"||!/^[a-f\d-]{36}$/i.test(b.id))throw new InputError("Choose a project tool.");
   const result=await db.query(`UPDATE project_tool_bindings SET deleted_at=${b.action==="delete"?"now()":"NULL"},revision=revision+1 WHERE user_id=$1 AND id=$2 RETURNING id`,[session.user.id,b.id]);
   if(!result.rowCount)throw new InputError("Project tool not found.",404);return Response.json({saved:true});
  }
  if(b.action==="save")return Response.json({id:await saveProjectBinding(session.user.id,b)});
  throw new InputError("Choose a supported project tool action.");
 }catch(e){return failure(e);}
}
