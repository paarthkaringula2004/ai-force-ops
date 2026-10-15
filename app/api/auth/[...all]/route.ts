import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
const handlers=toNextJsHandler(auth);
export const GET=handlers.GET;
export async function POST(request:Request) {
 const response=await handlers.POST(request);
 if([401,403,429].includes(response.status))await (await import('@/lib/organization-security')).recordAuthResult(request,response.status);
 return response;
}
