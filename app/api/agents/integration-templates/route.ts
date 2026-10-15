import { getRequestSession } from "@/lib/request-session";
import { requireSameOrigin, IngestionError } from "@/lib/service-review/ingestion";
import { boundedJson, InputError } from "@/lib/eassist/transport";
import { demoAgentTemplates } from "@/lib/integrations/templates";
import { installIntegrationTemplate } from "@/lib/integrations/install";
export const runtime="nodejs";
export async function POST(request:Request) {
 const session=await getRequestSession(request);if(!session?.user)return Response.json({error:"Sign in first."},{status:401});
 try {
  requireSameOrigin(request);
  const body=await boundedJson(request) as {template?:string};
  if(body?.template==="all") {
   const installed=[];
   for(const t of demoAgentTemplates)installed.push(await installIntegrationTemplate(session.user.id,t.id));
   return Response.json({installed,created:installed.filter(t=>t.created).length,preserved:installed.filter(t=>!t.created).length});
  }
  return Response.json(await installIntegrationTemplate(session.user.id,String(body?.template||"")));
 }catch(error){const known=error instanceof InputError||error instanceof IngestionError;return Response.json({error:known?error.message:"Could not install the template. Existing agents were preserved; completed installations remain available."},{status:known?error.status:503});}
}
