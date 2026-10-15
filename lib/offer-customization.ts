import {attachmentSize} from './mail-attachment-types';
import {Marked,Renderer} from 'marked';
import {escapeMail,type MailContent} from './mail-templates';
import {type GuidedOffer,type OfferContact,offerFields,offerFieldError,missingOfferField} from './guided-offer';

export function validateOfferDetails(input:unknown):GuidedOffer {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Complete the candidate and employment details.');
 const fields:GuidedOffer={note:''};
 for(const key of offerFields){const value=(input as Record<string,unknown>)[key];if(key==='note'&&value===undefined)continue;if(typeof value!=='string')throw new Error('Complete every employment detail.');const error=offerFieldError(key,value);if(error)throw new Error(error);fields[key]=value;}
 if(missingOfferField(fields))throw new Error('Complete every employment detail.');
 return fields;
}
export function offerMarkdown(fields:GuidedOffer,reference:string,date=new Date(),contact?:OfferContact) {
 const safe=(value:string)=>value.replace(/[\\`*_[\]<>|]/g,'\\$&');
 const val=(key:keyof GuidedOffer)=>safe(fields[key]||'Choose '+key);
 const joining=fields.joiningDate?new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeZone:'UTC'}).format(new Date(fields.joiningDate+'T00:00:00Z')):'Choose joining date';
 return `# AIForce.Ops

Intelligent Service Operations

## Employment Offer\n\nReference: ${reference}  \nDate: ${new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeZone:'Asia/Kolkata'}).format(date)}\n\nDear ${val('name')},\n\nWe are pleased to offer you the position of **${val('role')}** at AIForce.Ops. We look forward to the skills, ideas and commitment you will bring to our team.\n\n## Employment details\n\n| Particular | Details |\n| --- | --- |\n| Position | ${val('role')} |\n| Department | ${val('department')} |\n| Employment type | ${val('employmentType')} |\n| Work location / arrangement | ${val('location')} |\n| Joining date | ${joining} |\n| Reporting manager | ${val('reportingManager')} |\n| Approved compensation | ${val('compensation')} |\n\n## Acceptance and next steps\n\nPlease reply to confirm your acceptance of this offer. Following your acceptance, our team will contact you with the required onboarding documents and joining instructions. Any additional employment terms and applicable policies will be communicated separately.\n\nWe look forward to welcoming you to our team.

Kind regards,  
${safe(contact?.name||'Your name')}  
Authorized Representative  
AIForce.Ops

## Contact us

Email: ${safe(contact?.email||'Your email')}  
Phone: ${safe(contact?.phone||'Enter contact phone')}`;
}
export function customizedOfferMail(markdown:string,subject:string,contact:OfferContact,files:readonly {filename:string;size:number;contentType?:string;content?:string}[]=[]):MailContent {
 if(!markdown.trim()||markdown.length>12000||!subject.trim()||subject.length>300||/[\r\n]/.test(subject))throw new Error('Enter a letter and a valid subject.');
 if(!contact.email)throw new Error('Your Admin profile email is required.');
 const renderer=new Renderer();
 renderer.html=({text})=>escapeMail(text);
 renderer.image=({text})=>escapeMail(text);
 renderer.link=function({href,tokens}){const label=this.parser.parseInline(tokens);return /^(https?:\/\/|mailto:)/i.test(href)?`<a href="${escapeMail(href)}" style="color:#6255e8">${label}</a>`:label;};
 renderer.paragraph=function({tokens}){return `<p style="margin:0 0 18px;line-height:1.8">${this.parser.parseInline(tokens)}</p>`;};
 renderer.heading=function({tokens,depth}){return `<h${depth} style="font-size:${depth===1?26:18}px;line-height:1.35;margin:${depth===1?'0 0 12px':'28px 0 14px'};color:${depth===1?'#6255e8':'#172b49'};font-weight:700">${this.parser.parseInline(tokens)}</h${depth}>`;};
 renderer.tablecell=function(token){return `<${token.header?'th':'td'} style="text-align:left;vertical-align:top;padding:12px 14px;border:1px solid #e5e7ef;${token.header?'background:#f5f6fb;font-weight:600;':'color:#334155;'}overflow-wrap:anywhere">${this.parser.parseInline(token.tokens)}</${token.header?'th':'td'}>`;};
 const html=new Marked({renderer,gfm:true,breaks:true}).parse(markdown,{async:false}).replace(/<table>/g,'<table width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px;margin:20px 0">');
 const attachmentHtml=files.length?`<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7ef"><h2 style="font-size:18px;color:#172b49;margin:0 0 12px">Attachments</h2>${files.map(file=>`<div style="background:#f5f6fb;border:1px solid #e5e7ef;border-radius:8px;padding:12px 14px;margin-bottom:8px;color:#334155">${escapeMail(file.filename)} <span style="font-size:12px;color:#64748b">· ${attachmentSize(file.size)}</span></div>`).join('')}</div>`:'';
 const attachments=files.filter(file=>typeof file.content==='string').map(file=>({filename:file.filename,size:file.size,contentType:file.contentType??'application/octet-stream',content:file.content!}));
 return {subject,replyTo:contact.email,...(attachments.length?{attachments}:{}),text:markdown+(files.length?'\n\nAttachments\n'+files.map(file=>file.filename+' ('+attachmentSize(file.size)+')').join('\n'):''),html:themedMailPreview(`<!doctype html><html data-mail-theme="white"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#f5f6fb;color:#263247;font:14px Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeMail(subject)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e7ef;border-top:5px solid #6255e8;border-radius:12px"><tr><td style="padding:30px 24px;overflow-wrap:anywhere">${html}${attachmentHtml}</td></tr></table></td></tr></table></body></html>`,'purple')};
}

export type MailPreviewTheme='white'|'black'|'purple';
const previewPalettes={
 white:{},
 black:{'#f5f6fb':'#101014','#fff':'#1c1c24','#263247':'#e5e7ef','#172b49':'#f3f4f8','#334155':'#d5d7e2','#e5e7ef':'#373741','#6255e8':'#a89cff','#64748b':'#a8aab9'},
 purple:{'#f5f6fb':'#eee9fa','#fff':'#fbf9ff','#263247':'#36294d','#172b49':'#412365','#334155':'#514064','#e5e7ef':'#dcd0ed','#6255e8':'#7446b8','#64748b':'#80678f'}
};
/** Recipient appearance simulation. The original prepared email remains unchanged. */
export function themedMailPreview(html:string,theme:MailPreviewTheme){
 const current=html.match(/data-mail-theme="(white|black|purple)"/)?.[1] as MailPreviewTheme|undefined;
 const source=previewPalettes[current??'white'] as Record<string,string>,target=previewPalettes[theme] as Record<string,string>;
 const colors=Object.fromEntries(Object.keys(previewPalettes.purple).map(base=>[source[base]??base,target[base]??base]));
 return html.replace(/style="([^"]*)"/g,(_,styles:string)=>'style="'+styles.replace(/#[a-f0-9]{3,6}\b/gi,color=>colors[color.toLowerCase()]??color)+'"').replace(/data-mail-theme="(white|black|purple)"/,'data-mail-theme="'+theme+'"');
}
