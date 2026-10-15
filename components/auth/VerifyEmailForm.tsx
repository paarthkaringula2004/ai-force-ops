"use client";
import {useSyncExternalStore,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Mail,LoaderCircle} from 'lucide-react';
import {authClient} from '@/lib/auth-client';
const subscribeEmail=()=>()=>{};
const storedEmail=()=>sessionStorage.getItem('aiforce_verification_email')||'';
const serverEmail=()=>'';
export default function VerifyEmailForm(){
 const router=useRouter(),{data:session}=authClient.useSession();
 const [email,setEmail]=useState<string|null>(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const savedEmail=useSyncExternalStore(subscribeEmail,storedEmail,serverEmail);
 const address=session?.user.email||(email??savedEmail);
 async function resend(){setBusy(true);setError('');try{const response=await authClient.emailOtp.sendVerificationOtp({email:address,type:'email-verification'});if(response.error)throw new Error(response.error.message||'Unable to request a code.');setNotice('A new code has been requested. Check your inbox and spam folder. It expires in 10 minutes.');}catch(e){setError(e instanceof Error?e.message:'The service could not be reached.');}finally{setBusy(false);}}
 async function verify(){setBusy(true);setError('');try{const response=await authClient.emailOtp.verifyEmail({email:address,otp:code});if(response.error)throw new Error(response.error.message||'Verification failed.');sessionStorage.removeItem('aiforce_verification_email');setNotice('Your email is verified.');await authClient.getSession({query:{disableCookieCache:true}});router.replace('/dashboard');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Verification failed.');}finally{setBusy(false);}}
 const input='mt-2 h-11 w-full rounded-xl border border-[#dfe3eb] px-3.5 text-sm outline-none focus:border-[#aaa3f1] focus:ring-3 focus:ring-[#6255e8]/10';
 return <section className="w-full max-w-[430px] rounded-3xl border border-[#e8eaf1] bg-white p-8 shadow-[0_22px_65px_rgba(36,43,67,.09)]"><Mail className="size-8 text-[#6255e8]"/><h1 className="mt-5 text-2xl font-semibold text-[#202631]">Verify your email</h1><p className="mt-3 text-sm leading-6 text-slate-500">Enter the six-digit code sent to your email. Codes expire after 10 minutes.</p><form className="mt-6 space-y-4" onSubmit={e=>{e.preventDefault();void verify();}}><label className="block text-xs font-medium">Email<input type="email" required autoComplete="email" className={input} value={address} readOnly={Boolean(session)} onChange={e=>setEmail(e.target.value)}/></label><label className="block text-xs font-medium">Verification code<input required className={`${input} tracking-[.3em]`} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>{error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}{notice&&<p role="status" className="text-xs leading-5 text-[#6255e8]">{notice}</p>}<button disabled={busy||code.length!==6} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6255e8] text-sm font-semibold text-white disabled:opacity-50">{busy&&<LoaderCircle className="size-4 animate-spin"/>}Verify email</button><button type="button" disabled={busy||!address} onClick={()=>void resend()} className="w-full text-xs font-medium text-[#6255e8] disabled:opacity-50">Resend code</button></form><Link href="/sign-in" className="mt-6 block text-center text-xs text-slate-500">Back to sign in</Link></section>;
}
