import { createHash, randomBytes, randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { db } from "../db";
import { seal, unseal, InputError } from "../eassist/transport";
import { securityPolicy } from "../eassist/security";
import { workspaceAccess } from "../workspace-access";
import { permitted } from "../workspace-permissions";
import type { Operation } from "./catalog";
import { resolveProvider } from "./registry";
import { loadConnection, parseMappings, type Connection } from "./store";
import { external, awsHeaders, azureToken } from "./transport";

import { requireIntegrationAccess } from "./access";

export type ApprovalScope = { agentId?: string; graphHash?: string; nodeId?: string; bindingHash?:string };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const fingerprint=(c:Connection)=>hash(JSON.stringify([Object.entries(c.config).sort(),Object.entries(c.secrets).sort(),c.enabled,c.revision]));
export async function requireIntegrationAdmin(user: string) {
  if (!permitted(await workspaceAccess(user),"admin")) throw new InputError("Administrator access is required for integration operations.",403);
}
export function fill(template: string, values: Record<string,unknown>, path = true) {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,k)=> {
    const v=values[k];if(!["string","number"].includes(typeof v))throw new InputError(`Provide ${k}.`);
    const s=String(v);if(s.length>1000 || s === "." || s === ".." || /[\r\n\\]/.test(s))throw new InputError(`Invalid ${k}.`);
    return path ? encodeURIComponent(s) : s;
  });
}
export async function integrationCapabilities(user: string, provider: string) {
  await requireIntegrationAccess(user,provider);
  const p=await resolveProvider(user,provider);if(!p)throw new InputError("Integration is unavailable or deleted.",404);
  const c=await loadConnection(user,provider);
  const operations=p.custom && c?.config.mapping ? parseMappings(c.config.mapping) : p.operations;
  return { provider:p.name, configured:!!c, enabled:!!c?.enabled, operations:operations.map(o=>({id:o.id,label:o.label,requiresApproval:!!o.write,example:o.example || {}})), guidance:!c ? "Configure this provider in Tool Library → Integration catalog. No live data is available." : !c.enabled ? "This connection is disabled." : "Operations use current source responses. Saved configuration alone does not prove source access. operation=monitor_snapshot retrieves recorded polling evidence, if configured." };
}
async function ready(user:string,provider:string,operation:string) {
  await requireIntegrationAccess(user,provider);
  const p=await resolveProvider(user,provider);if(!p)throw new InputError("Integration is unavailable or deleted.",404);
  const c=await loadConnection(user,provider);if(!c?.enabled)throw new InputError(`${p.name} is not configured or enabled. Open Tool Library → Integration catalog.`,409);
  const operations=p.custom ? parseMappings(c.config.mapping) : p.operations;
  const op=operations.find(o=>o.id===operation);if(!op)throw new InputError("Choose one of this connection's configured operations.");
  const policy=await securityPolicy(user);
  if(!policy.allow_runs)throw new InputError("Integration execution is disabled by organization policy.",403);
  if(op.write&&!policy.allow_writes)throw new InputError("External changes are disabled by organization policy.",403);
  if(op.method==="DELETE"&&!policy.allow_deletes)throw new InputError("External deletion is disabled by organization policy.",403);
  return {p,c,op};
}
export async function prepareIntegration(user:string,provider:string,operation:string,inputs:Record<string,unknown>,scope:ApprovalScope={}) {
  const {c,op}=await ready(user,provider,operation);
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs) || JSON.stringify(inputs).length>64000)throw new InputError("Provide an input object under 64 KB.");
  // Validate placeholders before issuing a preview; bodies remain literal provider payloads.
  fill(op.path,{...c.config,...inputs});
  if(op.form)for(const v of Object.values(op.form))fill(v,{...c.config,...inputs},false);
  if (!op.write) return execute(user,provider,op,c,inputs);
  const token=randomBytes(32).toString("base64url");
  await db.query("INSERT INTO integration_approvals(token_hash,user_id,provider,revision,connection_hash,operation,inputs_cipher,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[hash(token),user,provider,c.revision,fingerprint(c),operation,seal(JSON.stringify(inputs)),JSON.stringify(scope)]);
  const destination={baseUrl:c.config.baseUrl||undefined,region:c.config.region||undefined,subscriptionId:c.config.subscriptionId||undefined,path:fill(op.path,{...c.config,...inputs}),form:op.form?Object.fromEntries(Object.entries(op.form).map(([k,v])=>[k,fill(v,{...c.config,...inputs},false)])):undefined};
  return {status:"awaiting_approval",token:`integration.${token}`,provider,operation,method:op.method,inputs,destination,message:"Review this exact operation. Nothing has been sent. Approval expires in 10 minutes."};
}
export async function approveIntegration(user:string,token:string,scope:ApprovalScope={}) {
  await requireIntegrationAccess(user);
  if(!/^integration\.[A-Za-z0-9_-]{43}$/.test(token))throw new InputError("Invalid approval token.");
  const digest=hash(token.slice("integration.".length));
  const pending=(await db.query("SELECT * FROM integration_approvals WHERE user_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now()",[user,digest])).rows[0];
  if(!pending || JSON.stringify(pending.context)!==JSON.stringify(scope)) {
    // JSONB key order differs from JSON serialization, so compare explicitly.
    if(!pending || ["agentId","graphHash","nodeId","bindingHash"].some(k=>pending.context[k]!==scope[k as keyof ApprovalScope]))throw new InputError("Approval expired, already used, or the agent changed.",409);
  }
  const {c,op}=await ready(user,pending.provider,pending.operation);
  if(c.revision!==pending.revision||fingerprint(c)!==pending.connection_hash)throw new InputError("The connection changed. Prepare a new preview.",409);
  const consumed=await db.query(`UPDATE integration_approvals SET consumed_at=now() WHERE user_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now() AND EXISTS(SELECT 1 FROM integration_connections WHERE user_id=$1 AND provider=$3 AND revision=$4 AND enabled=true) RETURNING token_hash`,[user,digest,pending.provider,c.revision]);
  if(!consumed.rowCount)throw new InputError("Approval was already used or the connection changed.",409);
  return execute(user,pending.provider,op,c,JSON.parse(unseal(pending.inputs_cipher)));
}
async function execute(user:string,provider:string,op:Operation,c:Connection,inputs:Record<string,unknown>) {
  const id=randomUUID();
  const policy=await securityPolicy(user),client=await db.connect();
  try {
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`integration-execution:${user}`]);
    const running=(await client.query("SELECT count(*)::integer AS count FROM integration_executions WHERE user_id=$1 AND status='running' AND created_at>now()-interval '3 minutes'",[user])).rows[0]?.count||0;
    if(running>=policy.max_concurrent)throw new InputError("The integration concurrency limit has been reached. Retry after current operations finish.",409);
    await client.query("INSERT INTO integration_executions(id,user_id,provider,operation,status,summary) VALUES($1,$2,$3,$4,'running',$5)",[id,user,provider,op.id,op.write?"Approved external change started":"Read started"]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  try {
    const result=await dispatch(provider,op,c,inputs,user,id);
    await db.query("UPDATE integration_executions SET status='completed',summary=$2 WHERE id=$1",[id,op.write?"Source accepted operation; see result for asynchronous completion or delivery status":"Source response received"]);
    return {status:"completed",executionId:id,provider,operation:op.id,connectionRevision:c.revision,checkedAt:new Date().toISOString(),result};
  } catch(error) {
    const message=error instanceof InputError?error.message:"Source response could not be processed. Check the connection and source before retrying.";
    await db.query("UPDATE integration_executions SET status=$2,summary=$3 WHERE id=$1",[id,op.write?"unknown":"failed",message]);
    throw new InputError(message,error instanceof InputError?error.status:502);
  }
}
async function dispatch(provider:string,op:Operation,c:Connection,inputs:Record<string,unknown>,user:string,id:string):Promise<unknown> {
  const p=await resolveProvider(user,provider);if(!p)throw new InputError("Integration is unavailable or deleted.",404);
  const adapter=p.adapter||provider;
  if(adapter==="dnr_mail") {
    const {mailConfigured,queueMail,validMailAddress}=await import("../mail");
    if(op.id==="status")return {configured:mailConfigured(),mode:"queued_notifications",delivery:"Mail Center tracks actual delivery"};
    if(!mailConfigured())throw new InputError("Configure the existing project email service first.",409);
    if(typeof inputs.to!=="string"||!validMailAddress(inputs.to)||typeof inputs.subject!=="string"||!inputs.subject.trim()||inputs.subject.length>200||typeof inputs.text!=="string"||!inputs.text.trim())throw new InputError("Provide recipient, subject and message text.");
    const mailId=await queueMail("notification",inputs.to,{subject:inputs.subject,text:inputs.text,html:""},`integration:${id}`,{actor:user});
    if(!mailId)throw new InputError("Notification was not queued. Check the recipient and mail configuration.",409);
    return {mailId,status:"queued",delivered:false};
  }
  if(adapter==="azure_mcp")return mcp(c,op,inputs);
  let base=c.config.baseUrl || "", region=c.config.region;
  const service=({connect:"connect",lambda:"lambda",ses:"ses",cost:"ce",ec2:"ec2"} as Record<string,string>)[adapter];
  if(p.auth==="aws") {
    if(adapter==="cost")region="us-east-1";
    const hostService=adapter==="ses"?"email":service;
    base=adapter==="cost"?"https://ce.us-east-1.amazonaws.com":`https://${hostService}.${region}.amazonaws.com`;
  }
  if(p.auth==="azure")base=adapter==="entra"?"https://graph.microsoft.com":"https://management.azure.com";
  const path=fill(op.path,{...c.config,...inputs});
  let url=new URL(`${base}${path}`);
  if(adapter==="web") {
    const page=inputs.path===undefined?"":inputs.path;
    if(typeof page!=="string"||page.length>2000||/^[a-z]+:|^\/\/|[\\\r\n]/i.test(page))throw new InputError("Provide a relative page path on the configured website.");
    url=new URL(page,`${base}/`);
  }
  if(url.origin!==new URL(base).origin)throw new InputError("Operation escaped its configured origin.");
  const headers:Record<string,string>={accept:"application/json",...op.headers,"content-type":op.contentType||"application/json"};
  let body=inputs.body===undefined?undefined:JSON.stringify(inputs.body);
  if(op.contentType&&["text/plain","text/xml","application/xml"].includes(op.contentType)) {if(typeof inputs.rawBody!=="string"&&op.method!=="GET")throw new InputError("Provide rawBody as text for this operation.");body=inputs.rawBody as string|undefined;}
  if(op.form) {body=new URLSearchParams(Object.fromEntries(Object.entries(op.form).map(([k,v])=>[k,fill(v,{...c.config,...inputs},false)]))).toString();headers["content-type"]="application/x-www-form-urlencoded";}
  else if(op.contentType==="application/x-www-form-urlencoded"&&op.method!=="GET") {
    if(!inputs.body||typeof inputs.body!=="object"||Array.isArray(inputs.body)||Object.values(inputs.body).some(v=>!["string","number","boolean"].includes(typeof v)))throw new InputError("Form operations require a body object of text, number or boolean values.");
    body=new URLSearchParams(Object.entries(inputs.body).map(([k,v])=>[k,String(v)])).toString();
  }
  if(adapter==="bigfix"&&op.write){if(typeof inputs.xml!=="string"||!inputs.xml.startsWith("<"))throw new InputError("Supply valid action XML.");body=inputs.xml;headers["content-type"]="application/xml";}
  if(op.target){headers["x-amz-target"]=op.target;headers["content-type"]="application/x-amz-json-1.1";}
  if(adapter==="qualys")headers["x-requested-with"]="AIForce.Ops";
  if(p.auth==="basic")headers.authorization=`Basic ${Buffer.from(`${c.config.username}:${c.secrets.password}`).toString("base64")}`;
  if(p.auth==="bearer"||p.auth==="mapped")headers[c.config.authHeader||"Authorization"]=`${c.config.authPrefix===undefined?"Bearer ":c.config.authPrefix}${c.secrets.token}`;
  if(p.auth==="azure")headers.authorization=`Bearer ${await azureToken(c,adapter==="entra")}`;
  if(p.auth==="oauth2"){
    const token=await external(new URL(c.config.tokenUrl),"POST",{"content-type":"application/x-www-form-urlencoded"},new URLSearchParams({grant_type:"client_credentials",client_id:c.config.clientId,client_secret:c.secrets.clientSecret,...(c.config.scope?{scope:c.config.scope}:{})}).toString());
    let data;try{data=JSON.parse(token.content);}catch{throw new InputError("OAuth endpoint returned an invalid token response.",502);}
    if(typeof data.access_token!=="string"||!data.access_token)throw new InputError("OAuth endpoint did not issue an access token.",502);
    headers.authorization=`Bearer ${data.access_token}`;
  }
  const signed=p.auth==="aws"?awsHeaders(url,op.method,body||"",headers,c,service,region):headers;
  const {response,content}=await external(url,op.method,signed,body);
  if(adapter==="web") {
    // Do not return scripts/styles or execute remote HTML in the application.
    const text=content.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,24000);
    return {url:url.toString(),text,contentType:response.headers.get("content-type"),untrusted:true};
  }
  let data:unknown=null;
  if(content.trim().startsWith("<")) {
    if(/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(content))throw new InputError("Source XML contains unsupported entity declarations.",502);
    if(/<(?:html|!doctype html)\b/i.test(content))throw new InputError("The source returned a web page instead of an API response. Check the API URL and authentication.",502);
    data=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(content.replace(/<!DOCTYPE[^>]*>/gi,""));
    if(adapter==="qualys" && data && typeof data==="object" && "SIMPLE_RETURN" in data && JSON.stringify(data).includes('"CODE"'))throw new InputError("Qualys returned an API error. Check entitlement, credentials and scan inputs.",502);
  }
  else if(content.trim()) {try {data=JSON.parse(content);}catch{data={text:content.slice(0,24000)};}}
  return {httpStatus:response.status,data,requestId:response.headers.get("x-amzn-requestid")||response.headers.get("x-ms-request-id"),asynchronous:response.status===202,scope:"One source page; pagination links are evidence only and are not automatically followed."};
}
async function mcp(c:Connection,op:Operation,inputs:Record<string,unknown>) {
  const headers:Record<string,string>={accept:"application/json, text/event-stream","content-type":"application/json",authorization:`Bearer ${c.secrets.token}`};
  const call=async(method:string,params:unknown,notification=false)=> {
    const {response,content}=await external(new URL(c.config.baseUrl),"POST",headers,JSON.stringify({jsonrpc:"2.0",...(notification?{}:{id:randomUUID()}),method,params}));
    const session=response.headers.get("mcp-session-id");if(session)headers["mcp-session-id"]=session;
    if(!content)return null;
    const raw=content.trim().startsWith("data:")||content.includes("\ndata:")?content.split(/\r?\n/).filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trim()).filter(Boolean).at(-1)||"{}":content;
    const data=JSON.parse(raw);if(data.error)throw new InputError("MCP server rejected this operation. Check the tool name and arguments.",502);return data.result;
  };
  const initialized=await call("initialize",{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"AIForce.Ops",version:"1.0.0"}});
  headers["MCP-Protocol-Version"]=initialized?.protocolVersion || "2025-03-26";
  await call("notifications/initialized",{},true);
  try {
    if(op.id==="tools")return await call("tools/list",{});
    if(typeof inputs.toolName!=="string"||!inputs.toolName.trim())throw new InputError("Provide an MCP tool name.");
    const result=await call("tools/call",{name:inputs.toolName,arguments:inputs.arguments||{}});
    if(result?.isError)throw new InputError("The MCP tool reported an execution error. Inspect the source before retrying a change.",502);
    return result;
  } finally {
    if(headers["mcp-session-id"])await external(new URL(c.config.baseUrl),"DELETE",headers).catch(()=>undefined);
  }
}
