import {getRequestSession} from '@/lib/request-session';
import {requestNotificationSnapshot,dismissRequestNotification} from '@/lib/request-notifications';
import {subscribeRequestChanges} from '@/lib/request-notification-events';
import {InputError,boundedJson} from '@/lib/eassist/transport';
import {requireSameOrigin} from '@/lib/service-review/ingestion';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store, no-transform'};
export async function GET(request:Request){
 const user=(await getRequestSession(request))?.user?.id;
 if(!user)return Response.json({error:'Sign in required.'},{status:401,headers});
 try{
  const initial=await requestNotificationSnapshot(user);
  if(new URL(request.url).searchParams.get('stream')!=='1')return Response.json(initial,{headers});
  const encoder=new TextEncoder();let cleanup=()=>{};
  const stream=new ReadableStream<Uint8Array>({
   start(controller){
    let closed=false,running=false,again=false,last=JSON.stringify({...initial,cursor:undefined});
    const send=(event:string,data:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
    const finish=()=>{if(closed)return;closed=true;clearInterval(heartbeat);clearTimeout(lifetime);subscription.unsubscribe();request.signal.removeEventListener('abort',finish);try{controller.close();}catch{/* Consumer already cancelled the stream. */}};
    const refresh=async()=>{
     if(closed)return;if(running){again=true;return;}running=true;
     try{
      if(!(await getRequestSession(request))?.user){send('revoked',{});finish();return;}
      const snapshot=await requestNotificationSnapshot(user),signature=JSON.stringify({...snapshot,cursor:undefined});
      if(!closed&&signature!==last){last=signature;send('requests',snapshot);}
     }catch(error){if(error instanceof InputError&&error.status===403){send('revoked',{});finish();}}
     finally{running=false;if(again&&!closed){again=false;void refresh();}}
    };
    const subscription=subscribeRequestChanges(()=>void refresh());
    // Recheck after LISTEN is ready to cover changes during initial connection setup.
    void subscription.ready.then(refresh,refresh);
    const heartbeat=setInterval(()=>{if(!closed){controller.enqueue(encoder.encode(': keep-alive\n\n'));void refresh();}},15000);
    // Reconnect regularly, revalidating the browser session and avoiding proxy timeouts.
    const lifetime=setTimeout(finish,55000);
    cleanup=finish;request.signal.addEventListener('abort',finish,{once:true});
    send('requests',initial);if(request.signal.aborted)finish();
   },cancel(){cleanup();},
  });
  return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream','X-Accel-Buffering':'no',Connection:'keep-alive'}});
 }catch(error){return Response.json({error:error instanceof InputError?error.message:'Could not load request notifications.'},{status:error instanceof InputError?error.status:503,headers});}
}
export async function POST(request:Request){
 const user=(await getRequestSession(request))?.user?.id;
 if(!user)return Response.json({error:'Sign in required.'},{status:401,headers});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403,headers});}
 try{
  const body=await boundedJson(request) as {id?:unknown}|null;
  await dismissRequestNotification(user,body?.id);
  return Response.json({dismissed:true},{headers});
 }catch(error){return Response.json({error:error instanceof InputError?error.message:'Could not dismiss this notification.'},{status:error instanceof InputError?error.status:503,headers});}
}
