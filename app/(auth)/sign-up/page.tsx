import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import { getCurrentSession } from "@/lib/request-session";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  if ((await getCurrentSession())?.user) redirect("/dashboard");
  const choice = (await cookies()).get("aiforce_cookie_choice")?.value;
  return <AuthForm mode="sign-up" initialCookieChoice={choice === "required" || choice === "declined" ? choice : "pending"} />;
}
