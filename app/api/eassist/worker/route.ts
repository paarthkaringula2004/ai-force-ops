import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { syncConnection } from '@/lib/eassist/sync';
import type { PrivateConnection } from '@/lib/eassist/transport';
export const runtime='nodejs';
export async function POST(request:Request){
  const secret=process.env.EASSIST_WORKER_TOKEN||'',provided=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  if(secret.length<32||provided.length!==secret.length||!timingSafeEqual(Buffer.from(secret),Buffer.from(provided)))return Response.json({error:'Unauthorized'},{status:401});
  const rows=await db.query<PrivateConnection>('SELECT * FROM eassist_connections WHERE enabled=true AND sync_after<=now() ORDER BY sync_after LIMIT 10');
  const results=await Promise.allSettled(rows.rows.map(c=>syncConnection(c)));
  return Response.json({processed:results.length});
}
