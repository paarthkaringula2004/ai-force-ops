import {timingSafeEqual} from 'node:crypto';
import {deliverMailBatch} from '@/lib/mail';
export const runtime='nodejs';
export async function POST(request:Request){
 const expected=process.env.MAIL_WORKER_TOKEN||'',provided=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
 if(expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await deliverMailBatch());}catch{return Response.json({error:'Mail worker could not process the queue.'},{status:503});}
}
