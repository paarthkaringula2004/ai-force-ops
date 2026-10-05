import { after } from 'next/server';
import { getRequestSession } from '@/lib/request-session';
import { action } from '@/lib/eassist/actions';
import { snapshot } from '@/lib/eassist/store';
import { syncUser } from '@/lib/eassist/sync';
import { boundedJson, InputError } from '@/lib/eassist/transport';
import { object } from '@/lib/eassist/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const session=await getRequestSession(request);if(!session?.user)return Response.json({error:'Sign in to use eAssist.'},{status:401});
  try{const data=await snapshot(session.user.id);after(()=>syncUser(session.user.id));return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'eAssist data is unavailable. Check the database connection and apply the eAssist migration.'},{status:503});}
}
export async function POST(request:Request){
  const session=await getRequestSession(request);if(!session?.user)return Response.json({error:'Sign in to use eAssist.'},{status:401});
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'Cross-site requests are not permitted.'},{status:403});
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return Response.json({error:'Use application/json.'},{status:415});
  if(origin && ![new URL(request.url).origin,process.env.BETTER_AUTH_URL].includes(origin))return Response.json({error:'Request origin is not permitted.'},{status:403});
  try{const result=await action(session.user.id,object(await boundedJson(request)));after(()=>syncUser(session.user.id));return Response.json(result,{headers:{'Cache-Control':'no-store'}});}
  catch(e){return Response.json({error:e instanceof InputError?e.message:e instanceof Error && e.name==='UpstreamError'?e.message:'The operation could not be completed. Your previously saved data is retained.'},{status:e instanceof InputError?e.status:503});}
}
