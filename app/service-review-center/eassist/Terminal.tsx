'use client';

import {useEffect,useRef,useState} from 'react';

import {Download,Maximize2,Minimize2,Square,X,TerminalSquare} from 'lucide-react';

import {array,object,terminalStates,taskStatusLabel,textValue,type Json} from '@/lib/eassist/types';

import {request} from './client-store';

export default function Terminal({connectionId,taskId,title,onClose,onStop}:{connectionId:string;taskId:string;title:string;onClose:()=>void;onStop:()=>Promise<void>}){

  const [task,setTask]=useState<Json>({}),[lines,setLines]=useState<Json[]|null>(null),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[follow,setFollow]=useState(true),[truncated,setTruncated]=useState(false),[stopping,setStopping]=useState(false),[tab,setTab]=useState("log"),[decision,setDecision]=useState<"confirm"|"reject"|null>(null),[responding,setResponding]=useState(false);

  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[onClose]);
  const terminal=useRef<HTMLDivElement>(null);

  useEffect(()=>{

    let disposed=false,timer:ReturnType<typeof setTimeout>;

    async function update(){

      let done=false;

      try{const result=await request({action:'task.output',connectionId,id:taskId});if(disposed)return;const current=object(result.task),output=object(result.output);setTask(current);setLines(array(output.lines));setTruncated(output.truncated===true);setError('');done=terminalStates.includes(String(current.status));}

      catch(e){if(!disposed)setError(e instanceof Error?e.message:'Output temporarily unavailable. Retrying.');}

      if(!disposed&&!done)timer=setTimeout(update,1000);

    }

    void update();return()=>{disposed=true;clearTimeout(timer);};

  },[connectionId,taskId]);

  useEffect(()=>{if(follow&&terminal.current)terminal.current.scrollTop=terminal.current.scrollHeight;},[lines,follow]);

  function rawLog(){const url=URL.createObjectURL(new Blob([(lines||[]).map(l=>textValue(l.output)).join('\n')],{type:'text/plain'}));window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function download(){const text=(lines||[]).map(l=>`${textValue(l.time)}  ${textValue(l.output)}`).join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=`task-${taskId}.log`;a.click();URL.revokeObjectURL(url);}

  async function respond(){if(!decision)return;setResponding(true);try{await request({action:`task.${decision}`,connectionId,id:taskId,confirmed:true,requestKey:crypto.randomUUID()});setDecision(null);}catch(e){setError(e instanceof Error?e.message:'Task action failed.');}finally{setResponding(false);}}

  const missingPowerShell=lines?.some(l=>/exec: "powershell".*executable file not found/.test(textValue(l.output)));

  const status=String(task.status||'Loading');

  const start=task.start||task.created,end=task.end;

  const duration=start&&end?`${Math.max(0,Math.round((Date.parse(String(end))-Date.parse(String(start)))/1000))}s`:terminalStates.includes(status)?'—':'In progress';

  return <div className="ea-modal-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={`Task ${taskId} terminal`} className="ea-modal ea-task-window" style={{width:expanded?'96vw':'1050px',height:expanded?'94dvh':'78dvh',maxHeight:'94dvh'}} onClick={e=>e.stopPropagation()}><div className="ea-modal-head"><TerminalSquare size={18} className="text-indigo-500"/><h2 className="min-w-0 flex-1 truncate">{title} <span className="font-normal text-slate-400">/ Task #{taskId}</span></h2><button className="ea-btn" aria-label={expanded?'Restore terminal size':'Expand terminal'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button><button aria-label="Close terminal" className="ea-btn" onClick={onClose}><X size={16}/></button></div><div className="flex flex-wrap items-center gap-7 px-6 py-4 text-xs"><span className={`ea-badge ${status==='success'?'ea-green':['error','failed'].includes(status)?'ea-red':'ea-violet'}`}>{taskStatusLabel(status)}</span><div><span className="text-slate-400">Author</span><p>{textValue(task.user_name||task.user_id)||'—'}</p></div><div><span className="text-slate-400">Started</span><p>{start?new Date(String(start)).toLocaleString():'Awaiting runner'}</p></div><div><span className="text-slate-400">Duration</span><p>{duration}</p></div><span className="ml-auto max-w-64 truncate text-slate-400">{textValue(task.message)}</span></div><div className="ea-task-tabs" role="tablist" aria-label="Task output tabs">{['log','details'].map(t=><button key={t} role="tab" aria-selected={tab===t} className={`ea-tab ${tab===t?'selected':''}`} onClick={()=>setTab(t)}>{t}</button>)}</div>{missingPowerShell&&<div className="ea-task-explanation">This task failed in Semaphore because PowerShell is missing from its runner. Use a runner with PowerShell installed, or select the Bash system-info template.</div>}{status==='waiting_confirmation'&&<div className="ea-task-explanation"><strong>Waiting for your decision</strong><p>Review the log before continuing this automation.</p>{decision?<><p>{decision==='confirm'?'Continue this automation? This may change infrastructure.':'Reject this step and end the task?'}</p><button className="ea-btn ea-primary" disabled={responding} onClick={()=>void respond()}>{responding?'Sending…':decision==='confirm'?'Confirm task':'Reject task'}</button><button className="ea-btn" onClick={()=>setDecision(null)}>Cancel</button></>:<><button className="ea-btn ea-primary" onClick={()=>setDecision('confirm')}>Confirm</button><button className="ea-btn ea-danger" onClick={()=>setDecision('reject')}>Reject</button></>}</div>}{error&&<div role="alert" className="ea-error mx-4">{error}</div>}<div ref={terminal} hidden={tab!=="log"} className="ea-terminal" aria-label="Execution output">{lines===null?<p className="text-slate-500">Connecting to task output…</p>:!lines.length?<p className="text-slate-500">The runner has not produced output yet.</p>:lines.map((line,i)=>{const output=textValue(line.output).replace(/\x1b\[[0-9;]*[a-zA-Z]/g,'');return <div key={i} className="ea-terminal-line"><time>{line.time?new Date(String(line.time)).toLocaleTimeString():''}</time><span className={/failed|fatal|error/i.test(output)?'text-rose-300':/warning/i.test(output)?'text-amber-300':/^(ok:|changed:|PLAY RECAP)/.test(output)?'text-emerald-300':''}>{output||' '}</span></div>;})}</div>{tab==='details'&&<div className="ea-task-details"><dl>{[['Message',task.message],['Commit message',task.commit_message],['Commit hash',task.commit_hash],['Created',task.created],['Started',task.start],['Ended',task.end],['Duration',duration],['Runner',task.runner_id],['Branch',task.git_branch],['Limit',task.limit]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{textValue(value)||'—'}</dd></div>)}</dl></div>}<div className="ea-modal-foot items-center justify-between"><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>Follow output</label>{truncated&&<span className="text-xs text-amber-600">Showing the last 20,000 lines.</span>}<div className="flex gap-2"><button disabled={!lines} className="ea-btn" onClick={rawLog}>Raw log</button><button disabled={!lines} className="ea-btn" onClick={download}><Download size={14}/>Download log</button>{!terminalStates.includes(status)&&<button disabled={stopping||!task.id} className="ea-btn ea-danger" onClick={async()=>{setStopping(true);try{await onStop();}catch(e){setError(e instanceof Error?e.message:'Stop request failed.');}finally{setStopping(false);}}}><Square size={12}/>{stopping?'Requesting stop…':'Stop task'}</button>}</div></div></section></div>;

}

