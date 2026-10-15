import 'server-only';
import type {Pool,PoolClient} from 'pg';
import {decryptMail} from './mail';
import type {MailAttachment} from './mail-templates';
import type {DocumentType} from './organization-documents';
import {type AttachmentMetadata} from './mail-attachment-types';
type Client=Pool|PoolClient;
export function attachmentIds(value:unknown):string[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))||new Set(value).size!==value.length)throw new Error('Choose valid document attachments.');
 return value;
}
export async function readAttachmentMetadata(client:Client,ids:string[]):Promise<AttachmentMetadata[]>{
 if(!ids.length)return [];
 const rows=(await client.query('SELECT id,filename,content_type AS "contentType",size_bytes AS size FROM organization_mail_attachments WHERE id=ANY($1::uuid[])',[ids])).rows;
 return ids.map(id=>rows.find(row=>row.id===id)).filter(Boolean).map(row=>({id:row.id,filename:row.filename,contentType:row.contentType,size:Number(row.size)})) as AttachmentMetadata[];
}
export async function loadDocumentAttachments(client:Client,type:DocumentType,ids:string[],actor?:string):Promise<MailAttachment[]>{
 attachmentIds(ids);if(!ids.length)return [];
 const rows=(await client.query(`SELECT a.id,a.filename,a.content_type AS "contentType",a.size_bytes AS size,a.encrypted_content FROM organization_mail_attachments a WHERE a.id=ANY($1::uuid[]) AND a.document_type=$2 AND ($3::text IS NULL OR a.created_by=$3 OR EXISTS(SELECT 1 FROM organization_mail_templates t WHERE t.kind=$2 AND a.id=ANY(t.attachment_ids)))`,[ids,type,actor??null])).rows;
 if(rows.length!==ids.length)throw new Error('An attachment is unavailable for this document. Remove it or upload it again.');
 return ids.map(id=>{const row=rows.find(row=>row.id===id)!;return {filename:row.filename,contentType:row.contentType,size:Number(row.size),content:decryptMail(row.encrypted_content).text};});
}
