import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {getRequestSession} from '@/lib/request-session';
import {workspaceAccess} from '@/lib/workspace-access';
import {permitted} from '@/lib/workspace-permissions';
import {requireSameOrigin} from '@/lib/service-review/ingestion';
import {encryptMail,decryptMail} from '@/lib/mail';
import {isDocumentType} from '@/lib/organization-documents';
import {attachmentMimeTypes} from '@/lib/mail-attachment-types';
export const runtime='nodejs';
async function actor(request:Request){const user=(await getRequestSession(request))?.user;return user&&permitted(await workspaceAccess(user.id),'admin')?user:null;}
export async function POST(request:Request){
 const user=await actor(request);if(!user)return Response.json({error:'Admin access required.'},{status:403});
 try{requireSameOrigin(request);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 const client=await db.connect();
 try{
  const form=await request.formData();
  const type=form.get('documentType'),file=form.get('file');
  if(!isDocumentType(type)||!(file instanceof File))throw new Error('Choose a document type and a file.');
  const filename=file.name.replace(/[\\/]/g,'_').replace(/[\x00-\x1f\x7f]/g,'').trim(),extension=filename.split('.').pop()?.toLowerCase()??'',mime=Object.hasOwn(attachmentMimeTypes,extension)?attachmentMimeTypes[extension]:file.type||'application/octet-stream';
  if(!filename)throw new Error('Choose a file with a valid filename.');
  if(file.size<1)throw new Error('Choose a non-empty file.');
  const buffer=Buffer.from(await file.arrayBuffer()),id=randomUUID();
  await client.query('BEGIN');
  if(!(await client.query("SELECT 1 FROM workspace_members WHERE user_id=$1 AND active AND role='admin' FOR UPDATE",[user.id])).rowCount)throw new Error('Active Admin access required.');
  await client.query('INSERT INTO organization_mail_attachments(id,document_type,filename,content_type,size_bytes,encrypted_content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,type,filename,mime,file.size,encryptMail({subject:filename,text:buffer.toString('base64'),html:''}),user.id]);
  await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'mail.attachment_uploaded',$3::jsonb)",[randomUUID(),user.id,JSON.stringify({documentType:type,attachmentId:id,size:file.size})]);
  await client.query("DELETE FROM organization_mail_attachments a WHERE a.created_at<now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM organization_mail_templates t WHERE a.id=ANY(t.attachment_ids))");
  await client.query('COMMIT');return Response.json({attachment:{id,filename,contentType:mime,size:file.size}});
 }catch(error){await client.query('ROLLBACK');return Response.json({error:error instanceof Error?error.message:'Could not attach the file.'},{status:400});}finally{client.release();}
}
export async function GET(request:Request){
 const user=await actor(request);if(!user)return Response.json({error:'Admin access required.'},{status:403});
 const id=new URL(request.url).searchParams.get('id');if(!id||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return Response.json({error:'Attachment not found.'},{status:404});
 const row=(await db.query(`SELECT a.filename,a.content_type,a.encrypted_content FROM organization_mail_attachments a WHERE a.id=$1 AND (a.created_by=$2 OR EXISTS(SELECT 1 FROM organization_mail_templates t WHERE a.id=ANY(t.attachment_ids)))`,[id,user.id])).rows[0];
 if(!row)return Response.json({error:'Attachment not found.'},{status:404});
 const content=Buffer.from(decryptMail(row.encrypted_content).text,'base64');
 return new Response(content,{headers:{'Content-Type':row.content_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.filename),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
