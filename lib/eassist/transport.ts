import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class InputError extends Error { constructor(message: string, public status = 400) { super(message); } }
export class UpstreamError extends Error { constructor(message: string, public definitive = false) { super(message); } }
function key() {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error('Credential encryption is not configured.');
  return createHash('sha256').update(`eassist:v1:${process.env.BETTER_AUTH_SECRET}`).digest();
}
export function seal(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v=>v.toString('base64url')).join('.');
}
export function unseal(value: string) {
  if (!value) return '';
  const [iv, tag, data] = value.split('.').map(v=>Buffer.from(v,'base64url'));
  const decipher = createDecipheriv('aes-256-gcm',key(),iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
export function validateBaseUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new InputError('Enter a valid connection URL.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new InputError('Use an HTTP(S) base URL without embedded credentials, a query, or a fragment.');
  return url.toString().replace(/\/$/, '');
}
export function authorizeOrigin(value: string) {
  const url = new URL(validateBaseUrl(value));
  const allowed = (process.env.EASSIST_ALLOWED_ORIGINS || '').split(',').map(v=>v.trim()).filter(Boolean);
  if (!allowed.includes(url.origin)) throw new InputError(`This connection's origin must be added to EASSIST_ALLOWED_ORIGINS on the server before it can be contacted.`,403);
}
export type PrivateConnection = { id: string; user_id: string; name: string; kind: string; base_url: string; project_id: string; auth_type: string; username: string; secret_cipher: string; enabled: boolean; state: string; webhook_hash: string|null };
export async function remote(c: PrivateConnection, path: string, method = 'GET', body?: unknown) {
  const {securityPolicy}=await import('./security');
  const policy=await securityPolicy(c.user_id);
  if(policy.require_https&&!c.base_url.startsWith('https://'))throw new InputError('HTTPS is required by Security configurations.',403);
  authorizeOrigin(c.base_url);
  if (!c.enabled) throw new InputError('Enable this integration before using it.');
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new InputError('Invalid integration path.');
  const secret = unseal(c.secret_cipher);
  const headers: Record<string,string> = { Accept: 'application/json', 'Content-Type':'application/json' };
  if (c.auth_type === 'bearer' && secret) headers.Authorization = `Bearer ${secret}`;
  if (c.auth_type === 'basic') headers.Authorization = `Basic ${Buffer.from(`${c.username}:${secret}`).toString('base64')}`;
  try {
    const response = await fetch(`${c.base_url}${path}`,{method,headers,body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new UpstreamError(`${c.name} returned HTTP ${response.status}. Check credentials, permissions, and the submitted fields in the source system.`,response.status>=400 && response.status<500);
    if (response.status===204) return null;
    const reader = response.body?.getReader(); let size=0; const chunks: Uint8Array[]=[];
    if (!reader) return null;
    while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>8*1024*1024){await reader.cancel();throw new UpstreamError('The integration response exceeds the 8 MB limit. Narrow the source scope.');} chunks.push(value); }
    const content=Buffer.concat(chunks).toString('utf8');
    if (!content) return null;
    try { return JSON.parse(content) as unknown; } catch { throw new UpstreamError('The integration returned an unexpected response. Check its API base URL.'); }
  } catch(error) {
    if(error instanceof InputError || error instanceof UpstreamError) throw error;
    throw new UpstreamError(`${c.name} could not be reached or timed out. For write requests, check the source system before retrying.`);
  }
}
export function externalId(value: unknown) {
  const id=String(value ?? '');
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new InputError('Invalid source record ID.');
  return id;
}
export function projectPath(c: PrivateConnection) {return `/api/project/${externalId(c.project_id)}`;}
export async function boundedJson(request: Request) {
  const reader=request.body?.getReader(); if(!reader)throw new InputError('A JSON body is required.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512*1024){await reader.cancel();throw new InputError('Request exceeds 512 KB.',413);}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new InputError('Invalid JSON.');}
}
