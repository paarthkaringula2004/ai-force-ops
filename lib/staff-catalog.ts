import type {Pool,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {permitted} from './workspace-permissions';
import {organizationWriteAllowed} from './organization-security';
export type StaffCatalog={departments:{code:number;name:string}[];qualifications:{id:number;code:string;name:string}[];jobTitles:{id:number;name:string;department_code:number}[]};
export class CatalogError extends Error{constructor(message:string,public status=400){super(message);}}
export async function readStaffCatalog(db:Pool|PoolClient):Promise<StaffCatalog>{
 const d=await db.query('SELECT code,name FROM staff_departments ORDER BY code');
 const q=await db.query('SELECT id,code,name FROM staff_qualifications ORDER BY id');
 const j=await db.query('SELECT id,name,department_code FROM staff_job_titles ORDER BY id');
 return {departments:d.rows,qualifications:q.rows,jobTitles:j.rows};
}
export async function createCatalogEntry(client:PoolClient,actor:string,input:unknown){
 await organizationWriteAllowed(actor,client);
 await client.query('SELECT pg_advisory_xact_lock(8470220029)');
 const member=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1 FOR UPDATE',[actor])).rows[0];
 if(!permitted(member,'admin'))throw new CatalogError('Admin access required.',403);
 const b=input as {kind?:unknown;name?:unknown;code?:unknown;departmentCode?:unknown};
 if(!b||!['department','qualification','job_title'].includes(String(b.kind))||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>160)throw new CatalogError('Choose a catalog and enter a name (up to 160 characters).');
 const name=b.name.trim(),kind=String(b.kind),code=typeof b.code==='string'?b.code.trim().toUpperCase():'';
 if(kind==='qualification'&&!/^[A-Z]{1,16}$/.test(code))throw new CatalogError('Use a unique qualification suffix of 1–16 letters, such as MTECH.');
 if(kind==='job_title'&&(!Number.isInteger(b.departmentCode)||!(await client.query('SELECT 1 FROM staff_departments WHERE code=$1',[b.departmentCode])).rowCount))throw new CatalogError('Choose the department for this job title.');
 const table=kind==='department'?'staff_departments':kind==='qualification'?'staff_qualifications':'staff_job_titles';
 const duplicate=kind==='job_title'?await client.query('SELECT 1 FROM staff_job_titles WHERE department_code=$1 AND lower(trim(name))=lower($2)',[b.departmentCode,name]):await client.query('SELECT 1 FROM '+table+' WHERE lower(trim(name))=lower($1)',[name]);
 if(duplicate.rowCount)throw new CatalogError('This name is already in the catalog.',409);
 if(kind==='qualification'&&(await client.query('SELECT 1 FROM staff_qualifications WHERE code=$1',[code])).rowCount)throw new CatalogError('This qualification suffix is already used.',409);
 const id=(await client.query('UPDATE staff_catalog_counters SET last_value=last_value+1 WHERE kind=$1 RETURNING last_value',[kind])).rows[0].last_value;
 const entry=kind==='department'?(await client.query('INSERT INTO staff_departments(code,name) VALUES($1,$2) RETURNING *',[id,name])).rows[0]:kind==='qualification'?(await client.query('INSERT INTO staff_qualifications(id,code,name) VALUES($1,$2,$3) RETURNING *',[id,code,name])).rows[0]:(await client.query('INSERT INTO staff_job_titles(id,name,department_code) VALUES($1,$2,$3) RETURNING *',[id,name,b.departmentCode])).rows[0];
 await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'catalog.created',$3::jsonb)",[randomUUID(),actor,JSON.stringify({kind,entry})]);
 return entry;
}

export async function deleteDepartment(client:PoolClient,actor:string,input:unknown){
 await organizationWriteAllowed(actor,client);
 await client.query('SELECT pg_advisory_xact_lock(8470220029)');
 const member=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1 FOR UPDATE',[actor])).rows[0];
 if(!member||!permitted(member,'admin'))throw new CatalogError('Admin access required.',403);
 const b=input as {code?:unknown;confirmation?:unknown};
 if(!b||!Number.isInteger(b.code)||Number(b.code)<1||typeof b.confirmation!=='string')throw new CatalogError('Choose a department and confirm its exact name.');
 const entry=(await client.query('SELECT code,name FROM staff_departments WHERE code=$1 FOR UPDATE',[b.code])).rows[0];
 if(!entry)throw new CatalogError('Department not found.',404);
 if(b.confirmation!==entry.name)throw new CatalogError('The department changed. Refresh and confirm its exact name.',409);
 const used=await client.query("SELECT 1 FROM workspace_members WHERE department_code=$1 OR lower(trim(department))=lower($2) UNION ALL SELECT 1 FROM staff_job_titles WHERE department_code=$1 UNION ALL SELECT 1 FROM staff_department_counters WHERE department_code=$1 AND last_value>0 LIMIT 1",[entry.code,entry.name]);
 if(used.rowCount)throw new CatalogError('This department has staff, job titles or issued staff IDs. It cannot be deleted. Reassign active references and preserve its identity history.',409);
 await client.query('DELETE FROM staff_department_counters WHERE department_code=$1',[entry.code]);
 await client.query('DELETE FROM staff_departments WHERE code=$1',[entry.code]);
 // Never rewind the allocation counter or reuse a deleted department number.
 await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'catalog.deleted',$3::jsonb)",[randomUUID(),actor,JSON.stringify({kind:'department',entry})]);
 return entry;
}

