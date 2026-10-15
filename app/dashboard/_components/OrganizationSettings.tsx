"use client";
import { useEffect, useState } from 'react';
import { Activity, BriefcaseBusiness, Check, ChevronDown, Globe, Search, Settings2, ShieldCheck, Zap } from 'lucide-react';
import ThemedSelect from '@/components/themed-select';

type Settings={settings:{owner_id:string;requests_per_minute:number};policy:{allow_runs:boolean;allow_writes:boolean;require_https:boolean};events:{id:string;name:string;actor_role:string;kind:string;severity:string;summary:string;path:string;created_at:string}[];jobs:{id:string;title:string;active:boolean}[]};
const field='w-full rounded-xl border border-[#e2e5ef] bg-[#fbfbfe] px-3.5 py-2.5 text-sm text-[#30394b] outline-none transition focus:border-[#aaa2ef] focus:ring-3 focus:ring-[#6255e8]/10';
const primary='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#6255e8] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#5346d2] disabled:cursor-not-allowed disabled:opacity-50';

export default function OrganizationSettings({admins}:{admins:{user_id:string;name:string;active:boolean;role:string}[]}) {
 const [data,setData]=useState<Settings|null>(null),[owner,setOwner]=useState(''),[limit,setLimit]=useState('180'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[url,setUrl]=useState(''),[search,setSearch]=useState('');
 useEffect(()=>{let mounted=true;fetch('/api/workspace/organization',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);if(mounted){setData(b);setOwner(b.settings.owner_id||'');setLimit(String(b.settings.requests_per_minute));}}).catch(e=>{if(mounted)setError(e.message);});return()=>{mounted=false;};},[revision]);
 async function save(body:Record<string,unknown>){setBusy(true);setError('');setNotice('');try{const response=await fetch('/api/workspace/organization',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await response.json();if(!response.ok)throw new Error(b.error);setNotice(body.action==='vacancy'?'Position published.':'Organization settings saved.');setRevision(v=>v+1);if(body.action==='vacancy'){setTitle('');setDescription('');setUrl('');}}catch(e){setError(e instanceof Error?e.message:'Update failed.');}finally{setBusy(false);}}
 const events=data?.events.filter(e=>[e.name,e.actor_role,e.summary,e.path].join(' ').toLowerCase().includes(search.toLowerCase()))||[];
 const policies=data?[
  {name:'Agent execution',value:data.policy.allow_runs?'Enabled':'Disabled',enabled:data.policy.allow_runs,icon:Zap},
  {name:'Workspace changes',value:data.policy.allow_writes?'Enabled':'Disabled',enabled:data.policy.allow_writes,icon:Settings2},
  {name:'External HTTPS',value:data.policy.require_https?'Required':'Optional',enabled:data.policy.require_https,icon:Globe}
 ]:[];
 return <section id="organization-controls" aria-labelledby="organization-controls-title" className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_4px_24px_rgba(31,41,55,.025)]">
  <div className="flex items-start gap-3 border-b border-[#edeef5] bg-gradient-to-r from-[#faf9ff] to-white p-5 sm:px-6">
   <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e5e1ff] bg-white text-[#6255e8]"><Settings2 className="size-5"/></span>
   <div><h2 id="organization-controls-title" className="text-base font-semibold text-[#283144]">Organization controls</h2><p className="mt-1 text-xs leading-5 text-[#7c8799]">Manage shared data access and account protection across your organization.</p></div>
   <span className="ml-auto hidden shrink-0 rounded-full border border-[#e5e1ff] bg-[#f1eeff] px-3 py-1 text-[10px] font-medium text-[#6255e8] sm:inline-flex">Admin controls</span>
  </div>
  <div className="space-y-6 p-5 sm:p-6">
   <form onSubmit={e=>{e.preventDefault();void save({action:'settings',ownerId:owner,requestsPerMinute:Number(limit)});}}>
    <div className="grid gap-5 sm:grid-cols-2">
     <label className="block text-xs font-medium text-[#465168]">Integration owner<ThemedSelect className={field+' mt-2'} value={owner} disabled={!data||busy} onChange={e=>setOwner(e.target.value)}>{admins.filter(a=>a.active&&a.role==='admin').map(a=><option key={a.user_id} value={a.user_id}>{a.name}</option>)}</ThemedSelect><span className="mt-2 block text-[11px] font-normal leading-5 text-[#8792a4]">This Admin’s integrations supply shared Review Center readings.</span></label>
     <label className="block text-xs font-medium text-[#465168]">Requests per account per minute<input required className={field+' mt-2'} type="number" min={30} max={600} step={1} value={limit} disabled={!data||busy} onChange={e=>setLimit(e.target.value)}/><span className="mt-2 block text-[11px] font-normal leading-5 text-[#8792a4]">Applies to all accounts. Allowed range: 30–600 requests.</span></label>
    </div>
    <div className="mt-5 flex justify-end"><button disabled={busy||!data||!owner} className={primary}><Check className="size-3.5"/>{busy?'Saving…':'Save organization controls'}</button></div>
   </form>
   <div className="rounded-xl border border-[#e8e5f7] bg-[#faf9fe] p-4">
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#465168]"><ShieldCheck className="size-4 text-[#6255e8]"/>Shared security policy</div>
    <div className="grid gap-2 sm:grid-cols-3">{policies.map(({name,value,enabled,icon:Icon})=><div key={name} className="flex items-center gap-2 rounded-lg border border-[#e9e7f3] bg-white px-3 py-3"><Icon className="size-4 shrink-0 text-[#8b82ce]"/><div className="min-w-0 flex-1"><p className="text-[11px] text-[#8290a2]">{name}</p><p className={'mt-1 flex items-center gap-1.5 text-xs font-medium '+(enabled?'text-emerald-700':'text-amber-700')}><span className={'size-1.5 rounded-full '+(enabled?'bg-emerald-500':'bg-amber-500')}/>{value}</p></div></div>)}</div>
    {!data&&<p className="text-xs text-[#8792a4]">Loading security policy…</p>}
    <p className="mt-3 text-[11px] leading-5 text-[#8792a4]">Protection applies to every account. Update the policy in eAssist → Security; those controls remain Admin only.</p>
   </div>
   <div className="space-y-3">
    <details className="group overflow-hidden rounded-xl border border-[#e6e8f0]">
     <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition hover:bg-[#faf9ff] [&::-webkit-details-marker]:hidden">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f1eeff] text-[#6255e8]"><BriefcaseBusiness className="size-4"/></span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#354158]">Recruitment · Published positions</span><span className="mt-1 block text-[11px] text-[#8792a4]">Manage openings shown in the company assistant.</span></span>
      <span className="rounded-full bg-[#f2f3f8] px-2.5 py-1 text-[10px] text-[#748096]">{data?.jobs.filter(j=>j.active).length||0} open</span><ChevronDown className="size-4 text-[#8b95a6] transition group-open:rotate-180"/>
     </summary>
     <div className="border-t border-[#edeef5] p-4 sm:p-5">
      <form onSubmit={e=>{e.preventDefault();void save({action:'vacancy',title,description,applicationUrl:url,active:true});}} className="space-y-4">
       <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium text-[#465168]">Position title<input required maxLength={120} placeholder="e.g. Software Development Engineer" className={field+' mt-2'} value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="text-xs font-medium text-[#465168]">Application link<input required type="url" placeholder="https://company.example/careers/position" className={field+' mt-2'} value={url} onChange={e=>setUrl(e.target.value)}/></label></div>
       <label className="block text-xs font-medium text-[#465168]">Role and recruitment details<textarea rows={3} placeholder="Responsibilities, eligibility and how to apply…" className={field+' mt-2 resize-y'} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
       <div className="flex justify-end"><button disabled={busy||!title.trim()||!url.trim()} className={primary}><BriefcaseBusiness className="size-3.5"/>Publish position</button></div>
      </form>
      <div className="mt-5 space-y-2 border-t border-[#edeef5] pt-4">{data?.jobs.length?data.jobs.map(job=><div key={job.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f9fafc] px-3 py-3"><p className="text-xs font-medium text-[#465168]">{job.title}</p><span className={'rounded-full px-2.5 py-1 text-[10px] font-medium '+(job.active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500')}>{job.active?'Published':'Closed'}</span></div>):<p className="py-3 text-center text-xs text-[#8792a4]">No positions published yet.</p>}</div>
     </div>
    </details>
    <details className="group overflow-hidden rounded-xl border border-[#e6e8f0]">
     <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition hover:bg-[#faf9ff] [&::-webkit-details-marker]:hidden">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f1eeff] text-[#6255e8]"><Activity className="size-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#354158]">Organization account activity and security events</span><span className="mt-1 block text-[11px] text-[#8792a4]">Review account actions and protection signals.</span></span><ChevronDown className="size-4 shrink-0 text-[#8b95a6] transition group-open:rotate-180"/>
     </summary>
     <div className="border-t border-[#edeef5] p-4">
      <label className="mb-3 flex items-center gap-2 rounded-lg border border-[#e6e8f0] px-3 py-2.5"><Search className="size-4 text-[#9aa3b2]"/><input aria-label="Search organization activity" className="w-full text-xs outline-none" placeholder="Search account, role or activity…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <div className="max-h-80 overflow-y-auto">{events.length?events.map(e=><article key={e.id} className="border-b border-[#eef0f5] py-3 last:border-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs font-medium text-[#465168]">{e.name||'Anonymous'}</strong><span className="rounded-md bg-[#f1eeff] px-2 py-0.5 text-[10px] capitalize text-[#7266c5]">{e.actor_role}</span>{e.severity!=='info'&&<span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] capitalize text-amber-700">{e.severity}</span>}<time className="ml-auto text-[10px] text-[#929cad]">{new Date(e.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})} IST</time></div><p className="mt-2 text-xs leading-5 text-[#69778c]">{e.summary}</p><p className="mt-1 break-all font-mono text-[10px] text-[#98a2b2]">{e.path}</p></article>):<p className="py-8 text-center text-xs text-[#8792a4]">{data?'No activity matches this view.':'Loading activity…'}</p>}</div>
      <p className="mt-3 text-[10px] text-[#98a2b2]">Showing the latest {data?.events.length||0} recorded events.</p>
     </div>
    </details>
   </div>
   {error&&<p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p>}
   {notice&&<p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">{notice}</p>}
  </div>
 </section>;
}

