import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {getRequestSession} from '@/lib/request-session';
import {workspaceAccess} from '@/lib/workspace-access';
import {permitted} from '@/lib/workspace-permissions';
import {requireSameOrigin} from '@/lib/service-review/ingestion';
import {decryptMail,mailConfigured,queueMail,validMailAddress} from '@/lib/mail';
import {offerMail,testMail,type OfferDetails} from '@/lib/mail-templates';
export const runtime='nodejs';
async function admin(request:Request){const session=await getRequestSession(request);return session?.user&&permitted(await workspaceAccess(session.user.id),'admin')?session.user:null;}
export async function GET(request:Request){
 const actor=await admin(request);if(!actor)return Response.json({error:'Admin access required.'},{status:403});
 const [messages,health]=await Promise.all([db.query('SELECT id,kind,document_type AS "documentType",recipient,subject,status,attempts,sent_at,created_at,last_error FROM mail_outbox ORDER BY created_at DESC LIMIT 50'),db.query('SELECT checked_at FROM mail_worker_health WHERE id=true')]);
 return Response.json({configured:mailConfigured(),sender:process.env.SMTP_USER||'',messages:messages.rows,workerCheckedAt:health.rows[0]?.checked_at||null},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const actor=await admin(request);if(!actor)return Response.json({error:'Admin access required.'},{status:403});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 let body;try{const raw=await request.text();if(raw.length>14000)throw new Error();body=JSON.parse(raw);}catch{return Response.json({error:'Invalid mail request.'},{status:400});}
 if(!mailConfigured())return Response.json({error:'Configure SMTP and the mail encryption key first.'},{status:503});
 const client=await db.connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`mail-admin:${actor.id}`]);
  if(!(await client.query("SELECT 1 FROM workspace_members WHERE user_id=$1 AND role='admin' AND active FOR UPDATE",[actor.id])).rowCount)throw new Error('Active Admin access required.');
  let id:string|null=null,preview;
  if(body.action==='preview-offer'){
   if(!body.details||typeof body.to!=='string'||!validMailAddress(body.to))throw new Error('Enter the recipient email and all offer details.');
   const details=body.details as OfferDetails;
   for(const field of ['name','role','department','startDate','location','compensation','terms'] as const){if(typeof details[field]!=='string'||!details[field].trim()||details[field].length>(field==='terms'?6000:300))throw new Error('Complete every offer field with the approved terms.');}
   preview=offerMail(details);id=await queueMail('offer',body.to,preview,`offer:${randomUUID()}`,{client,actor:actor.id,draft:true,expires:new Date(Date.now()+600000)});
   if(!id)throw new Error('This recipient address cannot receive external mail.');
  }else if(body.action==='confirm-offer'||body.action==='confirm-document'){
   if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id)||body.confirm!==true)throw new Error('Review and confirm the exact offer first.');
   const kinds=body.action==='confirm-offer'?['offer']:['offer','document'];
   const row=(await client.query("UPDATE mail_outbox SET status='queued',expires_at=NULL,available_at=now() WHERE id=$1 AND actor_id=$2 AND kind=ANY($3::text[]) AND status='draft' AND expires_at>now() RETURNING id",[body.id,actor.id,kinds])).rows[0];
   if(!row)throw new Error('The document preview expired or was already confirmed. Preview it again.');id=row.id;
  }else if(body.action==='test'){
   if(typeof body.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.requestId))throw new Error('Start a new test request.');
   const count=(await client.query("SELECT count(*)::int AS n FROM mail_outbox WHERE actor_id=$1 AND kind='test' AND created_at>now()-interval '1 hour'",[actor.id])).rows[0].n;
   if(count>=5)throw new Error('Up to five test emails are allowed per hour.');
   id=await queueMail('test',actor.email,testMail(),`test:${actor.id}:${body.requestId}`,{client,actor:actor.id});
  }else if(body.action==='preview-message'){
   const row=(await client.query("SELECT encrypted_content FROM mail_outbox WHERE id=$1 AND actor_id=$2 AND status='draft' AND expires_at>now()",[body.id,actor.id])).rows[0];
   if(!row)throw new Error('Preview is no longer available.');preview=decryptMail(row.encrypted_content);
  }else throw new Error('Unknown mail action.');
  if(id)await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,$3,$4::jsonb)",[randomUUID(),actor.id,`mail.${body.action}`,JSON.stringify({mailId:id})]);
  await client.query('COMMIT');return Response.json({id,preview,queued:body.action!=='preview-offer'&&Boolean(id)});
 }catch(error){await client.query('ROLLBACK');return Response.json({error:error instanceof Error?error.message:'Mail request failed.'},{status:400});}finally{client.release();}
}
