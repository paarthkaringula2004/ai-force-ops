import { getRequestSession } from "@/lib/request-session";
import { db } from "@/lib/db";
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import { builtinTools } from "@/lib/builtin-project-tool-settings";
import { listProviders } from "@/lib/integrations/registry";
import { projectBindings, providerOperations } from "@/lib/integrations/project-tools";

export const runtime="nodejs";
export async function GET(request:Request) {
 const session=await getRequestSession(request);
 if(!session?.user)return Response.json({error:"Sign in to view tool knowledge."},{status:401});
 try {
  const user=session.user.id,admin=permitted(await workspaceAccess(user),"admin");
  const builtin=(await builtinTools(user)).filter(t=>admin||["profile","requests","meeting_rooms","agent_assist","chart_visualizer"].includes(t.id));
  const items:{id:string;name:string;category:string;configured:boolean;purpose:string;knowledge:unknown;status:string}[]=builtin.map(t=>({id:t.id,name:t.name,category:"Project tools",configured:t.enabled,purpose:t.purpose,knowledge:t.enabled?{purpose:t.purpose,limits:t.capabilityPurpose}:null,status:t.enabled?"Enabled workspace capability; source records are read when used.":"NULL — Please enable this project tool to add meaningful data."}));
  if(admin) {
   const [providers,operations,bindings,connections,existing]=await Promise.all([listProviders(user),providerOperations(user),projectBindings(user),db.query("SELECT provider,enabled,config->>'reuseId' AS reuse_id,check_state,checked_at FROM integration_connections WHERE user_id=$1",[user]),db.query("SELECT id FROM eassist_connections WHERE user_id=$1 AND enabled=true",[user])]);
   const configured=(id:string)=>{const c=connections.rows.find(c=>c.provider===id);return !!c?.enabled&&(!c.reuse_id||existing.rows.some(e=>e.id===c.reuse_id))&&!!operations.find(p=>p.id===id)?.operations.length;};
   for(const p of providers) {const ready=configured(p.id),c=connections.rows.find(c=>c.provider===p.id);items.push({id:`integration:${p.id}`,name:p.name,category:"Integrations",configured:ready,purpose:p.description,knowledge:ready?{purpose:p.description,operations:operations.find(o=>o.id===p.id)?.operations.map(o=>({name:o.label,requiresApproval:o.write})),lastCheck:c?.check_state||"not_checked",checkedAt:c?.checked_at||null}:null,status:ready?"Configured metadata; run a read check to verify access. Live source data is fetched when used.":"NULL — Please configure this integration to add meaningful data."});}
   for(const t of bindings) {const ready=configured(t.provider)&&!!operations.find(p=>p.id===t.provider)?.operations.some(o=>o.id===t.operation);items.push({id:`project:${t.id}`,name:t.name,category:"Project tools",configured:ready,purpose:t.purpose,knowledge:ready?{purpose:t.purpose,integration:providers.find(p=>p.id===t.provider)?.name,operation:t.operation}:null,status:ready?"Configured binding; source data is fetched when used.":"NULL — Please configure the linked integration to add meaningful data."});}
  }
  return Response.json({items,checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Could not refresh tool knowledge. Previously displayed metadata may be stale."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
