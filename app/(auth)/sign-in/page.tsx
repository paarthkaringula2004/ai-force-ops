import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import { getCurrentSession } from "@/lib/request-session";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if ((await getCurrentSession())?.user) redirect("/dashboard");
  const choice = (await cookies()).get("aiforce_cookie_choice")?.value;
  return <AuthForm mode="sign-in" initialCookieChoice={choice === "required" || choice === "declined" ? choice : "pending"} />;
}
