import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import { getCurrentSession } from "@/lib/request-session";
import { cookies } from "next/headers";
import { googleSignInConfigured, googleAuthError } from "@/lib/google-auth";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    if ((await getCurrentSession())?.user) redirect("/dashboard");
    const choice = (await cookies()).get("aiforce_cookie_choice")?.value;
    const params = await searchParams;
    return (
        <AuthForm
            mode="sign-up"
            googleEnabled={googleSignInConfigured()}
            initialError={googleAuthError(params.error)}
            initialCookieChoice={
                choice === "required" || choice === "declined" ? choice : "pending"
            }
        />
    );
}
