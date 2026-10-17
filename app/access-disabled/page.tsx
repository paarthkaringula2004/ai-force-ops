"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
export default function AccessDisabled() {
    const router = useRouter();
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
            <section className="max-w-md rounded-2xl border bg-white p-8">
                <h1 className="text-xl font-semibold">Workspace access is disabled</h1>
                <p className="my-4 text-sm text-slate-600">
                    Contact your workspace Admin to restore access.
                </p>
                <button
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-white"
                    onClick={() => void authClient.signOut().then(() => router.push("/sign-in"))}
                >
                    Sign out
                </button>
            </section>
        </main>
    );
}
