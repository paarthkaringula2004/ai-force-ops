"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Building2, ChevronDown, CircleUserRound, CreditCard, LogOut, Settings2, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearWorkspaceApiData } from "@/lib/workspace-api-cache";

type WorkspaceMenuLink={name:string;href:string;disabled?:boolean;reason?:string};
export default function WorkspaceUserMenu({workspaceLinks=[]}:{workspaceLinks?:WorkspaceMenuLink[]}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = authClient.useSession();
  const user = data?.user;
  const displayName = user?.name?.trim() || user?.email || "Your account";
  const initial = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    function closeOutside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function closeEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);

  async function signOut() {
    setBusy(true);
    try { clearWorkspaceApiData(); await authClient.signOut(); router.replace("/"); router.refresh(); }
    finally { setBusy(false); setOpen(false); }
  }

  const avatar = () => <span aria-hidden="true" className={`flex aspect-square flex-none items-center justify-center overflow-hidden rounded-full bg-[#eeebff] font-semibold text-[#6255e8] ring-1 ring-black/5 size-8 text-xs`}>
    {user?.image ? <Image src={user.image} alt="" width={32} height={32} unoptimized className="block object-cover" style={{width:"100%",height:"100%",aspectRatio:"1 / 1",objectFit:"cover"}} /> : initial || <UserRound className="size-4" />}
  </span>;
  const itemClass = "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#465064] transition-colors hover:bg-[#f3f1ff] hover:text-[#6255e8] focus-visible:bg-[#f3f1ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9c2ff]";

  return <div ref={root} className="relative ml-1 w-[176px] shrink-0 sm:w-[190px]">
    <button type="button" aria-label={`Account menu for ${displayName}`} aria-haspopup="menu" aria-controls={open ? menuId : undefined} aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex h-10 w-full min-w-0 items-center gap-2.5 rounded-xl border py-1 pl-1.5 pr-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9c2ff] ${open ? "border-[#d9d3ff] bg-[#f7f5ff]" : "border-[#e7e9ef] bg-white hover:border-[#d9d3ff] hover:bg-[#faf9ff]"}`}>
      {avatar()}<span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-5 text-[#374151]" title={displayName}>{displayName}</span><ChevronDown aria-hidden="true" className={`size-3.5 flex-none text-[#8992a2] transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div id={menuId} role="menu" aria-label="Your account" className="absolute right-0 top-[calc(100%+10px)] z-50 w-full max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[#e7e9ef] bg-white shadow-[0_12px_36px_-8px_rgba(25,35,55,.18)]">
      <div className="p-1.5">
        <button role="menuitem" type="button" onClick={() => { setOpen(false); router.push("/dashboard/settings?tab=profile"); }} className={itemClass}><CircleUserRound aria-hidden="true" className="size-[17px] flex-none text-[#8992a2]" />View profile</button>
        {user&&!user.emailVerified&&<button role="menuitem" type="button" onClick={()=>{setOpen(false);router.push("/verify-email");}} className={itemClass}><UserRound aria-hidden="true" className="size-[17px] flex-none text-[#8992a2]"/>Verify email</button>}
        <button role="menuitem" type="button" onClick={() => { setOpen(false); router.push("/dashboard/settings"); }} className={itemClass}><Settings2 aria-hidden="true" className="size-[17px] flex-none text-[#8992a2]" />Account settings</button>
        <button role="menuitem" type="button" onClick={() => { setOpen(false); router.push("/dashboard/payments"); }} className={itemClass}><CreditCard aria-hidden="true" className="size-[17px] flex-none text-[#8992a2]" />Plans & tickets</button>
      </div>
      {!!workspaceLinks.length&&<div className="border-t border-[#eef0f3] p-1.5">{workspaceLinks.map(link=><button key={link.href} role="menuitem" type="button" disabled={link.disabled} title={link.disabled?link.reason:undefined} onClick={()=>{setOpen(false);router.push(link.href);}} className={itemClass+" disabled:cursor-not-allowed disabled:opacity-40"}><Building2 aria-hidden="true" className="size-[17px] flex-none text-[#8992a2]"/>{link.name}</button>)}</div>}
      <div className="border-t border-[#eef0f3] p-1.5"><button role="menuitem" type="button" onClick={() => void signOut()} disabled={busy} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50 focus-visible:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-200 disabled:opacity-50"><LogOut aria-hidden="true" className="size-[17px] flex-none" />{busy ? "Signing out…" : "Log out"}</button></div>
    </div>}
  </div>;
}
