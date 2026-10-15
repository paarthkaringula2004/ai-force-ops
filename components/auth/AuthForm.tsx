"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function AuthForm({ mode, initialCookieChoice = "pending", googleEnabled = false, initialError = '' }: { mode: "sign-in" | "sign-up"; initialCookieChoice?: "required" | "declined" | "pending"; googleEnabled?: boolean; initialError?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [cookieChoice, setCookieChoice] = useState<"required" | "declined" | "pending">(initialCookieChoice);
  const isSignup = mode === "sign-up";

  async function continueWithGoogle() {
    if (!googleEnabled || busy || cookieChoice !== 'required') return;
    setError('');
    setBusy(true);
    try {
      const result = await authClient.signIn.social({provider:'google', callbackURL:'/dashboard', newUserCallbackURL:'/dashboard', errorCallbackURL:isSignup?'/sign-up':'/sign-in'});
      if (result.error) {
        if (!isSignup && result.error.code === 'EMAIL_NOT_VERIFIED') {
          sessionStorage.setItem('aiforce_verification_email', email.trim());
          router.push('/verify-email');
          return;
        }
        setError('Google sign-in could not be started. Please try again or use email and password.');
        setBusy(false);
      }
    } catch {
      setError('Google sign-in could not be reached. Please try again.');
      setBusy(false);
    }
  }

  function chooseCookies(choice: "required" | "declined") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `aiforce_cookie_choice=${choice}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    setCookieChoice(choice);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (isSignup && password !== confirmation) {
      setError("Your passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = isSignup
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/dashboard" })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/dashboard" });
      if (result.error) {
        setError(result.error.message || (isSignup ? "We could not create your account." : "Email or password was not recognized."));
        return;
      }
      if(isSignup)sessionStorage.setItem('aiforce_verification_email',email.trim());
      router.replace(isSignup?"/verify-email":"/dashboard");
      router.refresh();
    } catch {
      setError("The account service could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full max-w-[430px] rounded-[24px] border border-[#e8eaf1] bg-white p-6 shadow-[0_22px_65px_rgba(36,43,67,0.09)] sm:p-9">
      <div className="flex size-11 items-center justify-center rounded-[14px] bg-[#efedff] text-[#6255e8]"><Sparkles className="size-5" /></div>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7168cf]">AIForce.Ops workspace</p>
      <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.045em] text-[#202631]">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-[12px] leading-5 text-[#7d8797]">{isSignup ? "Set up your secure workspace to build and save AI agents." : "Sign in to continue to your agents and workflows."}</p>

      {cookieChoice === "required" ? <form onSubmit={submit} className="mt-7 space-y-4">
        <button type="button" disabled={busy||!googleEnabled} onClick={()=>void continueWithGoogle()} className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-[#dfe3eb] bg-white px-4 text-[12px] font-semibold text-[#30394b] transition hover:bg-[#faf9ff] disabled:cursor-not-allowed disabled:opacity-60">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>
          Continue with Google
        </button>
        {!googleEnabled&&<p className="text-center text-[10px] text-[#7d8797]">Google sign-in will be available once setup is complete.</p>}
        <div className="flex items-center gap-3 text-[10px] text-[#969eac]"><span className="h-px flex-1 bg-[#eef0f4]"/>or continue with email<span className="h-px flex-1 bg-[#eef0f4]"/></div>
        {isSignup && <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#465064]">Your name</span><input required maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.currentTarget.value)} className="h-11 w-full rounded-xl border border-[#dfe3eb] px-3.5 text-[12px] text-[#30394b] outline-none transition placeholder:text-[#a7aebc] focus:border-[#aaa3f1] focus:ring-3 focus:ring-[#6255e8]/10" placeholder="Name" /></label>}
        <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#465064]">Email</span><input required type="email" maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} className="h-11 w-full rounded-xl border border-[#dfe3eb] px-3.5 text-[12px] text-[#30394b] outline-none transition placeholder:text-[#a7aebc] focus:border-[#aaa3f1] focus:ring-3 focus:ring-[#6255e8]/10" placeholder="you@example.com" /></label>
        <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#465064]">Password</span><input required type="password" minLength={8} maxLength={128} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.currentTarget.value)} className="h-11 w-full rounded-xl border border-[#dfe3eb] px-3.5 text-[12px] text-[#30394b] outline-none transition placeholder:text-[#a7aebc] focus:border-[#aaa3f1] focus:ring-3 focus:ring-[#6255e8]/10" placeholder={isSignup ? "At least 8 characters" : "Enter your password"} /></label>
        {isSignup && <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#465064]">Confirm password</span><input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} className="h-11 w-full rounded-xl border border-[#dfe3eb] px-3.5 text-[12px] text-[#30394b] outline-none transition placeholder:text-[#a7aebc] focus:border-[#aaa3f1] focus:ring-3 focus:ring-[#6255e8]/10" placeholder="Re-enter your password" /></label>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">{error}</p>}
        <button disabled={busy} type="submit" className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6255e8] px-4 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(98,85,232,0.18)] transition hover:bg-[#5146d2] disabled:cursor-wait disabled:opacity-70">{busy && <LoaderCircle className="size-4 animate-spin" />}{isSignup ? "Create account" : "Sign in"}</button>
      </form> : <div role="dialog" aria-labelledby="cookie-choice-title" className="mt-7 rounded-2xl border border-[#e5e2ff] bg-[#faf9ff] p-4">
        <h2 id="cookie-choice-title" className="text-[12px] font-semibold text-[#34304f]">Choose cookie settings</h2>
        <p className="mt-2 text-[10px] leading-5 text-[#737b8b]">AIForce.Ops needs an essential first-party cookie to keep your sign-in secure. Your choice is remembered in a small preference cookie. We don’t use advertising or analytics cookies.</p>
        {cookieChoice === "declined" && <p role="status" className="mt-2 text-[10px] font-medium text-[#6255e8]">You declined. Sign-in is unavailable without the required authentication cookie.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => chooseCookies("required")} className="rounded-lg bg-[#6255e8] px-3.5 py-2.5 text-[10px] font-semibold text-white transition hover:bg-[#5146d2]">Allow required cookies</button>
          {cookieChoice === "pending" && <button type="button" onClick={() => chooseCookies("declined")} className="rounded-lg border border-[#dedfe6] bg-white px-3.5 py-2.5 text-[10px] font-medium text-[#667184] transition hover:bg-[#f5f6f8]">Decline</button>}
        </div>
      </div>}

      <p className="mt-6 text-center text-[11px] text-[#7d8797]">{isSignup ? "Already have an account?" : "New to AIForce.Ops?"} <Link className="font-semibold text-[#5c51d4] hover:underline" href={isSignup ? "/sign-in" : "/sign-up"}>{isSignup ? "Sign in" : "Create an account"}</Link></p>
      <p className="mt-5 border-t border-[#eef0f4] pt-4 text-center text-[9px] leading-4 text-[#969eac]">Your account and workspace data are stored in PostgreSQL.</p>
    </section>
  );
}
