import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/request-session";
import EpaceWorkspace from "./workspace";
export const metadata = {
  title: "ePACE | AIForce.Ops",
  description:
    "Cognitive platform lifecycle, knowledge, observability and governance.",
};
export default async function Page() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/sign-in");
  return (
    <EpaceWorkspace
      userName={session.user.name || session.user.email}
      userId={session.user.id}
    />
  );
}
