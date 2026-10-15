"use client";
import { useState } from "react";
import GoogleVirtualMeetings from "./GoogleVirtualMeetings";
import TeamsVirtualMeetings from "./TeamsVirtualMeetings";
export default function VirtualMeetings() {
  const [provider,setProvider]=useState<"google"|"teams">("google");
  return <div className="space-y-5"><div className="flex flex-wrap gap-2" aria-label="Meeting provider">{([['google','Google Meet'],['teams','Microsoft Teams']] as const).map(([id,label])=><button key={id} aria-pressed={provider===id} onClick={()=>setProvider(id)} className={`rounded-xl border px-5 py-3 text-sm font-semibold transition ${provider===id?'border-[#dcd5ff] bg-[#f0edff] text-[#6550ed]':'border-[#e6e4f0] bg-white text-slate-500 hover:bg-[#faf9ff]'}`}>{label}</button>)}</div>{provider==='google'?<GoogleVirtualMeetings />:<TeamsVirtualMeetings />}</div>;
}
