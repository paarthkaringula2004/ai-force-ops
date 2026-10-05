"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronDown, CircleUserRound, CreditCard, LogOut, Settings2, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearWorkspaceApiData } from "@/lib/workspace-api-cache";

export default function WorkspaceUserMenu() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
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

  return <div ref={root} className="relative ml-1">
    <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-w-0 items-center gap-2 rounded-full border border-[#eceef3] bg-white py-1 pl-1 pr-2 transition hover:border-[#d9dce4] hover:bg-[#fbfbfd]"><span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eceaff] text-[10px] font-semibold text-[#594de0]">{user?.image ? <Image src={user.image} alt="" width={28} height={28} unoptimized className="size-full object-cover" /> : initial || <UserRound className="size-3.5" />}</span><span className="hidden max-w-[120px] truncate text-[10px] font-medium text-[#515a69] lg:block" title={displayName}>{displayName}</span><ChevronDown className="size-3.5 text-[#7b8493]" /></button>
    {open && <div role="menu" className="absolute right-0 top-[calc(100%+10px)] z-50 w-[260px] overflow-hidden rounded-2xl border border-[#e5e7ed] bg-white p-1.5 shadow-[0_20px_55px_rgba(25,35,55,.16)]">
      <div className="border-b border-[#eef0f3] px-3 py-3"><p className="truncate text-[12px] font-semibold text-[#283144]">{displayName}</p><p className="mt-1 truncate text-[10px] text-[#8992a2]">{user?.email ?? "Signed-in account"}</p></div>
      <button role="menuitem" type="button" onClick={() => { setOpen(false); router.push("/dashboard/settings?tab=profile"); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] text-[#465064] hover:bg-[#f6f7fa]"><CircleUserRound className="size-4 text-[#737d8d]" />View profile</button>
      <button role="menuitem" type="button" onClick={() => { setOpen(false); router.push("/dashboard/settings"); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] text-[#465064] hover:bg-[#f6f7fa]"><Settings2 className="size-4 text-[#737d8d]" />Account settings</button>
      <button role="menuitem" type="button" onClick={() => { setOpen(false); router.push("/dashboard/payments"); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] text-[#465064] hover:bg-[#f6f7fa]"><CreditCard className="size-4 text-[#737d8d]" />Plans & tokens</button>
      <div className="my-1 border-t border-[#eef0f3]" />
      <button role="menuitem" type="button" onClick={() => void signOut()} disabled={busy} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"><LogOut className="size-4" />{busy ? "Signing out…" : "Log out"}</button>
    </div>}
  </div>;
}
