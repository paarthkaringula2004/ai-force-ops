import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Json } from '@/lib/eassist/types';

export function endpointHost(value: unknown): string {
 if(typeof value!=='string'||value.length>2048)return '';
 const raw=value.trim();
 if(isIP(raw))return raw;
 try {
  const url=new URL(raw.includes('://')?raw:`https://${raw}`);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
  const hostname=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  return /^[a-z0-9.:_-]+$/i.test(hostname)?hostname:'';
 }catch{return '';}
}
export function publicAddress(ip: string): boolean {
 if(isIP(ip)===6){
  const prefix=parseInt(ip.split(':')[0],16);
  return prefix>=0x2000&&prefix<=0x3fff&&!/^2001:(db8|0|2|10|20):/i.test(ip);
 }
 if(isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===192&&b===88&&c===99||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
}
export function enrichmentInput(payload: Json) {
 return {host:endpointHost(payload.endpoint||payload.device),category:String(payload.category||''),site:String(payload.site||''),country:String(payload.country||''),vendor:String(payload.vendor||''),ipAddress:String(payload.ipAddress||'')};
}
export const enrichmentHash=(value: unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function applyEnrichment(payload: Json, data: Json): Json {
 return {...payload,
  ipAddress:payload.ipAddress||data.ipAddress||'Not resolved',
  site:payload.site||data.site||'Not reported',
  country:payload.country||data.country||'Not reported',
  vendor:payload.vendor||data.vendor||'Not reported',
  description:data.aiDescription||payload.description||'Description pending',
  operationalError:payload.operationalError||payload.description||'',
  enrichment:{state:data.state||'pending',checkedAt:data.checkedAt||null,geoCheckedAt:data.geoCheckedAt||null,aiGeneratedAt:data.aiGeneratedAt||null,descriptionSource:data.aiDescription?'OpenAI':'Source',model:data.model||null,error:data.error||'',geographySource:payload.country?'Source labels':data.geoCheckedAt?'ipwho.is · public endpoint estimate':'Not available',siteSource:payload.site?'Source labels':'Endpoint / IP estimate',vendorSource:payload.vendor?'Source labels':data.vendor?'IP network owner':'Not available',addresses:data.addresses||[]}
 };
}
