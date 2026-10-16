import { randomUUID } from "node:crypto";
import { db } from "../db";
import { InputError } from "../eassist/transport";
import { integrationCatalog, providerById, type Provider } from "./catalog";

import { integrationAccess } from "./access";

export async function listProviders(user:string,includeDeleted=false):Promise<Provider[]> {
 const rows=(await db.query("SELECT id,definition,deleted_at FROM integration_definitions WHERE user_id=$1",[user])).rows;
 const overrides=new Map(rows.map(r=>[r.id,r]));
 const access=await integrationAccess(user);
 const shared=[...new Map(access.grants.filter(g=>g.definition&&!overrides.get(g.provider)?.definition).map(g=>[g.provider,g.definition as Provider])).values()];
 return [...integrationCatalog.filter(p=>includeDeleted||!overrides.get(p.id)?.deleted_at||(!access.admin&&access.grants.some(g=>g.provider===p.id))),...rows.filter(r=>r.definition&&(includeDeleted||!r.deleted_at)).map(r=>r.definition as Provider),...shared].filter(p=>access.admin||access.own.includes(p.id)||access.grants.some(g=>g.provider===p.id));
}
export async function resolveProvider(user:string,id:string):Promise<Provider|undefined> {
 return (await listProviders(user)).find(p=>p.id===id);
}
export async function createProvider(user:string,value:Record<string,unknown>) {
 const name=typeof value.name==="string"?value.name.trim():"",description=typeof value.description==="string"?value.description.trim():"",category=typeof value.category==="string"?value.category.trim():"Custom";
 if(!name||name.length>100||description.length>2000||!category||category.length>60)throw new InputError("Enter an integration name, category and a description under 2,000 characters.");
 if(value.templateId){
  const template=providerById(String(value.templateId));if(!template)throw new InputError("Choose a supported integration type.");
  const provider:Provider={...template,id:`custom_${randomUUID()}`,name,description:description||template.description,category,adapter:template.id};
  await db.query("INSERT INTO integration_definitions(user_id,id,definition) VALUES($1,$2,$3)",[user,provider.id,JSON.stringify(provider)]);return provider;
 }
 const auth=String(value.auth||"bearer");if(!["none","basic","bearer","oauth2"].includes(auth))throw new InputError("Choose a supported authentication method.");
 const fields:Provider["fields"]=[{key:"baseUrl",label:"API base URL"},{key:"mapping",label:"Operation mappings (JSON)"}];
 if(auth==="basic")fields.push({key:"username",label:"Username / email"},{key:"password",label:"Password / API token",secret:true});
 if(auth==="bearer")fields.push({key:"token",label:"API token",secret:true});
 if(auth==="oauth2")fields.push({key:"tokenUrl",label:"OAuth token URL"},{key:"clientId",label:"Client ID"},{key:"clientSecret",label:"Client secret",secret:true},{key:"scope",label:"OAuth scope",optional:true});
 const provider:Provider={id:`custom_${randomUUID()}`,name,description,category,auth:auth as Provider["auth"],fields,operations:[],docs:"",custom:true};
 await db.query("INSERT INTO integration_definitions(user_id,id,definition) VALUES($1,$2,$3)",[user,provider.id,JSON.stringify(provider)]);
 return provider;
}
export async function archiveProvider(user:string,id:string,restore=false) {
 const access=await integrationAccess(user);
 if(!access.own.includes(id)&&!(access.admin&&providerById(id)))throw new InputError("Shared integrations cannot be deleted or restored by recipients.",403);
 const p=(await listProviders(user,true)).find(p=>p.id===id);if(!p)throw new InputError("Integration not found.",404);
 const client=await db.connect();
 try {
  await client.query("BEGIN");
  await client.query("UPDATE integration_connections SET enabled=false,revision=revision+1 WHERE user_id=$1 AND provider=$2",[user,id]);
  await client.query("DELETE FROM integration_approvals WHERE user_id=$1 AND provider=$2",[user,id]);
  if(restore)await client.query("UPDATE integration_definitions SET deleted_at=NULL WHERE user_id=$1 AND id=$2",[user,id]);
  else await client.query("INSERT INTO integration_definitions(user_id,id,deleted_at) VALUES($1,$2,now()) ON CONFLICT(user_id,id) DO UPDATE SET deleted_at=now()",[user,id]);
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
