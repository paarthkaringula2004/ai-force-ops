"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function AuthForm({ mode, initialCookieChoice = "pending" }: { mode: "sign-in" | "sign-up"; initialCookieChoice?: "required" | "declined" | "pending" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cookieChoice, setCookieChoice] = useState<"required" | "declined" | "pending">(initialCookieChoice);
  const isSignup = mode === "sign-up";

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
      router.replace("/dashboard");
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
