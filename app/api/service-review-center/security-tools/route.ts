import {db} from '@/lib/db';
import {getRequestSession} from '@/lib/organization-session';
import {requireSameOrigin,IngestionError} from '@/lib/service-review/ingestion';
import {boundedJson} from '@/lib/epace/runtime';
import {config,collect,persistConnection,InputError} from '@/lib/vulnerabilities/connections';
export const runtime='nodejs';
export async function GET(request:Request){const user=(await getRequestSession(request))?.user?.id;if(!user)return Response.json({error:'Sign in required.'},{status:401});try{return Response.json({connections:(await db.query('SELECT id,name,kind,base_url,path,enabled,checked_at,last_error FROM security_tool_connections WHERE user_id=$1 ORDER BY created_at',[user])).rows},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Integration storage unavailable.'},{status:503});}}
export async function POST(request:Request){const user=(await getRequestSession(request))?.user?.id;if(!user)return Response.json({error:'Sign in required.'},{status:401});try{requireSameOrigin(request);const body=await boundedJson(request,12000);
 if(body.action==='toggle'){if(typeof body.enabled!=='boolean'||typeof body.id!=='string'||! /^[0-9a-f-]{36}$/i.test(body.id))throw new InputError('Invalid integration.');const changed=await db.query('UPDATE security_tool_connections SET enabled=$3 WHERE id=$1 AND user_id=$2 RETURNING id',[body.id,user,body.enabled]);if(!changed.rowCount)throw new InputError('Integration not found.',404);return Response.json({ok:true});}
 if((await db.query('SELECT count(*)::int AS count FROM security_tool_connections WHERE user_id=$1',[user])).rows[0].count>=10)throw new InputError('Up to 10 scanner API connections per account.');
 const c=config(body,user),facts=await collect(c);
 if(body.action==='test')return Response.json({ok:true,count:facts.length});
 if(body.action!=='save')throw new InputError('Choose test or save.');
 const inserted=await db.query('INSERT INTO security_tool_connections(user_id,name,kind,base_url,path,auth_type,username,header_name,secret_cipher,mapping,results_path) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING id',[user,c.name,c.kind,c.base_url,c.path,c.auth_type,c.username,c.header_name,c.secret_cipher,JSON.stringify(c.mapping),c.results_path]);c.id=inserted.rows[0].id;await persistConnection(c,facts);return Response.json({ok:true,id:c.id,count:facts.length});
 }catch(e){const known=e instanceof InputError||e instanceof IngestionError;return Response.json({error:known?e.message:'Could not connect to the scanner. Check API availability and credentials.'},{status:known?e.status:503});}}
