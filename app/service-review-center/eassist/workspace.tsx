'use client';

import {useCallback,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';

import {Activity,ArrowLeft,ArrowUpRight,Bell,BellOff,BookOpen,Check,ChevronDown,ChevronRight,Clock,Code2,Copy,Database,ExternalLink,FileCode2,Filter,GitBranch,Info,KeyRound,LayoutDashboard,Link2,Loader2,Menu,Network,Pencil,Play,Plus,RefreshCw,Search,Settings,ShieldCheck,TerminalSquare,Trash2,Users,X,Zap} from 'lucide-react';

import WorkspaceUserMenu from '@/components/auth/WorkspaceUserMenu';

import WorkspaceLink from "@/components/workspace-link";

import {array,object,resourceFields,terminalStates,taskStatusLabel,textValue as text,type Connection,type Field,type Json,type RecordItem} from '@/lib/eassist/types';

import {refresh,request,useWorkspace} from './client-store';

import Security from './Security';

import Terminal from './Terminal';

import Monitoring from './Monitoring';

import './workspace.css';



const navigation=[['alerts','Alerts',Bell],['silences','Silences',BellOff],['incidents','Incidents',FileCode2],['dashboard','Dashboard',LayoutDashboard],['templates','Task Templates',Code2],['schedules','Schedule',Clock],['inventory','Inventory',Database],['environment','Variable Groups',Settings],['keys','Key Store',KeyRound],['repositories','Repositories',GitBranch],['integrations','Integrations',Network],['users','Team',Users],['activity','Activity',Activity],['status','Status',Info],['security','Security',ShieldCheck],['settings','Settings',Settings],['help','Help',BookOpen]] as const;

const labels:Record<string,string>=Object.fromEntries(navigation.map(([key,label])=>[key,label]));

const descriptions:Record<string,string>={alerts:'Investigate incoming signals and take action from one operational workspace.',silences:'Manage time-bound alert silences in your connected Alertmanager.',incidents:'Track incidents, update work notes, and record resolution evidence.',templates:'Run operational playbooks and follow each task from launch to completion.',integrations:'Connect your monitoring, service management, and automation systems.',security:'Control access to actions, credentials, and source-system changes.',dashboard:'An overview of the operational records available to your account.',activity:'A durable record of actions taken through eAssist.',status:'Connection health and the time each source was last synchronized.',settings:'Manage connection credentials and alert delivery.',help:'How alerts, incidents, and automation work together.'};

function subscribeNavigation(callback:()=>void){window.addEventListener('popstate',callback);window.addEventListener('eassist:navigate',callback);return()=>{window.removeEventListener('popstate',callback);window.removeEventListener('eassist:navigate',callback);};}

function go(view:string,id='',connectionId=''){const url=new URL(window.location.href);url.search='';url.searchParams.set('view',view);if(id)url.searchParams.set('id',id);if(connectionId)url.searchParams.set('connection',connectionId);window.history.pushState({},'',url);window.dispatchEvent(new Event('eassist:navigate'));}

function date(value:unknown){if(!value)return '—';const d=new Date(String(value));return Number.isNaN(d.getTime())?String(value):d.toLocaleString();}

function safeHref(value:unknown){try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}}

function Badge({value}:{value:unknown}){const status=text(object(value).state||value)||'Not launched';const color=/^(success|connected|active|resolved)$/i.test(status)?'ea-green':/error|fail|critical/i.test(status)?'ea-red':/pending|waiting|warning|unverified|suppressed|inactive/i.test(status)?'ea-amber':'ea-violet';return <span className={`ea-badge ${color}`}>{taskStatusLabel(status)}</span>;}

function Empty({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}){return <div className="ea-empty"><Database size={26} className="mx-auto text-slate-300"/><h2>{title}</h2><p>{children}</p>{action}</div>;}

function Modal({title,children,footer,close}:{title:string;children:ReactNode;footer?:ReactNode;close:()=>void}){

  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const modal=document.querySelector<HTMLElement>('[data-ea-dialog]');modal?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();if(e.key==='Tab'&&modal){const controls=Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]'));const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[close]);

  return <div className="ea-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section data-ea-dialog tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="ea-modal"><div className="ea-modal-head"><h2 className="flex-1">{title}</h2><button className="ea-btn" aria-label="Close dialog" onClick={close}><X size={16}/></button></div><div className="ea-modal-content">{children}</div>{footer&&<div className="ea-modal-foot">{footer}</div>}</section></div>;

}

function FieldInput({field,value,onChange}:{field:Field;value:unknown;onChange:(v:unknown)=>void}){return <label className={`ea-label ${field.type==='textarea'?'ea-wide':''}`}>{field.label}{field.required?' *':''}{field.options?<select className="ea-input" value={text(value)} onChange={e=>onChange(e.target.value)}>{field.options.map(v=><option key={v} value={v}>{v||'Standard task'}</option>)}</select>:field.type==='textarea'?<textarea className="ea-input min-h-24 font-mono" value={text(value)} onChange={e=>onChange(e.target.value)}/>:field.type==='checkbox'?<input type="checkbox" className="size-4 accent-indigo-600" checked={value===true} onChange={e=>onChange(e.target.checked)}/>:<input className="ea-input" type={field.type||'text'} autoComplete={field.type==='password'?'new-password':'off'} value={text(value)} onChange={e=>onChange(e.target.value)}/>} {field.hint&&<span className="ea-subtitle">{field.hint}</span>}</label>;}

type Dialog={type:string;kind?:string;connectionId?:string;id?:string;title:string;fields:Json;requestKey:string;approvalId?:unknown;item?:RecordItem};



export default function EAssistWorkspace({userName,userId}:{userName:string;userId:string}){

  const [error,setError]=useState(''),[streamState,setStreamState]=useState('Connecting'),[busy,setBusy]=useState(false),[mobile,setMobile]=useState(false),[notice,setNotice]=useState('');

  const data=useWorkspace(userId,setStreamState,setError);

  const route=useSyncExternalStore(subscribeNavigation,()=>window.location.search,()=>'?view=alerts');

  const params=new URLSearchParams(route),view=labels[params.get('view')||'']?params.get('view')!:'alerts',selectedId=params.get('id')||'',selectedConnection=params.get('connection')||'';

  const [search,setSearch]=useState(''),[integrationFilter,setIntegrationFilter]=useState(''),[groupBy,setGroupBy]=useState('severity'),[receiver,setReceiver]=useState(''),[matcher,setMatcher]=useState(''),[matchers,setMatchers]=useState<string[]>([]),[showSilenced,setShowSilenced]=useState(false),[showInhibited,setShowInhibited]=useState(false),[showInactive,setShowInactive]=useState(false),[collapsed,setCollapsed]=useState<Set<string>>(new Set()),[info,setInfo]=useState<Set<string>>(new Set()),[category,setCategory]=useState(''),[detailTab,setDetailTab]=useState('tasks');

  const [dialog,setDialog]=useState<Dialog|null>(null),[dialogError,setDialogError]=useState(''),[taskWindow,setTaskWindow]=useState<{connectionId:string;id:string;title:string}|null>(null),[journal,setJournal]=useState<Json[]|null>(null),[journalError,setJournalError]=useState(''),[webhook,setWebhook]=useState<{connectionId:string;token:string}|null>(null),[queryResult,setQueryResult]=useState<Json|null>(null);

  const closeDialog=useCallback(()=>{setDialog(null);setDialogError('');},[]);

  const records=data?.records||[],connections=data?.connections||[];

  const visibleRecords=records.filter(r=>(!integrationFilter||r.connection_id===integrationFilter));

  const source=(id:string)=>connections.find(c=>c.id===id);

  const list=(kind:string)=>visibleRecords.filter(r=>r.kind===kind);

  const selected=records.find(r=>r.kind===view&&r.external_id===selectedId&&r.connection_id===selectedConnection);

  const connectionsOf=(kind:string)=>connections.filter(c=>c.kind===kind&&c.enabled);

  const connectAction=<button className="ea-btn ea-primary" onClick={()=>navigate('integrations')}><Plus size={14}/>Configure integration</button>;

  function navigate(next:string,id='',connectionId=''){go(next,id,connectionId);setMobile(false);setSearch('');setError('');setNotice('');setDetailTab('tasks');}

  function open(type:string,title:string,fields:Json={},extra:Partial<Dialog>={}){setDialogError('');setDialog({type,title,fields,requestKey:crypto.randomUUID(),...extra});}

  function resourceNew(kind:string,c?:Connection){

    const conn=c||connectionsOf(kind==='incidents'?'servicenow':'semaphore')[0];

    if(!conn){navigate('integrations');return;}

    const defaults:Json={};for(const f of resourceFields[kind]||[])if(f.options)defaults[f.key]=f.options[0];

    if(kind==='environment')defaults.json='{}';if(kind==='schedules')defaults.active=true;

    if(kind==='incidents'){defaults.state='1';defaults.urgency='2';defaults.impact='3';}

    open('resource',`New ${labels[kind]||'category'}`,defaults,{kind,connectionId:conn.id});

  }

  async function edit(item:RecordItem,duplicate=false){

    setBusy(true);try{const result=await request({action:'resource.detail',connectionId:item.connection_id,kind:item.kind,id:item.external_id});const fields=object(result.data);open('resource',`${duplicate?'Duplicate':'Edit'} ${labels[item.kind]||'record'}`,{...fields,...(duplicate?{name:`${text(fields.name)} copy`}:{})},{kind:item.kind,connectionId:item.connection_id,id:duplicate?undefined:item.external_id});}catch(e){setError((e as Error).message);}finally{setBusy(false);}

  }

  function run(item:RecordItem){open('run',`Run ${text(item.data.name)||'task template'}`,{message:'Triggered from eAssist'},{connectionId:item.connection_id,id:item.external_id,item});}

  async function perform(body:Json){setBusy(true);setError('');try{const result=await request({...body,requestKey:body.requestKey||crypto.randomUUID()});await refresh(userId);return result;}finally{setBusy(false);}}

  async function doAction(body:Json){try{return await perform(body);}catch(e){setError((e as Error).message);return null;}}

  async function submit(){

    if(!dialog)return;setDialogError('');setBusy(true);

    try{

      const d=dialog;let body:Json={connectionId:d.connectionId,requestKey:d.requestKey};

      if(d.type==='connection')body={...body,action:'connection.save',...d.fields,...(d.id?{id:d.id}:{})};

      if(d.type==='resource')body={...body,action:'resource.save',kind:d.kind,id:d.id,fields:d.fields};

      if(d.type==='delete')body={...body,action:'resource.delete',kind:d.kind,id:d.id};

      if(d.type==='deleteConnection')body={...body,action:'connection.delete',confirmed:true};

      if(d.type==='run'){

        const approvalId=d.approvalId||(await request({action:'task.authorize',connectionId:d.connectionId,id:d.id})).approvalId;

        setDialog(current=>current?{...current,approvalId}:current);

        body={...body,action:'task.run',id:d.id,message:d.fields.message,approvalId};

      }

      if(d.type==='silence'){

        let parsed:unknown;try{parsed=JSON.parse(text(d.fields.matchers));}catch{throw new Error('Matchers must be a valid JSON array.');}

        body={...body,action:'silence.create',connectionId:d.fields.connectionId||d.connectionId,fields:{matchers:parsed,createdBy:d.fields.createdBy,comment:d.fields.comment,startsAt:new Date(String(d.fields.startsAt)).toISOString(),endsAt:new Date(String(d.fields.endsAt)).toISOString()}};

      }

      if(d.type==='expire')body={...body,action:'silence.expire',id:d.id};

      if(d.type==='alertIncident')body={...body,action:'incident.fromAlert',connectionId:d.fields.connectionId,alertConnectionId:d.item?.connection_id,alertId:d.item?.external_id};

      if(d.type==='query')body={...body,action:'monitor.query',connectionId:d.fields.connectionId,query:d.fields.query};

      if(d.type==='reconcile')body={...body,action:'operation.reconcile',operationId:d.id,taskId:d.fields.taskId};

      if(d.type==='comment')body={...body,action:'resource.save',kind:'incidents',id:d.id,fields:{...d.item?.data,work_notes:d.fields.work_notes,comments:d.fields.comments}};

      const result=await request(body);await refresh(userId);closeDialog();

      if(d.type==='run')setTaskWindow({connectionId:d.connectionId!,id:String(result.id),title:text(d.item?.data.name)});

      if(d.type==='query')setQueryResult(result);

      if(d.type==='alertIncident')navigate('incidents',String(result.id),String(d.fields.connectionId));

      if(d.type==='delete')navigate(d.kind!);

      if(d.type==='deleteConnection')setNotice('Integration permanently deleted.');

      if(d.type==='connection')setNotice('Integration saved. Use Test & sync to verify access and load its records.');

      if(d.type==='comment')await loadJournal(d.connectionId!,d.id!);

    }catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}

  }

  function silence(item?:RecordItem){const now=new Date(),end=new Date(Date.now()+3600000);const local=(v:Date)=>new Date(v.getTime()-v.getTimezoneOffset()*60000).toISOString().slice(0,16);open('silence','New silence',{connectionId:item?.connection_id||connectionsOf('alertmanager')[0]?.id||'',matchers:JSON.stringify(item?Object.entries(object(item.data.labels)).map(([name,value])=>({name,value,isRegex:false,isEqual:true})):[],null,2),createdBy:userName,comment:'',startsAt:local(now),endsAt:local(end)},{connectionId:item?.connection_id});}

  async function loadJournal(connectionId:string,id:string){setJournalError('');try{const result=await request({action:'incident.journal',connectionId,id});setJournal(array(result.entries));}catch(e){setJournalError((e as Error).message);}}

  useEffect(()=>{if(view!=='incidents'||!selectedId||!selectedConnection)return;let disposed=false;void request({action:'incident.journal',connectionId:selectedConnection,id:selectedId}).then(r=>{if(!disposed){setJournal(array(r.entries));setJournalError('');}}).catch(e=>{if(!disposed)setJournalError(e.message);});return()=>{disposed=true;};},[view,selectedId,selectedConnection]);

  function addMatcher(raw:string){if(!/^\s*[a-zA-Z_][\w]*\s*!?=\s*"[^"\n]*"\s*$/.test(raw)){setError('Use a label matcher such as severity="critical" or team!="platform".');return;}setMatchers(prev=>[...new Set([...prev,raw.trim()])]);setMatcher('');setError('');}

  const alerts=list('alerts').filter(r=>{

    const a=r.data,ls=object(a.labels);if(!showInactive&&['inactive','resolved'].includes(text(a.state)))return false;

    if(!showSilenced&&Array.isArray(a.silencedBy)&&a.silencedBy.length)return false;

    if(!showInhibited&&Array.isArray(a.inhibitedBy)&&a.inhibitedBy.length)return false;

    if(receiver&&text(a.receiver)!==receiver)return false;

    if(search&&!JSON.stringify(a).toLowerCase().includes(search.toLowerCase()))return false;

    return matchers.every(m=>{const parsed=m.match(/^\s*([\w]+)\s*(!?=)\s*"([^"\n]*)"\s*$/);return !parsed||(parsed[2]==='!='?text(ls[parsed[1]])!==parsed[3]:text(ls[parsed[1]])===parsed[3]);});

  });

  const groups=new Map<string,RecordItem[]>();for(const a of alerts){const group=groupBy==='none'?'All alerts':text(object(a.data.labels)[groupBy])||'Not grouped';groups.set(group,[...(groups.get(group)||[]),a]);}

  const template=selected?.kind==='templates'?selected:null;

  const incident=selected?.kind==='incidents'?selected:null;

  const filtered=(kind:string)=>list(kind).filter(r=>!search||JSON.stringify(r.data).toLowerCase().includes(search.toLowerCase()));

  const statusName=(v:unknown)=>({'1':'New','2':'In progress','3':'On hold','6':'Resolved','7':'Closed','8':'Canceled'}[text(v)]||text(v));

  const fieldLabel=(row:RecordItem,kind:string,id:unknown)=>text(records.find(r=>r.connection_id===row.connection_id&&r.kind===kind&&r.external_id===text(id))?.data.name)||text(id)||'—';

  const allTaskRows=filtered('tasks');

  const tableActions=(row:RecordItem)=><div className="flex justify-end gap-1"><button disabled={busy||!data?.security.allow_writes} className="ea-btn" aria-label={`Edit ${text(row.data.name)||row.external_id}`} onClick={()=>void edit(row)}><Pencil size={13}/></button><button disabled={busy||!data?.security.allow_deletes} className="ea-btn ea-danger" aria-label={`Delete ${text(row.data.name)||row.external_id}`} onClick={()=>open('delete','Delete source record',{}, {kind:row.kind,connectionId:row.connection_id,id:row.external_id,item:row})}><Trash2 size={13}/></button></div>;

  const taskTable=(rows:RecordItem[])=><div className="ea-table-wrap"><table className="ea-table"><thead><tr>{['Task ID','Version','Status','User','Start','Duration',''].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><button className="ea-link" onClick={()=>setTaskWindow({connectionId:r.connection_id,id:r.external_id,title:text(records.find(t=>t.kind==='templates'&&t.connection_id===r.connection_id&&t.external_id===text(r.data.template_id))?.data.name)||`Template ${text(r.data.template_id)}`})}>#{r.external_id}</button><p className="mt-1 text-[10px] text-slate-400">{text(r.data.message)}</p></td><td>{text(r.data.version)||'—'}</td><td><Badge value={r.data.status}/></td><td>{text(r.data.user_name||r.data.user_id)||'—'}</td><td>{date(r.data.start||r.data.created)}</td><td>{r.data.start&&r.data.end?`${Math.max(0,Math.round((Date.parse(text(r.data.end))-Date.parse(text(r.data.start)))/1000))}s`:terminalStates.includes(text(r.data.status))?'—':'In progress'}</td><td><button className="ea-btn" title="Open execution output" onClick={()=>setTaskWindow({connectionId:r.connection_id,id:r.external_id,title:text(records.find(t=>t.kind==='templates'&&t.connection_id===r.connection_id&&t.external_id===text(r.data.template_id))?.data.name)||'Task output'})}><TerminalSquare size={15}/></button></td></tr>)}</tbody></table>{!rows.length&&<Empty title="No task runs yet">Run a configured template to record its status and execution output here.</Empty>}</div>;

  const renderResource=()=>{

    const columns:Record<string,[string,string][]>= {inventory:[['name','Name'],['id','ID'],['type','Type'],['inventory','Inventory'],['ssh_key_id','Access key']],environment:[['name','Name'],['id','ID']],keys:[['name','Name'],['id','ID'],['type','Type']],repositories:[['name','Name'],['id','ID'],['git_url','Repository URL'],['git_branch','Branch'],['ssh_key_id','Access key']],schedules:[['name','Name'],['id','ID'],['template_id','Template'],['cron_format','Schedule'],['active','Enabled']],users:[['name','Name'],['id','User ID'],['username','Username'],['role','Role']]};

    const rows=filtered(view),cols=columns[view]||[];

    return <section className="ea-card"><div className="ea-toolbar"><h2>{labels[view]}</h2><span className="ea-badge">{rows.length}</span><button disabled={busy||!data?.security.allow_writes} className="ea-btn ea-primary ml-auto" onClick={()=>resourceNew(view)}><Plus size={14}/>{view==='users'?'Add existing user':`New ${view==='environment'?'variable group':view==='repositories'?'repository':view==='schedules'?'schedule':view==='keys'?'key':'inventory'}`}</button></div><div className="ea-table-wrap"><table className="ea-table"><thead><tr>{cols.map(([key,title])=><th key={key}>{title}</th>)}<th>Integration</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id}>{cols.map(([key])=><td key={key}>{key==='name'?<button className="ea-link" onClick={()=>void edit(r)}>{text(r.data[key])||`#${r.external_id}`}</button>:key==='active'?<Badge value={r.data[key]?'Active':'Paused'}/>:text(r.data[key])||'—'}</td>)}<td className="text-slate-400">{source(r.connection_id)?.name}</td><td>{tableActions(r)}</td></tr>)}</tbody></table></div>{!rows.length&&<Empty title={`No ${labels[view].toLowerCase()} found`}>Connect an automation project to load its existing records, or create a record in a connected project.{search?' Try a different search.':''}</Empty>}</section>;

  };



  return <div className="ea"><header className="ea-header"><button className="ea-btn ea-mobile" aria-label="Toggle navigation" onClick={()=>setMobile(!mobile)}><Menu size={18}/></button><WorkspaceLink href="/service-review-center" className="flex items-center gap-3" destination="Review Center"><span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><Zap size={19}/></span><div><strong className="text-base tracking-tight">AIForce.Ops</strong><p className="text-[10px] text-slate-400">Service Review Center</p></div></WorkspaceLink><span className="ml-4 hidden border-l border-slate-200 pl-5 text-sm font-semibold text-indigo-600 sm:block">eAssist</span><div className="ml-auto flex items-center gap-4"><span className={`ea-badge ${streamState==='Live'?'ea-green':'ea-amber'}`}><span className={`size-1.5 rounded-full ${streamState==='Live'?'bg-indigo-500':'bg-amber-500'}`}/>{streamState}</span><WorkspaceUserMenu/></div></header><div className="ea-layout">{mobile&&<button className="ea-menu-backdrop" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}<aside className={`ea-sidebar ${mobile?'open':''}`}><p className="px-3 pb-3 text-[9px] font-semibold uppercase tracking-[.18em] text-slate-400">Operations workspace</p>{navigation.map(([id,title,Icon],i)=><div key={id}>{[3,9,14].includes(i)&&<div className="mx-3 my-4 border-t border-slate-100"/>}<button aria-current={view===id?'page':undefined} className={`ea-nav ${view===id?'active':''}`} onClick={()=>navigate(id)}><Icon size={17}/>{title}{id==='alerts'&&data&&<span className="ml-auto rounded-md bg-slate-100 px-1.5 text-[10px]">{records.filter(r=>r.kind==='alerts'&&!['resolved','inactive'].includes(text(r.data.state))).length}</span>}</button></div>)}<WorkspaceLink href="/service-review-center" className="ea-nav mt-6" destination="Review Center"><ArrowLeft size={15}/>Review Center</WorkspaceLink></aside><main className="ea-main"><div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.17em] text-slate-400"><span>eAssist</span><ChevronRight size={11}/><span>{labels[view]}</span></div><h1>{template?text(template.data.name):incident?`Incident ${text(incident.data.number)}`:labels[view]}</h1><p className="ea-subtitle">{descriptions[view]||`Manage ${labels[view].toLowerCase()} in your connected automation project.`}</p></div><div className="flex gap-2">{!['integrations','security','settings','help','status'].includes(view)&&<select className="ea-input w-auto max-w-48" aria-label="Filter integration" value={integrationFilter} onChange={e=>setIntegrationFilter(e.target.value)}><option value="">All integrations</option>{connections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}<button className="ea-btn" disabled={busy} title="Refresh saved state" onClick={()=>void refresh(userId).catch(e=>setError(e.message))}><RefreshCw size={14}/>Refresh</button></div></div>{error&&<div role="alert" className="ea-error flex items-start gap-3"><span className="flex-1">{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}{notice&&<div className="ea-notice mb-4 flex gap-3"><span className="flex-1">{notice}</span><button aria-label="Dismiss notice" onClick={()=>setNotice('')}><X size={15}/></button></div>}

    {!data?<section className="ea-card p-4" aria-label="Loading saved workspace"><div className="ea-skeleton"/><div className="ea-skeleton"/><div className="ea-skeleton"/></section>:<>

    {connections.some(c=>c.enabled&&c.state==='error')&&!['integrations','status','settings'].includes(view)&&<div className="ea-notice mb-5">Some sources could not be synchronized. Previously saved records remain visible. <button className="ea-link" onClick={()=>navigate('status')}>View connection status</button></div>}

    {!['integrations','security','settings','help','status','dashboard','activity'].includes(view)&&!selectedId&&<label className="mb-4 flex max-w-sm items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search size={14} className="text-slate-400"/><input className="h-10 w-full bg-transparent text-xs outline-none" placeholder={`Search ${labels[view].toLowerCase()}`} aria-label={`Search ${labels[view]}`} value={search} onChange={e=>setSearch(e.target.value)}/></label>}

    {view==='alerts'&&<><section className="ea-card mb-5"><div className="ea-toolbar"><Filter size={15} className="text-indigo-500"/><h2>Filter & group</h2><label className="ml-auto flex items-center gap-2 text-xs text-slate-500">Receiver<select className="ea-input w-auto" value={receiver} onChange={e=>setReceiver(e.target.value)}><option value="">All</option>{[...new Set(list('alerts').map(a=>text(a.data.receiver)).filter(Boolean))].map(v=><option key={v}>{v}</option>)}</select></label>{[['Silenced',showSilenced,setShowSilenced],['Inhibited',showInhibited,setShowInhibited],['Inactive / resolved',showInactive,setShowInactive]].map(([label,checked,set])=><label key={String(label)} className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={checked as boolean} onChange={e=>(set as (v:boolean)=>void)(e.target.checked)}/>{label as string}</label>)}</div><div className="p-5"><div className="flex flex-wrap gap-2"><input aria-label="Label matcher" className="ea-input flex-1" placeholder={'Label matcher, e.g. env="production"'} value={matcher} onChange={e=>setMatcher(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addMatcher(matcher);}}/><button className="ea-btn ea-primary" aria-label="Add matcher" onClick={()=>addMatcher(matcher)}><Plus size={15}/></button><button className="ea-btn" onClick={()=>silence()} disabled={!connectionsOf('alertmanager').length||!data.security.allow_writes}><BellOff size={14}/>New silence</button></div><div className="mt-3 flex flex-wrap gap-2">{matchers.map(m=><button key={m} className="ea-chip" onClick={()=>setMatchers(matchers.filter(x=>x!==m))}>{m}<X size={12}/></button>)}</div><div className="mt-3 flex items-center gap-3 text-xs text-slate-400">Group by<select aria-label="Group alerts by" value={groupBy} onChange={e=>setGroupBy(e.target.value)} className="ea-input w-auto"><option value="severity">Severity</option><option value="alertname">Alert name</option><option value="service">Service</option><option value="team">Team</option><option value="none">No grouping</option></select><span className="ml-auto">{alerts.length} alerts</span></div></div></section><div className="mb-3 flex justify-between"><button className="ea-link text-xs" onClick={()=>setCollapsed(collapsed.size?new Set():new Set(groups.keys()))}>{collapsed.size?'Expand all groups':'Collapse all groups'}</button><button className="ea-link text-xs" disabled={!connectionsOf('prometheus').length} onClick={()=>open('query','Query live monitoring',{connectionId:connectionsOf('prometheus')[0]?.id,query:''})}>Query monitoring <ArrowUpRight size={13} className="inline"/></button></div>{[...groups].map(([group,items])=><section className="ea-card mb-4" key={group}><button className="ea-toolbar w-full text-left" onClick={()=>setCollapsed(prev=>{const next=new Set(prev);if(next.has(group))next.delete(group);else next.add(group);return next;})}>{collapsed.has(group)?<ChevronRight size={15}/>:<ChevronDown size={15}/>}<Badge value={group}/><span className="text-xs text-slate-400">{items.length} {items.length===1?'alert':'alerts'}</span></button>{!collapsed.has(group)&&items.map(a=><article key={a.id} className="ea-alert"><div className="flex flex-wrap items-center gap-4"><strong className="mr-auto text-sm">{text(object(a.data.labels).alertname)||'Unnamed alert'}</strong><Badge value={a.data.state}/><span className="text-[10px] text-slate-400">{date(a.data.startsAt)}</span></div><div className="my-3 flex flex-wrap gap-1.5">{Object.entries(object(a.data.labels)).map(([key,value])=><button key={key} title="Filter by this label" className="ea-chip" onClick={()=>addMatcher(`${key}="${text(value)}"`)}>{key}=<strong className="font-normal text-slate-600">{text(value)}</strong><Plus size={10}/></button>)}</div><div className="flex flex-wrap items-center gap-4 text-xs"><button className="ea-link" onClick={()=>setInfo(prev=>{const next=new Set(prev);if(next.has(a.id))next.delete(a.id);else next.add(a.id);return next;})}><Info size={13} className="mr-1 inline"/>Info</button>{safeHref(a.data.generatorURL)&&<a className="ea-link" href={safeHref(a.data.generatorURL)} target="_blank" rel="noreferrer"><ExternalLink size={12} className="mr-1 inline"/>Source</a>}<button className="ea-link" disabled={!data.security.allow_writes} onClick={()=>silence(a)}><BellOff size={12} className="mr-1 inline"/>Silence</button><button className="ea-link" onClick={()=>void navigator.clipboard.writeText(`${window.location.origin}/service-review-center/eassist?view=alerts&id=${a.external_id}&connection=${a.connection_id}`).then(()=>setNotice('Alert link copied.')).catch(()=>setError('Clipboard is unavailable.'))}><Link2 size={12} className="mr-1 inline"/>Link</button><button className="ea-link" disabled={!data.security.allow_writes||!connectionsOf('servicenow').length} onClick={()=>open('alertIncident','Create or find linked incident',{connectionId:connectionsOf('servicenow')[0]?.id},{item:a})}>Create incident <ArrowUpRight size={12} className="inline"/></button><span className="ml-auto text-[10px] text-slate-400">{source(a.connection_id)?.name}</span></div>{(info.has(a.id)||selectedId===a.external_id&&selectedConnection===a.connection_id)&&<div className="mt-4 rounded-lg bg-slate-50 p-4 text-xs leading-7">{Object.entries(object(a.data.annotations)).map(([key,value])=><p key={key}><strong>{key}: </strong>{text(value)}</p>)}<p className="text-slate-400">Fingerprint: {a.external_id} · Last changed {date(a.updated_at)}</p>{Boolean(a.data.endsAt)&&<p>Ends: {date(a.data.endsAt)}</p>}</div>}</article>)}</section>)}{!groups.size&&<section className="ea-card"><Empty title={connectionsOf('alertmanager').length?'No matching alerts':'Connect your alert source'} action={!connectionsOf('alertmanager').length?connectAction:undefined}>{connectionsOf('alertmanager').length?'Incoming alerts will appear here automatically. Check the filters and connection status if expected alerts are missing.':'Add an Alertmanager integration and configure its webhook for immediate alert delivery.'}</Empty></section>}</>}

    {view==='silences'&&<section className="ea-card"><div className="ea-toolbar"><h2>Silences</h2><button className="ea-btn ea-primary ml-auto" disabled={!connectionsOf('alertmanager').length||!data.security.allow_writes} onClick={()=>silence()}><Plus size={14}/>New silence</button></div><div className="ea-table-wrap"><table className="ea-table"><thead><tr>{['Matchers','Status','Starts','Ends','Author','Comment',''].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{filtered('silences').map(s=><tr key={s.id}><td>{array(s.data.matchers).map((m,i)=><span key={i} className="ea-chip mr-1">{text(m.name)}{m.isEqual===false?'!=':'='}{text(m.value)}</span>)}</td><td><Badge value={object(s.data.status).state}/></td><td>{date(s.data.startsAt)}</td><td>{date(s.data.endsAt)}</td><td>{text(s.data.createdBy)}</td><td>{text(s.data.comment)}</td><td><button className="ea-btn" disabled={!data.security.allow_writes||object(s.data.status).state==='expired'} onClick={()=>open('expire','Expire this silence?',{}, {connectionId:s.connection_id,id:s.external_id})}>Expire</button></td></tr>)}</tbody></table></div>{!filtered('silences').length&&<Empty title="No silences found">Silences created here are saved in Alertmanager and will also appear in its own interface.</Empty>}</section>}

    {view==='templates'&&!template&&<section className="ea-card"><div className="ea-toolbar"><h2>Task Templates</h2><span className="ea-badge">{list('templates').length}</span><button className="ea-btn ml-auto" disabled={!data.security.allow_writes} onClick={()=>resourceNew('views')}><Pencil size={13}/>Categories</button><button className="ea-btn ea-primary" disabled={!data.security.allow_writes} onClick={()=>resourceNew('templates')}><Plus size={14}/>New template</button></div><div className="ea-tabs"><button className={`ea-tab ${!category?'selected':''}`} onClick={()=>setCategory('')}>ALL</button>{list('views').map(v=><button key={v.id} className={`ea-tab ${category===v.id?'selected':''}`} onClick={()=>setCategory(v.id)}>{text(v.data.title)}</button>)}</div><div className="ea-table-wrap"><table className="ea-table"><thead><tr>{['Name','','Version','Status','Last task','Playbook','Inventory',''].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{filtered('templates').filter(t=>!category||list('views').some(v=>v.id===category&&v.connection_id===t.connection_id&&v.external_id===text(t.data.view_id))).map(t=>{const last=records.filter(r=>r.kind==='tasks'&&r.connection_id===t.connection_id&&text(r.data.template_id)===t.external_id).sort((a,b)=>Number(b.external_id)-Number(a.external_id))[0];return <tr key={t.id}><td><button className="ea-link" onClick={()=>navigate('templates',t.external_id,t.connection_id)}>{text(t.data.name)}</button><p className="mt-1 text-[10px] text-slate-400">{source(t.connection_id)?.name}</p></td><td><button aria-label={`Run ${text(t.data.name)}`} className="ea-btn" disabled={busy||!data.security.allow_runs} onClick={()=>run(t)}><Play size={13} fill="currentColor"/></button></td><td>{text(last?.data.version||t.data.start_version)||'—'}</td><td><Badge value={last?.data.status}/></td><td>{last?<button className="ea-link" onClick={()=>setTaskWindow({connectionId:t.connection_id,id:last.external_id,title:text(t.data.name)})}>#{last.external_id}</button>:'—'}</td><td>{text(t.data.playbook)}</td><td>{fieldLabel(t,'inventory',t.data.inventory_id)}</td><td>{tableActions(t)}</td></tr>;})}</tbody></table></div>{!filtered('templates').length&&<Empty title="No task templates yet" action={!connectionsOf('semaphore').length?connectAction:undefined}>Connect your automation project to load its templates. The run button will launch the actual template and open its execution terminal.</Empty>}</section>}

    {template&&<><button className="ea-link mb-4 inline-flex items-center gap-2 text-xs" onClick={()=>navigate('templates')}><ArrowLeft size={13}/>Task Templates</button><section className="ea-card"><div className="ea-toolbar"><Code2 size={17}/><h2>{text(template.data.name)}</h2><div className="ml-auto flex gap-2"><button className="ea-btn ea-primary" disabled={busy||!data.security.allow_runs} onClick={()=>run(template)}><Play size={13}/>Run</button><button className="ea-btn" aria-label="Duplicate template" disabled={busy||!data.security.allow_writes} onClick={()=>void edit(template,true)}><Copy size={14}/></button>{tableActions(template)}</div></div><div className="ea-tabs">{['tasks','details'].map(t=><button key={t} className={`ea-tab ${detailTab===t?'selected':''}`} onClick={()=>setDetailTab(t)}>{t.toUpperCase()}</button>)}</div>{detailTab==='tasks'?taskTable(allTaskRows.filter(r=>r.connection_id===template.connection_id&&text(r.data.template_id)===template.external_id)):<dl className="grid gap-5 p-6 sm:grid-cols-2">{resourceFields.templates.map(f=><div key={f.key}><dt className="text-xs text-slate-400">{f.label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm">{text(template.data[f.key])||'—'}</dd></div>)}</dl>}</section></>}

    {view==='incidents'&&!incident&&<section className="ea-card"><div className="ea-toolbar"><h2>Incidents</h2><span className="ea-badge">{filtered('incidents').length}</span><button className="ea-btn ea-primary ml-auto" disabled={!data.security.allow_writes} onClick={()=>resourceNew('incidents')}><Plus size={14}/>New incident</button></div><div className="ea-table-wrap"><table className="ea-table"><thead><tr>{['Number','Opened','Short description','State','Priority','Integration'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered('incidents').map(i=><tr key={i.id}><td><button className="ea-link" onClick={()=>navigate('incidents',i.external_id,i.connection_id)}>{text(i.data.number)||i.external_id}</button></td><td>{date(i.data.opened_at)}</td><td>{text(i.data.short_description)}</td><td><Badge value={statusName(i.data.state)}/></td><td>{text(i.data.priority)||'—'}</td><td className="text-slate-400">{source(i.connection_id)?.name}</td></tr>)}</tbody></table></div>{!filtered('incidents').length&&<Empty title={connectionsOf('servicenow').length?'No incidents found':'ServiceNow is not connected'} action={!connectionsOf('servicenow').length?<button className="ea-btn ea-primary" onClick={()=>navigate('integrations')}><Plus size={14}/>Connect ServiceNow</button>:undefined}>{connectionsOf('servicenow').length?'Your connected ServiceNow incidents will appear here. Alerts stay on the Alerts page until you create an incident from one.':'This page shows incidents from ServiceNow. Alerts do not automatically become incidents. Connect ServiceNow to load your incidents or create one from an alert.'}</Empty>}</section>}

    {incident&&<><button className="ea-link mb-4 inline-flex items-center gap-2 text-xs" onClick={()=>navigate('incidents')}><ArrowLeft size={13}/>Incidents</button><section className="ea-card"><div className="ea-toolbar"><h2>{text(incident.data.number)}</h2><Badge value={statusName(incident.data.state)}/><div className="ml-auto flex flex-wrap gap-2"><button className="ea-btn" disabled={busy||!data.security.allow_writes} onClick={()=>open('comment','Add incident activity',{work_notes:'',comments:''},{id:incident.external_id,connectionId:incident.connection_id,item:incident})}>Discuss / work notes</button><button className="ea-btn" disabled={busy||!data.security.allow_writes} onClick={()=>void edit(incident)}>Update</button><button className="ea-btn ea-primary" disabled={!data.security.allow_writes} onClick={()=>open('resource','Resolve incident',{...incident.data,state:'6'},{kind:'incidents',id:incident.external_id,connectionId:incident.connection_id})}>Resolve</button>{tableActions(incident)}</div></div><div className="grid gap-x-12 gap-y-5 p-6 sm:grid-cols-2">{[['number','Number'],['opened_at','Opened'],['caller_id','Caller'],['closed_at','Closed'],['assignment_group','Assignment group'],['urgency','Urgency'],['short_description','Short description'],['state','State'],['description','Description'],['close_notes','Resolution notes']].map(([key,title])=><div key={key}><p className="text-xs text-slate-400">{title}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{key==='state'?statusName(incident.data[key]):text(incident.data[key])||'—'}</p></div>)}</div><div className="ea-toolbar"><h2>Activities</h2><button className="ea-btn ml-auto" onClick={()=>void loadJournal(incident.connection_id,incident.external_id)}><RefreshCw size={13}/>Refresh activity</button></div><div className="p-5">{journalError&&<div className="ea-error">{journalError}</div>}{journal===null&&!journalError?<p className="text-xs text-slate-400">Loading incident activity…</p>:journal?.length?journal.map((item,i)=><article className="ea-activity" key={text(item.sys_id)||i}><div className="flex justify-between gap-4 text-xs"><strong>{text(item.sys_created_by)}</strong><span className="text-slate-400">{text(item.element)} · {date(item.sys_created_on)}</span></div><p className="mt-2 whitespace-pre-wrap text-xs">{text(item.value)}</p></article>):<p className="text-xs text-slate-400">No journal entries returned by the source system.</p>}</div></section></>}

    {['schedules','inventory','environment','keys','repositories','users'].includes(view)&&renderResource()}

    {view==='dashboard'&&<><Monitoring records={visibleRecords}/><div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Active alerts',records.filter(r=>r.kind==='alerts'&&!['resolved','inactive'].includes(text(r.data.state))).length],['Open incidents',records.filter(r=>r.kind==='incidents'&&!['6','7','8'].includes(text(r.data.state))).length],['Running tasks',records.filter(r=>r.kind==='tasks'&&!terminalStates.includes(text(r.data.status))).length],['Connected sources',connections.filter(c=>c.enabled&&c.state==='connected').length]].map(([label,value])=><div className="ea-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><section className="ea-card"><div className="ea-toolbar"><h2>Recent task executions</h2><button className="ea-link ml-auto" onClick={()=>navigate('templates')}>View templates <ArrowUpRight size={12} className="inline"/></button></div>{taskTable(allTaskRows.slice(0,20))}</section></>}

    {['integrations','status','settings'].includes(view)&&<><div className="mb-5 flex gap-3"><button className="ea-btn ea-primary" onClick={()=>open('connection','Add integration',{name:'',kind:'alertmanager',base_url:'',auth_type:'bearer',username:'',secret:'',enabled:true,project_id:''})}><Plus size={14}/>Add integration</button><button className="ea-btn" onClick={()=>navigate('security')}><ShieldCheck size={14}/>Security configurations</button></div><div className="grid gap-4 lg:grid-cols-2">{connections.map(c=><section className="ea-card p-5" key={c.id}><div className="flex items-start gap-3"><span className="rounded-xl bg-indigo-50 p-3 text-indigo-500"><Network size={20}/></span><div className="min-w-0 flex-1"><h2>{c.name}</h2><p className="ea-subtitle">{c.kind==='semaphore'?'AO Automation · Semaphore':c.kind==='servicenow'?'ServiceNow':c.kind==='alertmanager'?'Alertmanager':'Prometheus'}</p></div><Badge value={!c.enabled?'Disabled':c.state}/></div><p className="my-4 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">{c.base_url}{c.project_id?` · project ${c.project_id}`:''}</p><p className="text-[11px] text-slate-400">Last checked {date(c.checked_at)} · {c.has_secret?'Credential saved':'No stored credential'}</p>{c.last_error&&<p className="ea-error mt-3">{c.last_error}</p>}<div className="mt-5 flex flex-wrap gap-2"><button disabled={busy||!c.enabled} className="ea-btn ea-primary" onClick={()=>void doAction({action:'connection.test',connectionId:c.id})}><RefreshCw size={13}/>Test & sync</button><button className="ea-btn" onClick={()=>open('connection','Edit integration',{...c,secret:''},{id:c.id})}><Pencil size={13}/>Configure</button>{c.kind==='alertmanager'&&<button className="ea-btn" disabled={busy} onClick={()=>void doAction({action:'connection.token',connectionId:c.id}).then(result=>{if(result?.token)setWebhook({connectionId:c.id,token:String(result.token)});})}><KeyRound size={13}/>{c.has_webhook?'Rotate webhook token':'Set up webhook'}</button>}<button disabled={busy} className="ea-btn ea-danger" aria-label={`Delete integration ${c.name}`} onClick={()=>open('deleteConnection','Delete integration permanently',{name:c.name},{connectionId:c.id})}><Trash2 size={13}/>Delete</button></div>{view==='status'&&records.filter(r=>r.kind==='status'&&r.connection_id===c.id).map(r=><pre key={r.id} className="mt-4 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-[10px]">{JSON.stringify(r.data,null,2)}</pre>)}</section>)}</div>{!connections.length&&<section className="ea-card"><Empty title="Connect your operational systems">Add Alertmanager for alerts and silences, ServiceNow for incidents, Semaphore for task execution, and Prometheus for live monitoring queries. Your existing records are imported from those systems.</Empty></section>}<section className="ea-notice mt-5"><strong>Live delivery:</strong> Alertmanager webhooks persist incoming alerts immediately; the open workspace receives change events automatically. Source synchronization recovers updates missed by webhooks. Run the integration worker to keep synchronization active when no one has the workspace open.</section></>}

    {view==='security'&&<Security key={JSON.stringify(data.security)} policy={data.security} busy={busy} save={async policy=>{await doAction({action:'security.save',policy});}}/>}

    {view==='activity'&&<><section className="ea-card mb-5"><div className="ea-toolbar"><h2>Pending and uncertain operations</h2></div>{data.operations.length?data.operations.map(o=><div className="ea-alert" key={o.id}><div className="flex flex-wrap items-center gap-3"><strong>{o.action}</strong><span className="text-xs text-slate-400">{o.target}</span><Badge value={o.state}/>{o.action==='task.run'&&<button className="ea-btn ml-auto" onClick={()=>open('reconcile','Reconcile task launch',{taskId:''},{id:o.id,connectionId:o.connection_id})}>Link source task</button>}</div><p className="ea-subtitle">{text(object(o.result).error)}</p></div>):<p className="p-5 text-xs text-slate-400">No pending or uncertain operations.</p>}</section><section className="ea-card"><div className="ea-toolbar"><h2>Audit activity</h2><span className="text-xs text-slate-400">Most recent {data.limits.activity} entries</span></div><div className="p-5">{data.activity.map(a=><article key={a.id} className="ea-activity"><div className="flex justify-between gap-4"><strong className="text-xs">{a.action}</strong><span className="text-[10px] text-slate-400">{date(a.created_at)}</span></div><p className="text-xs text-slate-500">{a.target}</p><p className="text-xs text-slate-400">{a.detail}</p></article>)}{!data.activity.length&&<Empty title="No activity yet">Configuration changes and operational actions will be recorded here.</Empty>}</div></section></>}

    {view==='help'&&<section className="ea-card p-7"><h2>From signal to verified resolution</h2><ol className="mt-5 list-decimal space-y-5 pl-5 text-sm leading-7 text-slate-600"><li>Configure Alertmanager and its authenticated webhook under Integrations. Incoming alerts appear on the Alerts page with labels, annotations, and source links.</li><li>Filter and group alerts. Create a time-bound silence when appropriate, or create a linked ServiceNow incident. Repeated incident creation for the same alert returns its existing incident.</li><li>Open Task Templates, choose an appropriate playbook, and press Run. Confirm the launch. The terminal shows actual runner output and task status; closing it does not stop the task.</li><li>Use a Prometheus query or the source system to verify the outcome independently. A successful task status alone is not evidence that the operational incident is resolved.</li><li>Update the incident with work notes and resolution evidence, then resolve it using the source system’s required resolution code.</li></ol><p className="ea-subtitle mt-6">Schedules, inventory, variable groups, keys, repositories, and team membership are managed in the connected automation project. Its permissions and validation rules remain authoritative. A terminal is an execution-log viewer, matching the supplied reference; it does not expose a shell on this web server.</p><div className="mt-5 flex flex-wrap gap-4"><a className="ea-link" href="https://prometheus.io/docs/alerting/latest/configuration/" target="_blank" rel="noreferrer">Alertmanager documentation ↗</a><a className="ea-link" href="https://semaphoreui.com/docs/reference/api" target="_blank" rel="noreferrer">Automation API documentation ↗</a></div></section>}

    {selectedId&&['templates','incidents'].includes(view)&&!selected&&<div className="ea-notice mt-5">This record is not in the current saved collection. Check the source integration and refresh its records.</div>}

    <footer className="mt-8 flex flex-wrap justify-between gap-2 text-[10px] text-slate-400"><span>Alpha · eAssist operational workspace</span><span>{records.length} saved records · {connections.filter(c=>c.state==='connected'&&c.enabled).length} connected sources</span></footer>

    </>}

    </main></div>

    {dialog&&<Modal title={dialog.title} close={closeDialog} footer={<><button className="ea-btn" disabled={busy} onClick={closeDialog}>Cancel</button><button className={`ea-btn ${['delete','deleteConnection'].includes(dialog.type)?'ea-danger':'ea-primary'}`} disabled={busy} onClick={()=>void submit()}>{busy?<Loader2 size={14} className="animate-spin"/>:dialog.type==='run'?<Play size={13}/>:<Check size={14}/>} {busy?'Working…':dialog.type==='run'?'Confirm & run':dialog.type==='delete'?'Delete from source':dialog.type==='deleteConnection'?'Delete permanently':dialog.type==='query'?'Run query':'Save / apply'}</button></>}>{dialogError&&<div role="alert" className="ea-error">{dialogError}</div>}

      {dialog.type==='connection'&&<div className="ea-form">{([{key:'name',label:'Connection name',required:true},{key:'kind',label:'System',options:['alertmanager','servicenow','semaphore','prometheus']},{key:'base_url',label:'Base URL',required:true,hint:'Origin must be allowed by the server configuration.'},...(dialog.fields.kind==='semaphore'?[{key:'project_id',label:'Automation project ID',type:'number'}]:[]),{key:'auth_type',label:'Authentication',options:['bearer','basic','none']},...(dialog.fields.auth_type==='basic'?[{key:'username',label:'Username'}]:[]),...(dialog.fields.auth_type!=='none'?[{key:'secret',label:dialog.id?'Replace credential (leave blank to keep)':'API token / password',type:'password'}]:[]),{key:'enabled',label:'Enabled',type:'checkbox'}] as Field[]).map(f=><FieldInput key={f.key} field={f} value={dialog.fields[f.key]} onChange={v=>setDialog({...dialog,fields:{...dialog.fields,[f.key]:v}})}/>)}</div>}

      {dialog.type==='resource'&&<><label className="ea-label mb-5">Integration<select disabled={!!dialog.id} className="ea-input" value={dialog.connectionId} onChange={e=>setDialog({...dialog,connectionId:e.target.value})}>{connectionsOf(dialog.kind==='incidents'?'servicenow':'semaphore').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="ea-form">{(resourceFields[dialog.kind!]||[]).map(f=><FieldInput key={f.key} field={f} value={dialog.fields[f.key]} onChange={v=>setDialog({...dialog,fields:{...dialog.fields,[f.key]:v}})}/>)}</div>{dialog.kind==='templates'&&<p className="ea-subtitle mt-5">Use the IDs shown in the Inventory, Repositories, and Variable Groups pages. The runner uses these source resources when executing the playbook.</p>}{dialog.kind==='incidents'&&<p className="ea-subtitle mt-4">States: 1 New, 2 In progress, 3 On hold, 6 Resolved, 7 Closed, 8 Canceled. Enter the resolution code configured by your ServiceNow instance.</p>}</>}

      {dialog.type==='run'&&<><div className="ea-notice mb-5">This launches <strong>{text(dialog.item?.data.name)}</strong> in <strong>{source(dialog.connectionId!)?.name}</strong>. The runner will execute its configured playbook against its inventory.</div><dl className="mb-5 grid grid-cols-2 gap-4 text-xs"><div><dt className="text-slate-400">Playbook</dt><dd className="mt-2">{text(dialog.item?.data.playbook)}</dd></div><div><dt className="text-slate-400">Inventory</dt><dd className="mt-2">{dialog.item&&fieldLabel(dialog.item,'inventory',dialog.item.data.inventory_id)}</dd></div></dl><FieldInput field={{key:'message',label:'Run comment',type:'textarea'}} value={dialog.fields.message} onChange={v=>setDialog({...dialog,fields:{message:v}})}/></>}

      {dialog.type==='silence'&&<div className="ea-form"><label className="ea-label ea-wide">Alertmanager<select className="ea-input" value={text(dialog.fields.connectionId)} onChange={e=>setDialog({...dialog,fields:{...dialog.fields,connectionId:e.target.value}})}>{connectionsOf('alertmanager').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{([{key:'matchers',label:'Label matchers (JSON array)',type:'textarea',hint:'Each matcher uses name, value, isRegex, and isEqual.'},{key:'createdBy',label:'Author',required:true},{key:'comment',label:'Reason',required:true},{key:'startsAt',label:'Starts',type:'datetime-local'},{key:'endsAt',label:'Ends',type:'datetime-local'}] as Field[]).map(f=><FieldInput key={f.key} field={f} value={dialog.fields[f.key]} onChange={v=>setDialog({...dialog,fields:{...dialog.fields,[f.key]:v}})}/>)}</div>}

      {dialog.type==='delete'&&<p className="text-sm leading-7">Delete <strong>{text(dialog.item?.data.name||dialog.item?.data.number)||dialog.id}</strong> from {source(dialog.connectionId!)?.name}? This changes the connected source system. Existing task execution is not stopped by deleting a template.</p>}

      {dialog.type==='deleteConnection'&&<p className="text-sm leading-7">Permanently delete <strong>{text(dialog.fields.name)}</strong>? Its saved credentials, webhook access, and locally synced records will be removed immediately. There is no recycle bin or restore option. Records in the connected system and running tasks are unchanged.</p>}

      {dialog.type==='expire'&&<p className="text-sm leading-7">Expire this silence in Alertmanager now? Matching alerts may resume notifying their configured receivers.</p>}

      {dialog.type==='alertIncident'&&<><p className="ea-subtitle mb-5">The alert’s labels and annotations will be included in the incident. An existing incident with this alert’s correlation ID will be reused.</p><label className="ea-label">ServiceNow integration<select className="ea-input" value={text(dialog.fields.connectionId)} onChange={e=>setDialog({...dialog,fields:{connectionId:e.target.value}})}>{connectionsOf('servicenow').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}

      {dialog.type==='query'&&<><label className="ea-label mb-5">Prometheus integration<select className="ea-input" value={text(dialog.fields.connectionId)} onChange={e=>setDialog({...dialog,fields:{...dialog.fields,connectionId:e.target.value}})}>{connectionsOf('prometheus').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><FieldInput field={{key:'query',label:'PromQL query',type:'textarea'}} value={dialog.fields.query} onChange={v=>setDialog({...dialog,fields:{...dialog.fields,query:v}})}/></>}

      {dialog.type==='reconcile'&&<><p className="ea-subtitle mb-5">Find the launched task in the source runner and enter its ID. eAssist checks that the task belongs to the intended template before linking the uncertain launch.</p><FieldInput field={{key:'taskId',label:'Source task ID',type:'number'}} value={dialog.fields.taskId} onChange={v=>setDialog({...dialog,fields:{taskId:v}})}/></>}

      {dialog.type==='comment'&&<div className="ea-form">{[{key:'work_notes',label:'Work notes',type:'textarea'},{key:'comments',label:'Customer-visible comments',type:'textarea'}].map(f=><FieldInput key={f.key} field={f as Field} value={dialog.fields[f.key]} onChange={v=>setDialog({...dialog,fields:{...dialog.fields,[f.key]:v}})}/>)}</div>}

    </Modal>}

    {webhook&&<Modal title="Alertmanager webhook" close={()=>setWebhook(null)}><p className="ea-notice mb-5">Copy this credential now. It is shown only once. Rotating it invalidates the previous token.</p><label className="ea-label">Webhook URL<input readOnly className="ea-input font-mono" value={`${typeof window==='undefined'?'':window.location.origin}/api/eassist/webhook?connection=${webhook.connectionId}`}/></label><label className="ea-label mt-4">Bearer token<input readOnly className="ea-input font-mono" value={webhook.token}/></label><p className="ea-subtitle mt-5">Configure an Alertmanager webhook receiver with this URL, send_resolved enabled, and HTTP authorization type Bearer using this token. Store the token securely in the source system.</p></Modal>}

    {queryResult&&<Modal title="Monitoring query result" close={()=>setQueryResult(null)}><p className="ea-subtitle mb-4">Live source response. Review its metric values and timestamps before using it as incident-resolution evidence.</p><pre className="overflow-auto rounded-xl bg-slate-950 p-5 text-xs text-indigo-200">{JSON.stringify(queryResult,null,2)}</pre></Modal>}

    {taskWindow&&<Terminal key={`${taskWindow.connectionId}:${taskWindow.id}`} connectionId={taskWindow.connectionId} taskId={taskWindow.id} title={taskWindow.title} onClose={()=>setTaskWindow(null)} onStop={async()=>{await perform({action:'task.stop',connectionId:taskWindow.connectionId,id:taskWindow.id});}}/>}

    </div>;

}

