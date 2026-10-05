import { db } from '@/lib/db';
import { getRequestSession } from '@/lib/request-session';
import { syncUser } from '@/lib/eassist/sync';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const session=await getRequestSession(request);if(!session?.user)return new Response('Unauthorized',{status:401});
  const user=session.user.id,encoder=new TextEncoder();let cancelled=false;
  const stream=new ReadableStream({
    async start(controller){
      let last='',ticks=0;let syncing:Promise<void>|undefined;
      const send=(s:string)=>{if(!cancelled)controller.enqueue(encoder.encode(s));};
      try{
        send('retry: 1500\n\n');
        // Short-lived streams reauthenticate on reconnection. Browsers retain the displayed snapshot.
        while(!cancelled&&!request.signal.aborted&&ticks<50){
          if(ticks%5===0&&!syncing)syncing=syncUser(user).catch(()=>{}).finally(()=>{syncing=undefined;});
          const result=await db.query('SELECT revision::text FROM eassist_revisions WHERE user_id=$1',[user]);
          const revision=result.rows[0]?.revision||'0';
          if(revision!==last){send(`event: change\ndata: ${JSON.stringify({revision})}\n\n`);last=revision;}
          if(ticks%10===0)send(': heartbeat\n\n');
          await new Promise(r=>setTimeout(r,1000));ticks++;
        }
      }catch{try{send('event: unavailable\ndata: {}\n\n');}catch{}}
      finally{cancelled=true;try{controller.close();}catch{}await syncing;}
    },
    cancel(){cancelled=true;},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no',Connection:'keep-alive'}});
}
