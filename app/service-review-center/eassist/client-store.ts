'use client';
import {useEffect,useSyncExternalStore} from 'react';
import type {Snapshot,Json} from '@/lib/eassist/types';
type Entry={snapshot:Snapshot|null;listeners:Set<()=>void>;pending:Promise<void>|null};
const cache=new Map<string,Entry>();
function entry(user:string){let e=cache.get(user);if(!e){e={snapshot:null,listeners:new Set(),pending:null};cache.set(user,e);}return e;}
export async function request(body:Json){
  const response=await fetch('/api/eassist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'The operation could not be completed.');return result as Json;
}
export async function refresh(user:string){
  const e=entry(user);if(e.pending)return e.pending;
  e.pending=(async()=>{const r=await fetch('/api/eassist',{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error||'Saved data could not be loaded.');e.snapshot=data;e.listeners.forEach(f=>f());})().finally(()=>{e.pending=null;});
  return e.pending;
}
export function useWorkspace(user:string,onState:(state:string)=>void,onError:(error:string)=>void){
  const snapshot=useSyncExternalStore(callback=>{const e=entry(user);e.listeners.add(callback);return()=>{e.listeners.delete(callback);};},()=>entry(user).snapshot,()=>null);
  useEffect(()=>{
    let disposed=false;
    const load=()=>refresh(user).catch(e=>{if(!disposed)onError(e.message);});
    void load();const stream=new EventSource('/api/eassist/events');
    stream.onopen=()=>onState('Live');stream.onerror=()=>onState('Reconnecting');
    stream.addEventListener('unavailable',()=>onState('Reconnecting'));
    stream.addEventListener('change',event=>{const {revision}=JSON.parse((event as MessageEvent).data);if(entry(user).snapshot?.revision!==revision)void load();});
    const focus=()=>void load();window.addEventListener('focus',focus);
    return()=>{disposed=true;stream.close();window.removeEventListener('focus',focus);};
  },[user,onState,onError]);
  return snapshot;
}
