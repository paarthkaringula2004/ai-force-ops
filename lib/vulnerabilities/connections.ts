import {securityPolicy} from '@/lib/eassist/security';
import {db} from '@/lib/db';
import {seal,unseal,InputError,authorizeOrigin,validateBaseUrl} from '@/lib/eassist/transport';
import {fields,type Facts} from './schema';
import {saveReport} from './store';
export {InputError};
export type ToolConnection={id:string;user_id:string;name:string;kind:string;base_url:string;path:string;auth_type:string;username:string;header_name:string;secret_cipher:string;mapping:Record<string,string>;results_path:string;enabled:boolean};
function at(value:unknown,path:string):unknown{return path?path.split('.').reduce<unknown>((v,k)=>v&&typeof v==='object'&&Object.hasOwn(v,k)?(v as Record<string,unknown>)[k]:undefined,value):value;}
export function config(body:Record<string,unknown>,user:string):ToolConnection{
 const str=(k:string,n=2000)=>typeof body[k]==='string'?String(body[k]).trim().slice(0,n):'';
 const kind=str('kind');if(!['json','zap'].includes(kind))throw new InputError('Choose a JSON findings API or ZAP API.');
 const base_url=validateBaseUrl(str('base_url'));authorizeOrigin(base_url);
 const path=kind==='zap'?'/JSON/core/view/alerts/':str('path');
 if(!path.startsWith('/')||path.startsWith('//')||path.includes('..')||path.includes('?')||path.includes('#'))throw new InputError('Use an API path beginning with /, without a query or fragment.');
 const auth_type=str('auth_type');if(!['none','bearer','basic','api-key'].includes(auth_type))throw new InputError('Choose a supported authentication method.');
 const header_name=str('header_name',80)||'X-API-Key';if(!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(header_name)||/^(host|cookie|content-length|connection)$/i.test(header_name))throw new InputError('Invalid API key header.');
 const mapping=body.mapping&&typeof body.mapping==='object'&&!Array.isArray(body.mapping)?body.mapping as Record<string,string>:{};
 for(const [k,v] of Object.entries(mapping))if(!fields.some(f=>f[0]===k)||typeof v!=='string'||! /^[a-zA-Z0-9_.-]{0,160}$/.test(v))throw new InputError('Use dot-separated field paths for the mapping.');
 if(kind==='json'&&(!mapping.title||(!mapping.ip&&!mapping.dns)))throw new InputError('Map a finding title and an asset IP or hostname.');
 const results_path=kind==='zap'?'alerts':str('results_path',160);if(!/^[a-zA-Z0-9_.-]{0,160}$/.test(results_path))throw new InputError('Invalid results array path.');
 const name=str('name',80);if(!name)throw new InputError('Enter an integration name.');
 return {id:'',user_id:user,name,kind,base_url,path,auth_type,username:str('username',200),header_name,secret_cipher:seal(typeof body.secret==='string'?body.secret.slice(0,4000):''),mapping,results_path,enabled:true};
}
export async function collect(c:ToolConnection):Promise<Facts[]>{
 authorizeOrigin(c.base_url);const policy=await securityPolicy(c.user_id),origin=new URL(c.base_url);if(policy.require_https&&origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new InputError('HTTPS is required for remote scanner connections.',403);const secret=unseal(c.secret_cipher),headers:Record<string,string>={Accept:'application/json'};
 if(c.auth_type==='bearer')headers.Authorization='Bearer '+secret;
 if(c.auth_type==='basic')headers.Authorization='Basic '+Buffer.from(c.username+':'+secret).toString('base64');
 if(c.auth_type==='api-key')headers[c.header_name]=secret;
 if(c.kind==='zap'&&secret)headers['X-ZAP-API-Key']=secret;
 const response=await fetch(c.base_url+c.path,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new InputError('Scanner returned HTTP '+response.status+'. Check endpoint and credentials.',502);
 const reader=response.body?.getReader();if(!reader)throw new InputError('Empty scanner response.');let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000){await reader.cancel();throw new InputError('Scanner response exceeds 4 MB. Narrow its results.');}chunks.push(value);}
 let payload:unknown;try{payload=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new InputError('Scanner must return JSON.');}
 const rows=at(payload,c.results_path);if(!Array.isArray(rows)||rows.length>5000)throw new InputError('Expected a findings array with up to 5,000 rows.');
 const target=new URL(process.env.SECURITY_SCAN_TARGET_URL||'http://localhost:3000');
 const findings=rows.map((row:unknown)=>{
 if(!row||typeof row!=='object')throw new InputError('Each finding must be an object.');
 const r=row as Record<string,unknown>;let values:Record<string,string>;
 if(c.kind==='zap'){
 const url=String(r.url||'');if(!url.startsWith(target.origin+'/')&&url!==target.origin)throw new InputError('ZAP results must belong to the configured project target.');
 values={title:String(r.alert||r.name||''),dns:target.hostname,qid:'zap:'+String(r.pluginId||r.pluginid||r.alert||'')+':'+new URL(url).pathname+':'+String(r.param||''),severity:['Informational','Low','Medium','High'][Number(r.riskcode)]||String(r.risk||'Unknown'),url,solution:String(r.solution||''),evidence:String(r.evidence||''),vendorReference:String(r.reference||''),cwe:String(r.cweid||''),status:'Active'};
 }else values=Object.fromEntries(fields.map(([k])=>[k,String(at(row,c.mapping[k]||'__missing__')??'').slice(0,8000)]));
 if(!values.title||(!values.ip&&!values.dns))throw new InputError('The mapping produced a finding without a title or asset.');
 values.scanner=c.name;return {...Object.fromEntries(fields.map(([k])=>[k,String(values[k]||'').slice(0,8000)])),raw:{}} as Facts;
 });
 return c.kind==='zap'?[...new Map(findings.map(f=>[f.qid+'|'+f.dns,f])).values()]:findings;
}
export async function persistConnection(c:ToolConnection,facts:Facts[]){
 if(facts.length){const imported=(await db.query('INSERT INTO vulnerability_imports(user_id,filename,sheet,headers,rows) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id',[c.user_id,c.name+'.json','API',JSON.stringify(fields.map(f=>f[1])),JSON.stringify(facts.map(f=>fields.map(([k])=>f[k])))] )).rows[0];
 await saveReport(c.user_id,{id:imported.id,scope:'API  /  '+c.id,scannedAt:new Date().toISOString(),mapping:Object.fromEntries(fields.map(([k,label])=>[k,label]))});}
 await db.query("UPDATE platform_alerts SET state='resolved',updated_at=now() WHERE user_id=$1 AND source='review-center' AND event_key=$2 AND state<>'resolved'",[c.user_id,'security-connector:'+c.id]);
 await db.query("UPDATE security_tool_connections SET checked_at=now(),last_error='',sync_until=NULL WHERE id=$1",[c.id]);
}
export async function syncConnections(){
 const rows=await db.query("UPDATE security_tool_connections SET sync_until=now()+interval '2 minutes' WHERE id IN(SELECT id FROM security_tool_connections WHERE user_id IN (SELECT user_id FROM workspace_members WHERE active=true AND (role='admin' OR (role='manager' AND 'security'=ANY(permissions)))) AND enabled AND (sync_until IS NULL OR sync_until<now()) AND (checked_at IS NULL OR checked_at<now()-interval '10 seconds') ORDER BY checked_at NULLS FIRST FOR UPDATE SKIP LOCKED LIMIT 3) RETURNING *");
 for(const c of rows.rows){try{await persistConnection(c,await collect(c));}catch(e){const message=e instanceof InputError?e.message:'Scanner API unavailable. Check network access and credentials.';await db.query('UPDATE security_tool_connections SET last_error=$2,checked_at=now(),sync_until=NULL WHERE id=$1',[c.id,message]);await db.query("INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail,href) VALUES($1,'review-center',$2,'warning',$3,$4,'/service-review-center/eassist?view=automated-alerts') ON CONFLICT(user_id,source,event_key) DO UPDATE SET detail=excluded.detail,state=CASE WHEN platform_alerts.state='acknowledged' AND platform_alerts.detail=excluded.detail THEN 'acknowledged' ELSE 'active' END,updated_at=now()",[c.user_id,'security-connector:'+c.id,c.name+' synchronization failed',message]);}}
}
