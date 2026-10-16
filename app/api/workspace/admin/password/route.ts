import {db} from '@/lib/db';
import {getRequestSession} from '@/lib/request-session';
import {requireSameOrigin,IngestionError} from '@/lib/service-review/ingestion';
import {MemberUpdateError} from '@/lib/workspace-members';
import {OrganizationPolicyError} from '@/lib/organization-security';
import {resetMemberPassword} from '@/lib/workspace-member-password';
export const runtime='nodejs';
export async function POST(request:Request){
 const actor=(await getRequestSession(request))?.user?.id;
 if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 const headers={'Cache-Control':'private, no-store'};
 try{requireSameOrigin(request);}catch(e){return Response.json({error:e instanceof IngestionError?e.message:'Invalid origin.'},{status:403,headers});}
 let input;try{const raw=await request.text();if(raw.length>3000)throw new Error();input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw new Error();}catch{return Response.json({error:'Provide a valid password reset request.'},{status:400,headers});}
 const client=await db.connect();
 try{await client.query('BEGIN');const result=await resetMemberPassword(client,actor,input);await client.query('COMMIT');return Response.json(result,{headers});}
 catch(e){await client.query('ROLLBACK');return Response.json({error:e instanceof MemberUpdateError||e instanceof OrganizationPolicyError?e.message:'Could not reset this password.'},{status:e instanceof MemberUpdateError||e instanceof OrganizationPolicyError?e.status:500,headers});}
 finally{client.release();}
}
