"use client";

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import ThemedSelect from '@/components/themed-select';
import {FileText,RefreshCw,Send,Save,Paperclip,X,Palette} from 'lucide-react';
import MarkdownEditor from '@/app/service-review-center/epace/markdown-editor';
import {attachmentSize,type AttachmentMetadata} from '@/lib/mail-attachment-types';
import {customizedOfferMail,themedMailPreview,type MailPreviewTheme} from '@/lib/offer-customization';
import type {OfferContact} from '@/lib/guided-offer';
import {offerPositionOptions} from '@/lib/offer-template';
import {organizationDocuments,documentDefinition,documentField,documentFieldLabel,documentTemplateFields,validateDocumentTemplate,validateDocumentDetails,requiredDocumentFields,fillDocumentTemplate,type DocumentType,type DocumentValues,type DocumentFieldKey} from '@/lib/organization-documents';
import type {SavedDocumentTemplate} from '@/lib/organization-document-store';
import type {StaffCatalog} from '@/lib/staff-catalog';
import AttachmentPreview from './AttachmentPreview';
import './customization.css';

type Setup={catalog:StaffCatalog;contact:OfferContact;managers:{id:string;name:string;email:string}[];configured:boolean;templates:Partial<Record<DocumentType,SavedDocumentTemplate>>};
type Draft={fields:DocumentValues;edited:string|null;subject:string|null;attachments?:AttachmentMetadata[]};
const emptyDraft:Draft={fields:{note:''},edited:null,subject:null};
const control='mt-2 w-full rounded-xl border border-[#e2e5ef] bg-white px-3 py-3 text-sm outline-none focus:border-[#6255e8] focus:ring-2 focus:ring-[#6255e8]/10';
const button='inline-flex items-center justify-center gap-2 rounded-xl border border-[#e2defa] px-4 py-3 text-sm font-medium text-[#6255e8] hover:bg-[#f5f2ff] disabled:opacity-50';

export default function MyCustomization(){
 const [setup,setSetup]=useState<Setup|null>(null),[type,setType]=useState<DocumentType>('offer');
 const [drafts,setDrafts]=useState<Partial<Record<DocumentType,Draft>>>({}),[references,setReferences]=useState<Partial<Record<DocumentType,string>>>({});
 const [issuedAt,setIssuedAt]=useState<Date|null>(null),[preview,setPreview]=useState<{id:string;html:string;subject:string;to:string}|null>(null);
 const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [customPosition,setCustomPosition]=useState(false),[newPosition,setNewPosition]=useState('');
 const [theme,setTheme]=useState<MailPreviewTheme>('purple');
 const revision=useRef(0),uploadInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  const c=new AbortController();
  fetch('/api/workspace/admin/mail/customization',{cache:'no-store',signal:c.signal}).then(async r=>{
   const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load organization templates.');
   setSetup({...data,templates:data.templates??(data.template?{offer:data.template}:{})});
   setReferences(Object.fromEntries(organizationDocuments.map(doc=>[doc.id,doc.prefix+'-'+crypto.randomUUID().slice(0,8).toUpperCase()])));
   setIssuedAt(new Date());
  }).catch(e=>{if(!c.signal.aborted)setError(e.message);});
  return()=>c.abort();
 },[]);
 const definition=documentDefinition(type),draft=drafts[type]??emptyDraft,fields=draft.fields,saved=setup?.templates[type];
 const template={markdown:draft.edited??saved?.markdown??definition.markdown,subject:draft.subject??saved?.subject??definition.subject};
 const attachments=draft.attachments??saved?.attachments??[];
 const reference=references[type]??definition.prefix+'-DRAFT';
 let filled={markdown:'',subject:''},liveHtml='',templateError='';
 if(setup&&issuedAt)try{
  validateDocumentTemplate(type,template.markdown,template.subject);
  filled=fillDocumentTemplate(type,template,fields,setup.contact,reference,issuedAt,true);
  liveHtml=customizedOfferMail(filled.markdown,filled.subject,setup.contact,attachments).html;
 }catch(e){templateError=e instanceof Error?e.message:'Check the template fields.';}
 const used=new Set([...(template.markdown+' '+template.subject).matchAll(/\{\{([^{}]+)\}\}/g)].map(match=>match[1]));
 const visible=definition.fields.filter(key=>key==='email'||used.has(key)),required=new Set(requiredDocumentFields(type,template));
 const departmentCode=setup?.catalog.departments.find(d=>d.name===fields.department)?.code;
 const positions=offerPositionOptions(setup?.catalog.jobTitles??[],departmentCode),departments=setup?.catalog.departments.map(d=>d.name)??[];
 const managers=setup?.managers.map(m=>m.name+' ('+m.email+')')??[];
 function optionsFor(key:DocumentFieldKey){const field=documentField(key);return field.input==='position'?positions:field.input==='department'?departments:field.input==='manager'?managers:field.options;}
 const templateMenu=Object.entries(documentTemplateFields(type)).map(([key,label])=>({key,label,choices:definition.fields.includes(key as DocumentFieldKey)?optionsFor(key as DocumentFieldKey):undefined}));
 function invalidate(){revision.current++;setPreview(null);setReviewed(false);setNotice('');}
 function editDraft(change:Partial<Draft>){setDrafts(current=>({...current,[type]:{...(current[type]??emptyDraft),...change}}));invalidate();}
 function update(key:string,value:string){editDraft({fields:{...fields,[key]:value,...(key==='department'?{role:''}:{})}});}
 function chooseType(next:DocumentType){setType(next);setCustomPosition(false);setNewPosition('');setError('');invalidate();}
 async function addPosition(){
  if(!setup||departmentCode===undefined||!newPosition.trim())return;
  const version=revision.current;setBusy('position');setError('');
  try{
   const r=await fetch('/api/workspace/catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'job_title',name:newPosition.trim(),departmentCode})}),data=await r.json();
   if(!r.ok)throw new Error(data.error);
   setSetup(current=>current?{...current,catalog:{...current.catalog,jobTitles:[...current.catalog.jobTitles,data.entry]}}:current);
   if(version===revision.current)update('role',data.entry.name);setNewPosition('');setCustomPosition(false);
  }catch(e){setError(e instanceof Error?e.message:'Could not save the position.');}finally{setBusy('');}
 }
 async function attachFiles(files:File[]){
  if(!files.length)return;setError('');setBusy('attachment');const added:AttachmentMetadata[]=[];
  try{
   if(files.some(file=>file.size===0))throw new Error('Choose non-empty attachment files.');
   for(const file of files){
    const form=new FormData();form.set('documentType',type);form.set('file',file);
    const response=await fetch('/api/workspace/admin/mail/attachments',{method:'POST',body:form}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'Could not upload the file.');added.push(data.attachment);
   }
  }catch(e){setError(e instanceof Error?e.message:'Could not attach the files.');}
  finally{if(added.length)editDraft({attachments:[...attachments,...added]});setBusy('');}
 }
 async function saveTemplate(){
  const version=revision.current,selected=type;setBusy('save');setError('');setNotice('');
  try{
   const r=await fetch('/api/workspace/admin/mail/customization',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentType:selected,...template,revision:saved?.revision??0,attachmentIds:attachments.map(file=>file.id)})}),data=await r.json();
   if(!r.ok)throw new Error(data.error);
   setSetup(current=>current?{...current,templates:{...current.templates,[selected]:data.template}}:current);
   if(version===revision.current)setDrafts(current=>({...current,[selected]:{...(current[selected]??emptyDraft),edited:null,subject:null,attachments:undefined}}));
   setNotice(definition.label+' template saved for all Admins. New chatbot drafts use this wording and fill recipient details automatically.');
  }catch(e){setError(e instanceof Error?e.message:'Could not save the template.');}finally{setBusy('');}
 }
 async function prepareSend(){
  setError('');setNotice('');const version=revision.current;
  try{
   if(templateError)throw new Error(templateError);validateDocumentDetails(type,fields,template);setBusy('preview');
   const r=await fetch('/api/workspace/admin/mail/customization',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentType:type,details:fields,template,reference,attachmentIds:attachments.map(file=>file.id)})}),data=await r.json();
   if(!r.ok)throw new Error(data.error);if(version!==revision.current)return;
   setPreview({id:data.id,html:data.preview.html,subject:data.preview.subject,to:data.to});setReviewed(false);
  }catch(e){setError(e instanceof Error?e.message:'Could not prepare the document.');}finally{setBusy('');}
 }
 async function send(){
  if(!preview||!reviewed)return;setBusy('send');setError('');
  try{
   const r=await fetch('/api/workspace/admin/mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm-document',id:preview.id,confirm:true})}),data=await r.json();
   if(!r.ok)throw new Error(data.error);setPreview(null);setReviewed(false);
   setReferences(current=>({...current,[type]:definition.prefix+'-'+crypto.randomUUID().slice(0,8).toUpperCase()}));setIssuedAt(new Date());
   setNotice(definition.label+' queued successfully. Check Email status for delivery progress.');
  }catch(e){setError(e instanceof Error?e.message:'Could not queue the document.');}finally{setBusy('');}
 }
 function renderField(key:DocumentFieldKey){
  const field=documentField(key),label=documentFieldLabel(type,key),value=fields[key]??'',choices=optionsFor(key);
  let input;
  if(field.input==='position')input=<>
   <ThemedSelect aria-label={label} className={control} value={customPosition?'__new__':value} onChange={e=>{const creating=e.target.value==='__new__';setCustomPosition(creating);if(!creating)update(key,e.target.value);}}>
    <option value="">{positions.length?'Choose company position':'No saved positions yet'}</option>
    {[...new Set([...positions,...(value?[value]:[])])].map(position=><option key={position} value={position}>{position}</option>)}
    <option value="__new__">Add company position…</option>
   </ThemedSelect>
   {customPosition&&<div className="mt-3 space-y-2"><input aria-label="New company position" className={control} maxLength={160} value={newPosition} onChange={e=>setNewPosition(e.target.value)} placeholder="e.g. Assistant Software Developer"/><button type="button" className={button} disabled={Boolean(busy)||departmentCode===undefined||!newPosition.trim()} onClick={()=>void addPosition()}>{busy==='position'?'Saving…':'Save position to department'}</button></div>}
   <span className="mt-2 block text-[11px] text-slate-500">{departmentCode===undefined?'Select a department to add its company position.':positions.length?'Positions registered for '+fields.department+'.':'Add a registered company position for '+fields.department+'.'}</span>
  </>;
  else if(choices)input=<ThemedSelect aria-label={label} className={control} value={value} onChange={e=>update(key,e.target.value)}>
   <option value="">Choose {label.toLowerCase()}</option>{[...new Set([...choices,...(value?[value]:[])])].map(choice=><option key={choice} value={choice}>{field.input==='department'?(setup?.catalog.departments.find(d=>d.name===choice)?.code??'')+' · '+choice:choice}</option>)}
  </ThemedSelect>;
  else if(field.input==='multiline')input=<textarea className={control} aria-label={label} rows={4} maxLength={6000} value={value} onChange={e=>update(key,e.target.value)} placeholder={field.optional?'Optional additional information':'Enter the approved details for this document'}/>;
  else input=<input className={control} aria-label={label} type={field.input==='date'?'date':field.input==='email'?'email':'text'} maxLength={field.input==='email'?254:300} value={value} onChange={e=>update(key,e.target.value)} placeholder={field.placeholder??label} list={key==='location'?'organization-work-arrangements':undefined}/>;
  return <label key={key} className={'block text-xs font-medium text-slate-600 '+(field.input==='multiline'?'sm:col-span-2 xl:col-span-3':'')}>{label} {required.has(key)?<span className="text-rose-500">*</span>:<span className="font-normal text-slate-400">(optional)</span>}{input}</label>;
 }
 return <div className="customization min-h-0 flex-1 overflow-y-auto bg-[#f6f7fb] p-5 lg:p-8"><div className="mx-auto max-w-[1500px]">
  <p className="text-xs text-slate-500">Dashboard / My Customization</p>
  <div className="mb-7 mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[#172b49]">My Customization</h1></div>
   <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto"><label className="w-full text-xs font-medium text-slate-500 sm:w-[280px]">Document type<ThemedSelect className={control} aria-label="Document type" value={type} disabled={Boolean(busy)} onChange={e=>chooseType(e.target.value as DocumentType)}>{organizationDocuments.map(doc=><option key={doc.id} value={doc.id}>{doc.label}</option>)}</ThemedSelect></label>
    <label className="w-full text-xs font-medium text-slate-500 sm:w-[165px]"><span className="flex items-center gap-1.5"><Palette className="size-3.5"/>Theme</span><ThemedSelect className={control} aria-label="Mail preview theme" value={theme} onChange={e=>setTheme(e.target.value as MailPreviewTheme)}><option value="white">White</option><option value="black">Dark (Black)</option><option value="purple">Purple</option></ThemedSelect></label></div>
  </div>
  <datalist id="organization-work-arrangements"><option value="Remote"/><option value="Hybrid"/><option value="On-site"/></datalist>
  {!setup?<p role={error?'alert':'status'} className="p-6 text-sm text-slate-500">{error||'Loading your company details…'}</p>:<>
   <section className="mb-6 rounded-2xl border border-[#e4e6f0] bg-white p-6"><div className="mb-5 flex items-center gap-3"><FileText className="size-5 text-[#6255e8]"/><div><h2 className="font-semibold">{definition.label} details</h2><p className="mt-1 text-xs text-slate-500">{definition.group} · These values fill the live preview. Reusable fields stay in your saved template.</p></div></div>
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visible.map(renderField)}</div><p className="mt-4 text-xs text-slate-500">Company departments, positions and managers come from your workspace. Signature and contact details use the sending Admin’s profile.</p>
   </section>
   <div className="grid items-start gap-6 xl:grid-cols-2">
    <section className="overflow-hidden rounded-2xl border border-[#e4e6f0] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ececf5] p-5"><div><h2 className="font-semibold">{definition.label} template editor</h2><p className="mt-1 text-xs text-slate-500">Select text to format · Right-click to insert document fields</p></div><button disabled={Boolean(busy)} className={button} type="button" onClick={()=>{editDraft({edited:null,subject:null,attachments:undefined});setError('');}}><RefreshCw className="size-4"/>Reset edits</button></div>
     <div className="space-y-4 p-5"><label className="block text-xs font-medium text-slate-500">Subject template<input className={control} maxLength={300} value={template.subject} onChange={e=>editDraft({subject:e.target.value})}/></label>
      <div className="customization-editor rounded-xl border border-[#e4e1fb] p-5 focus-within:border-[#6255e8]"><MarkdownEditor key={type} value={template.markdown} onChange={value=>editDraft({edited:value})} onSend={()=>{}} ariaLabel={definition.label+' editor'} placeholder="Your organization document…" templateMenu={templateMenu} onTemplateChoice={(key,value)=>{if(definition.fields.includes(key as DocumentFieldKey))update(key,value);}}/></div>
      <section className="rounded-xl border border-[#e4e1fb] bg-[#faf9ff] p-4" aria-label="Document attachments"><h3 className="flex items-center gap-2 text-sm font-semibold text-[#172b49]"><Paperclip className="size-4 text-[#6255e8]"/>Attach files</h3><p className="mt-1 text-xs text-slate-500">Files appear below Contact us and are sent with this document. Save for Chatbot to reuse them.</p>
       <button type="button" disabled={Boolean(busy)} className={'mt-3 '+button} onClick={()=>uploadInput.current?.click()}><Paperclip className="size-4"/>{busy==='attachment'?'Uploading…':'Choose files'}</button>
       <input ref={uploadInput} type="file" multiple disabled={Boolean(busy)} hidden aria-label="Attach document files" onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void attachFiles(files);}}/>
       {attachments.length>0&&<ul className="mt-3 space-y-2">{attachments.map(file=><li key={file.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#e4e1fb] bg-white px-3 py-2"><a className="min-w-0 break-all text-xs font-medium text-[#6255e8] hover:underline" href={'/api/workspace/admin/mail/attachments?id='+file.id}>{file.filename}<span className="ml-2 font-normal text-slate-500">{attachmentSize(file.size)}</span></a><span className="flex shrink-0 items-center gap-1"><AttachmentPreview file={file}/><button type="button" className="rounded-md p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={'Remove '+file.filename} disabled={Boolean(busy)} onClick={()=>editDraft({attachments:attachments.filter(item=>item.id!==file.id)})}><X className="size-4"/></button></span></li>)}</ul>}
      </section>
      <p className="text-xs text-slate-500">Fields such as {'{{name}}'} fill automatically in the preview and chatbot. Admin contact fields use <Link href="/dashboard/settings" className="text-[#6255e8] underline">the sending Admin’s profile</Link>. All wording is editable.</p>
      <button type="button" disabled={Boolean(busy)} className="text-xs font-medium text-[#6255e8] hover:underline" onClick={()=>{editDraft({edited:definition.markdown,subject:definition.subject});setError('');}}>Use organization default template</button>
      {(error||templateError)&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error||templateError}</p>}
      {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice} <Link href="/dashboard/administration#mail-center" className="underline">Email status</Link></p>}
      <button type="button" disabled={Boolean(busy)||Boolean(templateError)} className={button+' w-full customization-primary'} onClick={()=>void saveTemplate()}><Save className="size-4"/>{busy==='save'?'Saving…':'Save for Chatbot'}</button>
      <p className="text-xs text-slate-500">{saved?'Saved version '+saved.revision+' · '+new Date(saved.updatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST':'Organization default · not saved yet'}{(draft.edited!==null||draft.subject!==null||draft.attachments!==undefined)&&' · Unsaved changes'}</p>
      <p className="text-xs text-slate-500">In Playground, say <span className="font-medium text-slate-700">“Prepare a {definition.label}”</span> to start its guided draft.</p>
      <button type="button" disabled={Boolean(busy)||!setup.configured||Boolean(templateError)} className={button+' w-full'} onClick={()=>void prepareSend()}><Send className="size-4"/>{busy==='preview'?'Preparing…':'Prepare email for sending'}</button>
      {!setup.configured&&<p className="text-xs text-amber-700">Configure organization email delivery before preparing a send preview.</p>}
     </div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-[#e4e6f0] bg-white xl:sticky xl:top-5"><header className="border-b border-[#ececf5] p-5"><h2 className="font-semibold">{preview?'Confirm sending':'Live email preview'}</h2><p className="mt-2 break-all text-xs text-slate-500"><b>To:</b> {preview?.to||fields.email||'Choose recipient email'}<br/><b>Subject:</b> {preview?.subject||filled.subject}</p></header>
     <p className="border-b border-[#ececf5] bg-[#faf9ff] px-5 py-3 text-xs text-slate-500">{theme==='black'?'Dark':theme==='purple'?'Purple':'White'} appearance · Purple is the default email design. Email apps may adjust colors.</p>
     <iframe title={preview?'Exact document email preview':'Live document email preview'} sandbox="" srcDoc={themedMailPreview(preview?.html||liveHtml,theme)} className="h-[800px] w-full"/>
     {preview&&<div className="space-y-4 border-t border-slate-100 p-5"><p className="text-xs text-slate-500">Preview expires after 10 minutes. Any edit requires preparing the email again.</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the recipient, wording and approved document details.</label><button disabled={!reviewed||Boolean(busy)} className={button+' w-full customization-primary'} onClick={()=>void send()}><Send className="size-4"/>{busy==='send'?'Sending…':'Confirm and send email'}</button></div>}
    </section>
   </div>
  </>}
 </div></div>;
}
