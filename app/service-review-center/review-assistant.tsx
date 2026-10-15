"use client";
import {operationalTime} from '@/lib/service-review/operational-display';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Bell, History, MessageCircle, Plus, RefreshCw, Send, Sparkles, Square, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {cleanChatMarkdown} from '@/lib/chat-markdown';
import remarkGfm from 'remark-gfm';
import VulnerabilityReports from './vulnerability-reports';
import {AutomatedAlerts,MonitoringCard,ScannerIntegration} from './security-control';
import MarkdownEditor from './epace/markdown-editor';
import OperationsControl from './operations-control';
import {useGuidedScanner} from './guided-scanner';
import './epace/workspace.css';
import './review-assistant.css';

type Evidence={number:number;source:string;type:string;observedAt:string;stale:boolean;facts:Record<string,unknown>};
type Turn={id:string;question:string;answer:string;status:string;model:string;evidence:Evidence[];actions?:{kind:string;format?:string;scanId?:string;connector?:string;query?:string;autoOpen?:boolean}[];error?:string};
export default function ReviewAssistant() {
 const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const guided=useGuidedScanner();
 const bottom=useRef<HTMLDivElement>(null),panelTop=useRef<HTMLDivElement>(null);
 const [operationQuery,setOperationQuery]=useState(''),[panel,setPanel]=useState(''),[connector,setConnector]=useState('json'),[alertCount,setAlertCount]=useState(0),[downloadNotice,setDownloadNotice]=useState(''),[alertNotice,setAlertNotice]=useState('');const previousAlerts=useRef<string[]|null>(null);
 async function download(action:{format?:string;scanId?:string}){
  setDownloadNotice('Preparing file...');const path='/api/service-review-center/scans?id='+encodeURIComponent(action.scanId||'')+'&format='+action.format;
  const response=await fetch(path,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error((await response.json()).error);
  // Use the authenticated attachment URL: embedded browsers cannot always download blob URLs.
  const link=document.createElement('a');link.href=path;link.download='aiforce-security-'+(action.scanId||'').slice(0,8)+'.'+action.format;document.body.appendChild(link);link.click();link.remove();setDownloadNotice('Report download requested. Check your browser downloads.');
 }
 const [conversationId,setConversationId]=useState<string|null>(null),[conversations,setConversations]=useState<{id:string;title:string}[]>([]),[history,setHistory]=useState(false),[refreshKey,setRefreshKey]=useState(0);
 const loadAbort=useRef<AbortController|null>(null),sendAbort=useRef<AbortController|null>(null);
 const reload=useCallback(async(selected?:string|null)=>{
  loadAbort.current?.abort();const controller=new AbortController();loadAbort.current=controller;setLoading(true);setError('');
  try{const response=await fetch('/api/service-review-center/chat'+(selected===undefined?'':'?conversationId='+encodeURIComponent(selected||'legacy')),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted){setTurns(data.turns);setConversationId(data.conversationId);setConversations(data.conversations);}}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load the assistant.');}
  finally{if(!controller.signal.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();void fetch('/api/service-review-center/scans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ensure-continuous'}),signal:controller.signal}).then(async r=>{if(!r.ok)setError((await r.json()).error);}).catch(()=>{});const show=setTimeout(()=>{if(new URLSearchParams(window.location.search).get('assistant')==='security'){setOpen(true);void reload();}},0);let updating=false;const update=async()=>{if(updating||controller.signal.aborted||document.hidden)return;updating=true;try{const r=await fetch('/api/service-review-center/security-alerts',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(r.ok){const b=await r.json();const active=b.alerts.filter((a:{id:string;state:string})=>a.state==='active').map((a:{id:string})=>a.id);if(previousAlerts.current&&active.some((id:string)=>!previousAlerts.current?.includes(id)))setAlertNotice('New security evidence triggered an eAssist alert.');previousAlerts.current=active;setAlertCount(active.length);}}catch{}finally{updating=false;}};void update();const timer=setInterval(()=>void update(),5000);return()=>{controller.abort();clearInterval(timer);clearTimeout(show);};},[reload]);
 useEffect(()=>()=>{loadAbort.current?.abort();sendAbort.current?.abort();},[]);
 async function newChat(){
  if(busy||loading||guided.busy)return;guided.reset();setLoading(true);setError('');
  try{const response=await fetch('/api/service-review-center/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'new-chat',requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw new Error(data.error);setQuestion('');setTurns([]);setPanel('');setDownloadNotice('');setHistory(false);await reload(data.conversationId);}
  catch(e){setError(e instanceof Error?e.message:'Could not start a new chat.');setLoading(false);}
 }
 useEffect(()=>{if(panel)panelTop.current?.scrollIntoView({block:'start'});else bottom.current?.scrollIntoView({block:'end'});},[turns,busy,open,panel,guided.scrollKey]);
 async function send(event?:React.FormEvent) {
  event?.preventDefault();if(busy||loading||guided.busy||!question.trim())return;
  if(guided.active&&!guided.secure&&/^(?:what|why|how|show|check)\b.*(?:semaphore|workflow|health|website|status|alert)/i.test(question)){guided.reset();}
  else if(guided.active){const value=question;setQuestion('');if(/manual.*integrat|integrat.*manual|open.*interface/i.test(value)&&!guided.secure){guided.reset();setPanel('integration');}else guided.reply(value);return;}
  const q=question.trim(),id=crypto.randomUUID();setBusy(true);setError('');setQuestion('');
  setTurns(previous=>[...previous,{id,question:q,answer:'',status:'pending',model:'',evidence:[]}]);
  const controller=new AbortController();sendAbort.current=controller;
  try{
   const response=await fetch('/api/service-review-center/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,requestId:id,conversationId}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(90000)])});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'The assistant is unavailable.');
   setTurns(previous=>previous.map(t=>t.id===id?result:t));
   for(const action of result.actions||[]){if(action.kind==='download')await download(action);else if(action.kind==='guided-integration'){setPanel('');guided.start(action.connector);}else if(action.kind!=='integration'&&action.autoOpen!==false){if(action.connector)setConnector(action.connector);if(action.kind==='operations')setOperationQuery(action.query??q);setPanel(action.kind);}}
  }catch(e){const message=controller.signal.aborted?'Stopped waiting. The backend may finish this request; reload to check.':e instanceof Error?e.message:'The assistant is unavailable.';setError(message);setTurns(previous=>previous.map(t=>t.id===id?{...t,status:'failed',error:message}:t));}
  finally{sendAbort.current=null;setBusy(false);setRefreshKey(k=>k+1);}
 }
 return <Dialog.Root open={open} onOpenChange={next=>{setOpen(next);if(next&&!busy)void reload(conversationId||undefined);else if(!next)loadAbort.current?.abort();}}>
  <Dialog.Trigger aria-label="Open Review Center assistant" className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-2xl bg-[#6351e9] text-white shadow-lg shadow-indigo-900/20 transition hover:bg-[#5540d5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"><MessageCircle className="size-6"/>{alertCount>0&&<span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px]" aria-label={`${alertCount} active security alerts`}>{alertCount}</span>}</Dialog.Trigger>
  <Dialog.Portal>
   <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/20"/>
   <Dialog.Popup className="review-super-bot fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col border-l border-indigo-100 bg-[#f5f6fb] text-[#142b49] shadow-2xl outline-none">
    <header className="flex shrink-0 items-center gap-3 border-b border-indigo-100 bg-white px-5 py-4"><span className="rounded-xl bg-indigo-50 p-2 text-[#6351e9]"><Sparkles className="size-5"/></span><div className="min-w-0 flex-1"><Dialog.Title className="text-sm font-semibold">Super assistant</Dialog.Title><Dialog.Description className="mt-1 text-xs text-slate-400">Service health, workflows, recovery and security</Dialog.Description></div><button type="button" aria-label={`Show eAssist security alerts: ${alertCount} active`} onClick={()=>setPanel('alerts')} className="security-button"><Bell size={13}/>{alertCount} alerts</button><Dialog.Close aria-label="Close assistant" className="rounded-lg p-2 text-slate-500 hover:bg-indigo-50"><X className="size-5"/></Dialog.Close></header>
    <div className="review-bot-toolbar"><button type="button" onClick={()=>void newChat()} disabled={busy||loading||guided.busy}><Plus size={15}/>New chat</button><button type="button" onClick={()=>{guided.reset();setQuestion('');setRefreshKey(k=>k+1);void reload(conversationId);}} disabled={busy||loading||guided.busy} aria-label="Reload conversation"><RefreshCw size={15} className={loading?'animate-spin':''}/>Reload</button><button type="button" onClick={()=>setHistory(v=>!v)} disabled={busy||loading||guided.busy} aria-expanded={history}><History size={15}/>History</button></div>
    {history&&<nav className="review-bot-history" aria-label="Chat history">{conversations.map(c=><button key={c.id} type="button" aria-current={conversationId===c.id?'true':undefined} onClick={()=>{guided.reset();setQuestion('');setHistory(false);setPanel('');void reload(c.id);}}>{c.title}</button>)}<button type="button" onClick={()=>{guided.reset();setQuestion('');setHistory(false);setPanel('');void reload(null);}}>Earlier conversation</button></nav>}
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6" aria-live="polite">
     <div className="security-bot-alert-strip" role="status"><span>eAssist  /  {alertCount} active security alerts{alertNotice&&<small className="block mt-1">{alertNotice}</small>}</span><button onClick={()=>setPanel('alerts')}>View alerts</button></div>
     {loading&&<p className="text-xs text-slate-500" role="status">Loading your conversation…</p>}
     {!turns.length&&!loading&&<div className="flex min-h-full flex-col justify-center gap-3"><Sparkles className="mb-1 size-8 text-[#6351e9]"/><h2 className="text-xl font-semibold">Hi, how can I help?</h2><p className="mb-2 text-sm leading-6 text-slate-500">Check service health, diagnose workflows, recover connected sources and receive security reports here.</p>{['How is the entire website?','What happened to Semaphore?','Add scanner tools','Give me Excel'].map(q=><button key={q} onClick={()=>setQuestion(q)} className="rounded-xl border border-indigo-100 bg-white p-3 text-left text-xs leading-5 hover:border-indigo-300">{q}</button>)}</div>}
     <div className="space-y-5">{turns.map(turn=><div key={turn.id}>
      <div className="review-assistant-markdown review-user-message mb-3 ml-8 break-words rounded-2xl rounded-br-sm bg-[#eeebff] px-4 py-3 text-sm leading-6"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a:({children})=><span>{children}</span>}}>{cleanChatMarkdown(turn.question)}</ReactMarkdown></div>
      <article className="rounded-2xl border border-indigo-100 bg-white p-4">
       <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold tracking-widest text-[#6351e9]"><Sparkles className={`size-4 ${turn.status==='pending'?'animate-pulse motion-reduce:animate-none':''}`}/>WORKSPACE ASSISTANT</div>
       {turn.status==='pending'?<p className="text-xs text-slate-500" role="status">Checking your stored readings…</p>:turn.status==='failed'?<p className="text-xs leading-5 text-rose-600">{turn.error||'This request did not complete.'}</p>:<div className="review-assistant-markdown text-sm leading-6"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a:({children,href})=>href&&/^\/api\/service-review-center\/scans\?id=[0-9a-f-]{36}&format=(csv|xlsx)$/.test(href)?<a href={href} className="font-medium text-[#6351e9] underline">{children}</a>:<span className="text-[#6351e9]">{children}</span>}}>{turn.answer}</ReactMarkdown></div>}
       {turn.actions?.filter(a=>a.kind!=='download').map((a,i)=><button key={i} className="security-button mt-3" disabled={guided.busy} onClick={()=>{setQuestion('');if(a.connector)setConnector(a.connector);if(a.kind==='guided-integration'){setPanel('');guided.start(a.connector);}else{guided.reset();if(a.kind==='operations')setOperationQuery(a.query??turn.question);setPanel(a.kind);}}}>{a.kind==='guided-integration'?'Start guided setup':a.kind==='operations'?'View details':'Open '+(a.kind==='integration'?'integration interface':a.kind)}</button>)}
       {turn.evidence?.length>0&&<details className="mt-4 border-t border-indigo-50 pt-3 text-[11px] text-slate-500"><summary className="cursor-pointer">Evidence · {turn.evidence.length} records</summary><div className="mt-2 space-y-2">{turn.evidence.map(s=><div key={s.number} className="rounded-lg bg-slate-50 p-2"><strong>Evidence {s.number}: {s.source||'Connected source'}</strong><br/>{String(s.facts.device||s.facts.label||s.type||'Operational record')}<br/><span className={s.stale?'text-amber-700':'text-slate-400'}>{s.stale?'Last known · ':''}Recorded {operationalTime(s.observedAt)}</span></div>)}</div></details>}
      </article>
     </div>)}</div>{guided.view}{downloadNotice&&<p role="status" className="security-card mt-4">{downloadNotice}</p>}{panel&&<div ref={panelTop} className="mt-5"><div className="mb-2 flex items-center justify-between"><strong className="text-xs">Workspace interface</strong><button aria-label="Close workspace interface" onClick={()=>setPanel('')}><X size={16}/></button></div>{panel==='integration'?<ScannerIntegration key={connector} initialKind={connector}/>:panel==='alerts'?<AutomatedAlerts compact/>:panel==='operations'?<OperationsControl query={operationQuery}/>:panel==='findings'?<VulnerabilityReports chatMode/>:<MonitoringCard key={refreshKey}/>}</div>}<div ref={bottom}/>
    </div>
    <form onSubmit={send} className="shrink-0 border-t border-indigo-100 bg-white p-4">
     {error&&<p role="alert" className="mb-2 text-xs text-rose-600">{error}</p>}
     <div className="review-bot-composer">{guided.secure?<input type="password" aria-label="Secure scanner credential" autoComplete="new-password" className="w-full min-h-24 p-4 outline-none bg-transparent" placeholder="Enter credential securely…" maxLength={4000} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void send();}}}/>:guided.active?<textarea aria-label="Ask the Review Center assistant" className="w-full min-h-24 resize-none p-4 outline-none bg-transparent" placeholder="Reply to the setup question…" maxLength={4000} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}}}/>:<MarkdownEditor value={question} onChange={setQuestion} onSend={()=>void send()} maxLength={4000} ariaLabel="Ask the Review Center assistant" placeholder={guided.active?'Reply to the setup question…':'Ask about service health, workflows or reports…'}/>}{busy?<button type="button" aria-label="Stop waiting for answer" onClick={()=>sendAbort.current?.abort()} className="review-bot-send"><Square size={17}/></button>:<button type="submit" aria-label="Send assistant question" disabled={loading||guided.busy||!question.trim()} className="review-bot-send"><Send size={18}/></button>}</div>
     <p className="mt-2 text-center text-[10px] text-slate-400">Ctrl/Command + Enter to send / Enter for a new line / Review cited evidence</p>
    </form>
   </Dialog.Popup>
  </Dialog.Portal>
 </Dialog.Root>;
}
