import {randomUUID} from 'node:crypto';
import {db} from './db';
import {builtinTools} from './builtin-project-tool-settings';
import {projectBindings,providerOperations} from './integrations/project-tools';
import {InputError} from './eassist/transport';
import {organizationWriteAllowed} from './organization-security';
import type {WorkspaceAccess} from './workspace-permissions';

export type PlaygroundTool={id:string;source_kind:string;reference_id:string;name:string;purpose:string;enabled:boolean;shared_roles?:string[];owner_user_id?:string;shared?:boolean};
export type PlaygroundSource={kind:string;id:string;name:string;purpose:string;available:boolean;status:string};
export async function playgroundToolSources(user:string,member:WorkspaceAccess):Promise<PlaygroundSource[]>{
 if(!member.active)throw new InputError('Active account required.',403);
 const [builtin,custom]=await Promise.all([builtinTools(user),db.query<{id:string;name:string;purpose:string;method:string;endpoint_url:string}>('SELECT id,name,purpose,method,endpoint_url FROM tools WHERE user_id=$1 ORDER BY name',[user])]);
 const safe=member.role==='admin'?['profile','requests','meeting_rooms','scan_reports','service_health','incidents']:['profile','requests','meeting_rooms'];
 const result:PlaygroundSource[]=[{kind:'department',id:'department_search',name:'Department Search',purpose:'Find whether a department exists by exact name, or list company departments. Read-only; available to every active role.',available:true,status:'Built-in company catalog search'},...builtin.filter(t=>safe.includes(t.id)).map(t=>({kind:'builtin',id:t.id,name:t.name,purpose:t.capabilityPurpose,available:t.enabled,status:t.enabled?'Workspace read':'NULL — enable this project tool first'})),...custom.rows.filter(t=>t.method==='GET').map(t=>({kind:'tool',id:t.id,name:t.name,purpose:t.purpose+' URL inputs (provide as JSON): '+((t.endpoint_url||'').replace(/%7B/gi,'{').replace(/%7D/gi,'}').match(/\{[A-Za-z][A-Za-z0-9_]*\}/g)?.join(', ')||'none'),available:true,status:'GET API; server origin allowlist required. Use a project integration tool for credentials.'}))];
 if(member.role==='admin'){
  const [bindings,providers]=await Promise.all([projectBindings(user),providerOperations(user)]);
  for(const t of bindings){const p=providers.find(p=>p.id===t.provider),op=p?.operations.find(o=>o.id===t.operation);if(op&&!op.write)result.push({kind:'project',id:t.id,name:t.name,purpose:t.purpose,available:!!p?.configured,status:p?.configured?'Read operation through saved integration':'NULL — configure the linked integration'});}
 }
 return result;
}
export function shareablePlaygroundSource(kind:string,id:string){
 return kind==='department'||kind==='tool'||kind==='builtin'&&['profile','requests','meeting_rooms'].includes(id);
}
export async function listPlaygroundTools(user:string,member?:WorkspaceAccess){
 if(!member)return (await db.query<PlaygroundTool>('SELECT id,source_kind,reference_id,name,purpose,enabled,shared_roles FROM playground_tool_connections WHERE user_id=$1 ORDER BY updated_at DESC',[user])).rows;
 if(!member.active)return [];
 // Recheck both memberships here: disabling/demoting the sharing Admin revokes the grant.
 return (await db.query<PlaygroundTool>(`SELECT c.id,c.source_kind,c.reference_id,c.name,c.purpose,c.enabled,c.shared_roles,c.user_id AS owner_user_id,(c.user_id<>$1) AS shared
 FROM playground_tool_connections c
 JOIN workspace_members owner ON owner.user_id=c.user_id
 JOIN workspace_members recipient ON recipient.user_id=$1
 WHERE recipient.active=true AND (c.user_id=$1 OR (c.enabled=true AND owner.active=true AND owner.role='admin' AND recipient.role=ANY(c.shared_roles)
 AND (c.source_kind IN ('department','tool') OR (c.source_kind='builtin' AND c.reference_id IN ('profile','requests','meeting_rooms')))))
 ORDER BY c.updated_at DESC,c.id`,[user])).rows;
}
export async function playgroundConnectionSources(user:string,member:WorkspaceAccess,connections:PlaygroundTool[]){
 const owners=new Map<string,Promise<PlaygroundSource[]>>();
 const result=new Map<string,PlaygroundSource>();
 for(const c of connections){
  const owner=c.owner_user_id||user;
  if(c.shared&&!shareablePlaygroundSource(c.source_kind,c.reference_id))continue;
  if(!owners.has(owner))owners.set(owner,(async()=>{
   const access=owner===user?member:(await db.query<WorkspaceAccess>('SELECT * FROM workspace_members WHERE user_id=$1',[owner])).rows[0];
   if(!access?.active||owner!==user&&access.role!=='admin')return [];
   return playgroundToolSources(owner,access);
  })());
  const source=(await owners.get(owner)!).find(s=>s.kind===c.source_kind&&s.id===c.reference_id);
  if(source)result.set(c.id,source);
 }
 return result;
}
export async function savePlaygroundTool(user:string,member:WorkspaceAccess,value:Record<string,unknown>){
 if(!member.active)throw new InputError('Active account required.',403);
 if(typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>100||typeof value.purpose!=='string'||!value.purpose.trim()||value.purpose.length>2000||typeof value.enabled!=='boolean')throw new InputError('Enter a name, usage instructions under 2,000 characters and an enabled state.');
 const roles=value.sharedRoles??[];
 if(!Array.isArray(roles)||roles.some(r=>!['manager','employee','user'].includes(r)))throw new InputError('Choose Manager, Employee or User for sharing.');
 if(roles.length&&member.role!=='admin')throw new InputError('Only Admins can share Playground tools with roles.',403);
 if(roles.length&&!shareablePlaygroundSource(String(value.sourceKind),String(value.referenceId)))throw new InputError('This source requires Admin permissions and cannot be shared with other roles. Share a department, personal workspace read or GET API tool.',403);
 const sharedRoles=[...new Set(roles)];
 const source=(await playgroundToolSources(user,member)).find(s=>s.kind===value.sourceKind&&s.id===value.referenceId);
 if(!source)throw new InputError('Choose an accessible read/search tool. Write tools use their existing approval screens.',403);
 const client=await db.connect();
 try{
  await client.query('BEGIN');await organizationWriteAllowed(user,client);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['playground-tools:'+user]);
  const rows=(await client.query<PlaygroundTool>('SELECT id,source_kind,reference_id FROM playground_tool_connections WHERE user_id=$1',[user])).rows;
  const existing=rows.find(r=>r.source_kind===source.kind&&r.reference_id===source.id);
  if(!existing&&rows.length>=20)throw new InputError('Connect up to 20 Playground tools. Remove an unused connection first.');
  await client.query('INSERT INTO playground_tool_connections(id,user_id,source_kind,reference_id,name,purpose,enabled,shared_roles) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,source_kind,reference_id) DO UPDATE SET name=excluded.name,purpose=excluded.purpose,enabled=excluded.enabled,shared_roles=excluded.shared_roles,updated_at=now()',[existing?.id??randomUUID(),user,source.kind,source.id,value.name.trim(),value.purpose.trim(),value.enabled,sharedRoles]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
