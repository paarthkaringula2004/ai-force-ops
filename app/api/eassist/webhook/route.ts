import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { boundedJson, type PrivateConnection } from '@/lib/eassist/transport';
import { array,object } from '@/lib/eassist/types';
import { ingestAlerts } from '@/lib/eassist/sync';
export const runtime='nodejs';
export async function POST(request:Request){
  const id=new URL(request.url).searchParams.get('connection');
  if(!id||!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:'Invalid webhook.'},{status:401});
  const c=(await db.query<PrivateConnection>(`SELECT * FROM eassist_connections WHERE id=$1 AND kind='alertmanager' AND enabled=true`,[id])).rows[0];
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  const actual=createHash('sha256').update(token).digest('hex');
  if(!c?.webhook_hash||!token||!timingSafeEqual(Buffer.from(actual),Buffer.from(c.webhook_hash)))return Response.json({error:'Invalid webhook credential.'},{status:401});
  try{
    const body=object(await boundedJson(request));if(!Array.isArray(body.alerts)||body.alerts.length>1000)throw new Error('Invalid alerts.');
    const alerts=array(body.alerts);if(alerts.some(a=>!Object.keys(object(a.labels)).length||!Number.isFinite(Date.parse(String(a.startsAt)))))throw new Error('Invalid alert fields.');
    await ingestAlerts(c,alerts,String(body.receiver||''));
    return Response.json({accepted:alerts.length});
  }catch{return Response.json({error:'Webhook must contain at most 1,000 alerts with labels and startsAt timestamps.'},{status:400});}
}
