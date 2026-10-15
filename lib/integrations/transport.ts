import { createHash, createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { InputError } from "../eassist/transport";
import type { Connection } from "./store";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const mac = (k: string | Buffer, v: string) => createHmac("sha256", k).update(v).digest();
export function awsHeaders(url: URL, method: string, body: string, headers: Record<string,string>, c: Connection, service: string, region: string, now = new Date()) {
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), day = date.slice(0,8);
  const h: Record<string,string> = { ...headers, host: url.host, "x-amz-date": date, "x-amz-content-sha256": sha(body) };
  if (c.secrets.sessionToken) h["x-amz-security-token"] = c.secrets.sessionToken;
  const keys = Object.keys(h).sort();
  const encode = (v:string) => encodeURIComponent(v).replace(/[!'()*]/g, x=>`%${x.charCodeAt(0).toString(16).toUpperCase()}`);
  const query = [...url.searchParams].map(([k,v])=>[encode(k),encode(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(([k,v])=>`${k}=${v}`).join("&");
  const path = url.pathname.split("/").map(v=>encode(decodeURIComponent(v))).join("/");
  const canonical = [method,path,query,keys.map(k=>`${k}:${h[k].trim().replace(/\s+/g," ")}\n`).join(""),keys.join(";"),sha(body)].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const signature = mac(mac(mac(mac(`AWS4${c.secrets.secretAccessKey}`,day),region),service),"aws4_request");
  h.authorization = `AWS4-HMAC-SHA256 Credential=${c.secrets.accessKeyId}/${scope}, SignedHeaders=${keys.join(";")}, Signature=${mac(signature,`AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(canonical)}`).toString("hex")}`;
  return h;
}
export function privateAddress(address: string): boolean {
  const a = address.toLowerCase();
  if (isIP(a) === 6) return !(a.startsWith("2") || a.startsWith("3")); // Public global-unicast only; blocks mapped IPv4, ULA and link-local.
  if (isIP(a) !== 4) return true;
  const [x,y] = a.split(".").map(Number);
  return x === 0 || x === 10 || x === 127 || x >= 224 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) || (x === 192 && [0,168].includes(y)) || (x === 100 && y >= 64 && y <= 127) || (x === 198 && [18,19].includes(y));
}
export async function authorizeDestination(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password) throw new InputError("Only approved HTTPS destinations are supported.");
  const explicit = (process.env.EASSIST_ALLOWED_ORIGINS || "").split(",").map(v=>v.trim());
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!explicit.includes(url.origin) && (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal"))) throw new InputError("Private lab destinations require an administrator server allowlist.",403);
  const addresses = isIP(hostname) ? [{address:hostname}] : await lookup(hostname,{all:true});
  if (!addresses.length || (!explicit.includes(url.origin) && addresses.some(a=>privateAddress(a.address)))) throw new InputError("Private destinations require an administrator server allowlist.",403);
  return addresses.map(a=>({address:a.address,family:isIP(a.address)}));
}
export async function external(url: URL, method: string, headers: Record<string,string>, body?: string) {
  const addresses=await authorizeDestination(url);
  // Pin the validated DNS answer while retaining TLS hostname validation. No redirects.
  return new Promise<{response:Response;content:string}>((resolve,reject)=>{
    const req=httpsRequest(url,{method,headers:{"user-agent":"AIForce.Ops/1.0",...headers},lookup:(_host,options,callback)=>options.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family),signal:AbortSignal.timeout(20000)},res=>{
      const status=res.statusCode||502;
      if(status<200||status>=300){res.resume();reject(new InputError(`Source returned HTTP ${status}. Check API URL, entitlement, permissions and inputs.${status===429?" Rate limited; retry later.":""}`,502));return;}
      const chunks:Buffer[]=[];let size=0;
      res.on("data",chunk=>{const b=Buffer.from(chunk);size+=b.length;if(size>2*1024*1024){req.destroy();reject(new InputError("Response exceeds 2 MB. Narrow the requested scope.",502));}else chunks.push(b);});
      res.on("error",()=>reject(new InputError("Source response was interrupted. Inspect the source before retrying a change.",502)));
      res.on("end",()=>{
        const resultHeaders=new Headers();for(const [k,v] of Object.entries(res.headers))if(v!==undefined)resultHeaders.set(k,Array.isArray(v)?v.join(", "):v);
        resolve({response:new Response(null,{status,headers:resultHeaders}),content:Buffer.concat(chunks).toString("utf8")});
      });
    });
    req.on("error",()=>reject(new InputError("The source could not be reached. For changes, inspect the source before retrying; completion is unknown.",502)));
    if(method!=="GET"&&body!==undefined)req.write(body);req.end();
  });
}
export async function azureToken(c: Connection, graph: boolean) {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(c.config.tenantId)}/oauth2/v2.0/token`);
  const {content}=await external(url,"POST",{"content-type":"application/x-www-form-urlencoded"},new URLSearchParams({grant_type:"client_credentials",client_id:c.config.clientId,client_secret:c.secrets.clientSecret,scope:`${graph ? "https://graph.microsoft.com" : "https://management.azure.com"}/.default`}).toString());
  const result=JSON.parse(content);if(typeof result.access_token!=="string")throw new InputError("Microsoft did not issue an access token.",502);
  return result.access_token as string;
}
