"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Bell,ExternalLink,X} from 'lucide-react';
import {employeeServiceLabels} from '@/lib/employee-services';

type RequestNotice={id:string;requestNumber:string;kind:string;senderName:string;createdAt:string};
type Inbox={notifications:RequestNotice[];unreadCount:number;revision:string|null;cursor?:string};
export function WorkspaceRequestNotifications({userId}:{userId:string}){
 const router=useRouter(),dismissed=useRef(new Set<string>());
 const [inbox,setInbox]=useState<Inbox>({notifications:[],unreadCount:0,revision:null}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,revoked=false,lastCursor=0;const controller=new AbortController();
  const update=(next:Inbox)=>{if(!active||revoked||!Array.isArray(next.notifications))return;const cursor=Number(next.cursor||'0');if(cursor<lastCursor)return;lastCursor=cursor;const notifications=next.notifications.filter(item=>!dismissed.current.has(item.id));setInbox({...next,notifications,unreadCount:Math.max(0,next.unreadCount-(next.notifications.length-notifications.length))});window.dispatchEvent(new Event('workspace-requests-updated'));};
  const refresh=async()=>{try{
   const response=await fetch('/api/workspace/request-notifications',{cache:'no-store',signal:controller.signal});
   if(response.status===401||response.status===403){revoked=true;source?.close();if(active)setInbox({notifications:[],unreadCount:0,revision:null});return;}
   if(response.ok)update(await response.json());
  }catch{/* The event stream reconnects; fallback refresh recovers missed updates. */}};
  const source=typeof EventSource!=='undefined'?new EventSource('/api/workspace/request-notifications?stream=1'):null;
  const message=(event:MessageEvent)=>{try{update(JSON.parse(event.data));}catch{/* Ignore malformed transport frames. */}};
  source?.addEventListener('requests',message);
  source?.addEventListener('revoked',()=>{revoked=true;source.close();if(active)setInbox({notifications:[],unreadCount:0,revision:null});});
  source?.addEventListener('error',()=>void refresh());
  void refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&(!source||source.readyState!==EventSource.OPEN))void refresh();},15000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);
  return()=>{active=false;controller.abort();source?.close();clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);};
 },[userId]);
 const notice=inbox.notifications[0];
 if(!notice)return null;
 async function dismiss(open:boolean){
  if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/workspace/request-notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:notice.id})});
   if(!response.ok)throw new Error('Could not dismiss this notification. Try again.');
   dismissed.current.add(notice.id);
   setInbox(current=>({...current,notifications:current.notifications.filter(item=>item.id!==notice.id),unreadCount:Math.max(0,current.unreadCount-1)}));
   if(open)router.push(`/dashboard/team-requests?request=${encodeURIComponent(notice.id)}`);
  }catch(e){setError(e instanceof Error?e.message:'Could not update the notification.');}finally{setBusy(false);}
 }
 return <aside role="status" aria-live="polite" aria-label="New request notification" className="fixed right-5 top-24 z-50 w-[calc(100vw_-_2.5rem)] max-w-sm rounded-2xl border border-[#dcd5ff] bg-white p-5 shadow-[0_15px_65px_rgba(63,45,115,0.2)]"><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs font-semibold text-[#6550ed]"><Bell className="size-4"/>New request for review</p><button type="button" disabled={busy} onClick={()=>void dismiss(false)} aria-label="Dismiss request notification" className="rounded-md p-1 text-slate-500 hover:bg-purple-50"><X className="size-4"/></button></div><h3 className="mt-3 font-semibold text-slate-900">{employeeServiceLabels[notice.kind]||'Workplace request'}</h3><p className="mt-2 text-sm text-slate-600">{notice.senderName} submitted {notice.requestNumber}.</p><p className="mt-2 text-xs text-slate-500">Pending your review · {new Date(notice.createdAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})} IST</p>{error&&<p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}<button type="button" disabled={busy} onClick={()=>void dismiss(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#6550ed] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#5643d6] disabled:opacity-50"><ExternalLink className="size-4"/>{busy?'Please wait…':'Review request'}</button>{inbox.unreadCount>1&&<p className="mt-3 text-xs text-slate-500">{inbox.unreadCount-1} more unread requests</p>}<p className="mt-3 text-[10px] leading-4 text-slate-400">Dismissing this alert does not approve or reject the request.</p></aside>;
}
