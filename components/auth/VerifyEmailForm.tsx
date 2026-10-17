"use client";
import { useSyncExternalStore, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
const subscribeEmail = () => () => {};
const storedEmail = () => {
    try {
        return sessionStorage.getItem("aiforce_verification_email") || "";
    } catch {
        return "";
    }
};
const serverEmail = () => "";
export default function VerifyEmailForm() {
    const router = useRouter(),
        { data: session } = authClient.useSession();
    const [email, setEmail] = useState<string | null>(null),
        [code, setCode] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [notice, setNotice] = useState("");
    const [remaining, setRemaining] = useState(0);
    useEffect(() => {
        if (!remaining) return;
        const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
        return () => clearTimeout(timer);
    }, [remaining]);
    const savedEmail = useSyncExternalStore(subscribeEmail, storedEmail, serverEmail);
    const address = session?.user.email || (email ?? savedEmail);
    async function resend() {
        if (busy || remaining > 0 || !address) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const response = await authClient.emailOtp.sendVerificationOtp({
                email: address,
                type: "email-verification",
            });
            if (response.error) {
                if (response.error.status === 429) {
                    setRemaining(60);
                    throw new Error("Too many code requests. Wait a minute before trying again.");
                }
                throw new Error(response.error.message || "Unable to request a code.");
            }
            setRemaining(60);
            setCode("");
            setNotice(
                "If this email belongs to an unverified account, a new code has been requested for delivery. Delivery can take a few minutes; this message does not confirm inbox delivery. Check spam too. Use only the newest code; it expires 10 minutes after the request.",
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "The service could not be reached.");
        } finally {
            setBusy(false);
        }
    }
    async function verify() {
        setBusy(true);
        setError("");
        try {
            const response = await authClient.emailOtp.verifyEmail({ email: address, otp: code });
            if (response.error) throw new Error(response.error.message || "Verification failed.");
            try {
                sessionStorage.removeItem("aiforce_verification_email");
            } catch {
                /* Verification succeeds even when browser storage is unavailable. */
            }
            setNotice("Your email is verified.");
            await authClient.getSession({ query: { disableCookieCache: true } });
            router.replace("/sign-in?verified=1");
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Verification failed.");
        } finally {
            setBusy(false);
        }
    }
    const input =
        "mt-2 h-11 w-full rounded-xl border border-[#dfe3eb] px-3.5 text-sm outline-none focus:border-[#aaa3f1] focus:ring-3 focus:ring-[#6255e8]/10";
    return (
        <section className="w-full max-w-[430px] rounded-3xl border border-[#e8eaf1] bg-white p-8 shadow-[0_22px_65px_rgba(36,43,67,.09)]">
            <Mail className="size-8 text-[#6255e8]" />
            <h1 className="mt-5 text-2xl font-semibold text-[#202631]">Verify your email</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
                Request a six-digit code using the button below, then enter it here. If you already
                received a code, you can use it now. Codes expire after 10 minutes.
            </p>
            <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    void verify();
                }}
            >
                <label className="block text-xs font-medium">
                    Email
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        className={input}
                        value={address}
                        readOnly={Boolean(session)}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setCode("");
                            setError("");
                            setNotice("");
                        }}
                    />
                </label>
                <label className="block text-xs font-medium">
                    Verification code
                    <input
                        required
                        className={`${input} tracking-[.3em]`}
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    />
                </label>
                {error && (
                    <p role="alert" className="text-xs text-rose-700">
                        {error}
                    </p>
                )}
                {notice && (
                    <p role="status" className="text-xs leading-5 text-[#6255e8]">
                        {notice}
                    </p>
                )}
                <button
                    disabled={busy || code.length !== 6}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6255e8] text-sm font-semibold text-white disabled:opacity-50"
                >
                    {busy && <LoaderCircle className="size-4 animate-spin" />}Verify email
                </button>
                <button
                    type="button"
                    disabled={busy || remaining > 0 || !address}
                    onClick={() => void resend()}
                    className="w-full text-xs font-medium text-[#6255e8] disabled:opacity-50"
                >
                    {notice ? "Resend verification code" : "Send verification code"}
                </button>
                {remaining > 0 && (
                    <p role="status" className="text-center text-xs text-slate-500">
                        You can request another code in {remaining}s. Requesting a new code
                        invalidates the previous one.
                    </p>
                )}
            </form>
            <Link href="/sign-in" className="mt-6 block text-center text-xs text-slate-500">
                Back to sign in
            </Link>
        </section>
    );
}
