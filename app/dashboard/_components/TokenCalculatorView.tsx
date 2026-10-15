"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {RefreshCw,LoaderCircle,Activity} from 'lucide-react';
import ThemedSelect from '@/components/themed-select';

type Count={input:string;model:string;outputBudget:number;inputTokens:number;checkedAt:string;billing:{chargeUsd:number|null;chargeInr:number|null;tickets:number|null;pricingVerifiedAt:string;multiplier:number;fx:{usdInr:number;date:string;source:string}|null}};
type Event={id:string;source:string;modelId:string;inputTokens:number;outputTokens:number;totalTokens:number;usageKind:string;createdAt:string};
const card='rounded-2xl border border-[#e7e9ef] bg-white p-5 shadow-[0_4px_18px_rgba(25,39,70,.035)]';
const field='w-full rounded-xl border border-[#dfe2e9] bg-[#fbfaff] p-3 text-sm outline-none focus:border-[#6255e8] focus:ring-3 focus:ring-[#6255e8]/10';
const number=(v:number|null|undefined,prefix='')=>v==null?'Unavailable':prefix+new Intl.NumberFormat('en-IN',{maximumFractionDigits:8}).format(v);

export default function TokenCalculatorView(){
 const [input,setInput]=useState(''),[legacyOutput,setLegacyOutput]=useState(''),[model,setModel]=useState('gpt-4.1-mini'),[budget,setBudget]=useState(512);
 const [loaded,setLoaded]=useState(false),[save,setSave]=useState('Loading saved calculator…'),[models,setModels]=useState<string[]>([]),[modelError,setModelError]=useState('');
 const [count,setCount]=useState<Count|null>(null),[countError,setCountError]=useState(''),[counting,setCounting]=useState(false),[retry,setRetry]=useState(0);
 const [latest,setLatest]=useState<Event|null>(null),[usageError,setUsageError]=useState(''),[usageChecked,setUsageChecked]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/token-calculator/state',{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setInput(d.input);setLegacyOutput(d.output);setModel(d.model);setBudget(d.outputBudget);setSave('Saved to your account');setLoaded(true);}).catch(()=>{if(!controller.signal.aborted)setSave('Could not load saved calculator. Reload to retry.');});
  return()=>controller.abort();
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/playground/models',{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setModels(d.entries.filter((entry:{usable:boolean})=>entry.usable).map((entry:{id:string})=>entry.id));setModelError('');}).catch(()=>{if(!controller.signal.aborted)setModelError('Model catalog unavailable. Retry to check current provider access.');});
  return()=>controller.abort();
 },[retry]);
 useEffect(()=>{
  if(!loaded)return;
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{
   setSave('Saving…');
   fetch('/api/token-calculator/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({input,output:legacyOutput,model,outputBudget:budget}),signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();if(!controller.signal.aborted)setSave('Saved to your account');}).catch(()=>{if(!controller.signal.aborted)setSave('Save failed. Your edits are still here; retry.');});
  },600);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[input,legacyOutput,model,budget,loaded,retry]);
 useEffect(()=>{
  if(!loaded||!models.includes(model))return;
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{
   setCounting(true);setCountError('');
   fetch('/api/token-calculator/count',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input,model,outputBudget:budget}),signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!controller.signal.aborted)setCount({...d,input});}).catch(e=>{if(!controller.signal.aborted){setCount(null);setCountError(e instanceof Error?e.message:'Token counting unavailable.');}}).finally(()=>{if(!controller.signal.aborted)setCounting(false);});
  },750);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[input,model,budget,loaded,models,retry]);
 useEffect(()=>{
  let stopped=false,inFlight=false;const controller=new AbortController();
  const refresh=async()=>{if(inFlight||document.hidden)return;inFlight=true;try{const r=await fetch('/api/usage?days=1',{cache:'no-store',signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error);if(!stopped){setLatest(d.events.find((event:Event)=>event.usageKind!=='local')??null);setUsageChecked(new Date().toISOString());setUsageError('');}}catch{if(!stopped)setUsageError('Usage refresh failed. Displayed activity may be out of date.');}finally{inFlight=false;}};
  void refresh();const timer=window.setInterval(()=>void refresh(),5000);document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  return()=>{stopped=true;controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
 },[]);
 const current=count&&count.input===input&&count.model===model&&count.outputBudget===budget?count:null;
 const countLabel=current?number(current.inputTokens):'—';
 return <div className="mx-auto w-full max-w-[1200px] space-y-5 p-5 text-[#24334b] sm:p-8">
  <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#6255e8]">Live token counting</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Token Calculator</h1><p className="mt-2 text-sm text-slate-500">Count your input with OpenAI, plan an output budget and follow your recorded model usage.</p></div><button onClick={()=>setRetry(v=>v+1)} className="inline-flex items-center gap-2 rounded-xl border border-[#e7e9ef] bg-white px-4 py-2 text-sm text-[#6255e8]"><RefreshCw className="size-4"/>Retry / refresh</button></header>
  <section className={`${card} grid gap-5 sm:grid-cols-2`}><label><span className="mb-2 block text-sm font-medium">OpenAI model</span><ThemedSelect aria-label="OpenAI model" value={model} onChange={e=>setModel(e.currentTarget.value)} disabled={!loaded||!models.length} className={field}>{!models.includes(model)&&<option value={model}>{model} · checking availability</option>}{models.map(id=><option key={id} value={id}>{id}</option>)}</ThemedSelect></label><label><span className="mb-2 block text-sm font-medium">Planned output budget (tokens)</span><input aria-label="Planned output budget" type="number" min={0} max={128000} step={1} disabled={!loaded} value={budget} onChange={e=>setBudget(Math.max(0,Math.min(128000,Math.floor(Number(e.currentTarget.value)||0))))} className={field}/><span className="mt-2 block text-xs text-slate-500">A planning amount, not a prediction of the generated reply.</span></label></section>
  {modelError&&<p role="alert" className="text-sm text-rose-700">{modelError}</p>}
  <section className={card}><label><span className="mb-2 block text-sm font-medium">Prompt or input</span><textarea aria-label="Prompt or input" disabled={!loaded} maxLength={50000} rows={8} value={input} onChange={e=>setInput(e.currentTarget.value)} placeholder="Type or paste the exact text to count…" className={`${field} resize-y`}/></label><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{input.length.toLocaleString()} / 50,000 characters · {save}</span><span role="status" className="inline-flex items-center gap-2">{counting&&<LoaderCircle className="size-3 animate-spin"/>}{current?`OpenAI count checked ${new Date(current.checkedAt).toLocaleTimeString()}`:countError?'Count unavailable':'Waiting for current input count…'}</span></div><p className="mt-2 text-xs text-slate-500">Text is sent to OpenAI for counting after you pause typing. This does not generate a reply or deduct application tickets.</p></section>
  {countError&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{countError}</p>}
  <div className="grid gap-4 sm:grid-cols-3">{[['Provider-counted input',countLabel],['Planned output',number(budget)],['Planned total',current?number(current.inputTokens+budget):'—']].map(([label,value])=><section key={label} className={card}><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-[#6255e8]">{value}</p></section>)}</div>
  <section className={card}><h2 className="font-semibold">Cost forecast for this input and output budget</h2><div className="mt-4 grid gap-5 sm:grid-cols-3">{[['Application charge (USD)',current?number(current.billing.chargeUsd,'$'):'—'],['Application charge (INR)',current?number(current.billing.chargeInr,'₹'):'—'],['Ticket equivalent',current?number(current.billing.tickets):'—']].map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">Uses the shared pricing catalog, standard uncached rates and the application’s {current?.billing.multiplier??2}× price multiplier. {current&&`Catalog verified ${new Date(current.billing.pricingVerifiedAt).toLocaleDateString()}. `}{current?.billing.fx&&`USD/INR: ${current.billing.fx.usdInr} (${current.billing.fx.source}). `}This is a budget forecast. Tools, history, instructions, reasoning and actual output can change the final bill.</p></section>
  <section className={card}><div className="flex flex-wrap justify-between gap-3"><h2 className="inline-flex items-center gap-2 font-semibold"><Activity className="size-4 text-[#6255e8]"/>Latest recorded model run</h2><Link href="/dashboard/usage" className="text-sm text-[#6255e8]">View Usage</Link></div><p className="mt-2 text-xs text-slate-500">Refreshes every five seconds while visible. {usageChecked&&`Checked ${new Date(usageChecked).toLocaleTimeString()}.`}</p>{usageError&&<p role="alert" className="mt-3 text-sm text-rose-700">{usageError}</p>}{!usageChecked?<p className="mt-4 text-sm text-slate-500">{usageError?'Recorded usage unavailable.':'Loading recorded usage…'}</p>:latest?<><p className="mt-4 text-sm">{latest.modelId} · {latest.source} · {new Date(latest.createdAt).toLocaleString()}</p><div className="mt-3 grid grid-cols-3 gap-3 text-sm"><p>Input <strong className="block text-xl">{number(latest.inputTokens)}</strong></p><p>Output <strong className="block text-xl">{number(latest.outputTokens)}</strong></p><p>Total <strong className="block text-xl">{number(latest.totalTokens)}</strong></p></div></>:<p className="mt-4 text-sm text-slate-500">No model runs recorded for your account.</p>}</section>
 </div>;
}
