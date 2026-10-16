import {organizationWriteAllowed} from './organization-security';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {permitted} from './workspace-permissions';

export class MemberUpdateError extends Error {
 constructor(message:string,public status=400){super(message);}
}
export type MemberUpdate={userId:string;role:'user'|'employee'|'manager'|'admin';active:boolean;department:string;employeeId:string;managerId:string|null;permissions:string[];departmentCode?:number|null;qualificationCode?:string;jobTitleId?:number|null};
export function validateMemberUpdate(value:unknown):asserts value is MemberUpdate {
 const b=value as MemberUpdate;
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.userId!=='string'||!['user','employee','manager','admin'].includes(b.role)||typeof b.active!=='boolean'||typeof b.department!=='string'||b.department.length>160||typeof b.employeeId!=='string'||b.employeeId.length>80||!(b.managerId===null||typeof b.managerId==='string')||!Array.isArray(b.permissions))throw new MemberUpdateError('Check role, manager and profile.');
 if(b.departmentCode!==undefined&&b.departmentCode!==null&&(!Number.isInteger(b.departmentCode)||b.departmentCode<1))throw new MemberUpdateError('Choose a department from the catalog.');
 if(b.qualificationCode!==undefined&&(typeof b.qualificationCode!=='string'||!/^[A-Z]{1,16}$/.test(b.qualificationCode))&&b.qualificationCode!=='')throw new MemberUpdateError('Choose the highest completed qualification.');
 if(b.jobTitleId!==undefined&&b.jobTitleId!==null&&(!Number.isInteger(b.jobTitleId)||b.jobTitleId<1))throw new MemberUpdateError('Choose a valid job title.');
 if(b.permissions.length)throw new MemberUpdateError('Access is determined by the assigned role. Additional permission grants are not supported.');
}
// Called inside a transaction by both Administration and the chat confirmation.
export async function updateMemberInTransaction(client:PoolClient,actor:string,b:MemberUpdate,expectedUpdatedAt?:string){
 validateMemberUpdate(b);
 await organizationWriteAllowed(actor,client);
 await client.query('SELECT pg_advisory_xact_lock(8470220029)');
 const acting=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1 FOR UPDATE',[actor])).rows[0];
 if(!acting||!permitted(acting,'admin'))throw new MemberUpdateError('Admin access required.',403);
 const old=(await client.query('SELECT *,updated_at::text AS version FROM workspace_members WHERE user_id=$1 FOR UPDATE',[b.userId])).rows[0];
 if(!old)throw new MemberUpdateError('Member not found.',404);
 if(old.role==='admin'&&old.admin_id&&b.role!=='admin')throw new MemberUpdateError('This account has an assigned Admin ID. Its Admin role is locked and cannot be changed.',409);
 if((b.role!=='admin'||!b.active)&&(await client.query('SELECT 1 FROM organization_workspace WHERE owner_id=$1',[b.userId])).rowCount)throw new MemberUpdateError('Select another organization integration owner before changing or disabling this Admin.',409);
 if(expectedUpdatedAt&&old.version!==expectedUpdatedAt)throw new MemberUpdateError('This member changed after your preview. Start again to review the latest details.',409);
 if(old.role==='admin'&&old.active&&(b.role!=='admin'||!b.active)&&!(await client.query("SELECT 1 FROM workspace_members WHERE role='admin' AND active=true AND user_id<>$1",[b.userId])).rowCount)throw new MemberUpdateError('Keep at least one active Admin.',409);
 const managerId=b.role==='admin'||b.role==='manager'?null:b.managerId;
 if(managerId){
  const manager=(await client.query("SELECT * FROM workspace_members WHERE user_id=$1 AND role='manager' AND active=true",[managerId])).rows[0];
  if(!manager||managerId===b.userId||b.role==='admin')throw new MemberUpdateError('Choose another active Manager. Admins do not have a reporting manager.');
  const cycle=await client.query('WITH RECURSIVE chain AS (SELECT user_id,manager_id FROM workspace_members WHERE user_id=$1 UNION SELECT m.user_id,m.manager_id FROM workspace_members m JOIN chain c ON m.user_id=c.manager_id) SELECT 1 FROM chain WHERE user_id=$2',[managerId,b.userId]);
  if(cycle.rowCount)throw new MemberUpdateError('Reporting relationships cannot form a cycle.');
 }
 const chosenDepartment=(await client.query(b.departmentCode===undefined?'SELECT code,name FROM staff_departments WHERE lower(name)=lower($1)':'SELECT code,name FROM staff_departments WHERE code=$1',[b.departmentCode===undefined?b.department.trim():b.departmentCode])).rows[0];
 const departmentCode=b.departmentCode===undefined?(chosenDepartment?.code??old.department_code):b.departmentCode;
 if(departmentCode&&!chosenDepartment&&b.departmentCode!==undefined)throw new MemberUpdateError('Choose a department from the catalog.');
 const qualification=b.qualificationCode??old.qualification_code;
 if(qualification&&!(await client.query('SELECT 1 FROM staff_qualifications WHERE code=$1',[qualification])).rowCount)throw new MemberUpdateError('Choose a qualification from the catalog.');
 const department=chosenDepartment?.name??old.department;
 const jobTitle=b.jobTitleId===undefined?(departmentCode===old.department_code?old.job_title_id:null):b.jobTitleId;
 if(jobTitle&&!(await client.query('SELECT 1 FROM staff_job_titles WHERE id=$1 AND department_code=$2',[jobTitle,departmentCode])).rowCount)throw new MemberUpdateError('Choose a job title in the selected department.');
 if(b.role==='manager'&&(!departmentCode||!qualification))throw new MemberUpdateError('Select a department and highest completed qualification before assigning Manager.');
 await client.query('UPDATE workspace_members SET role=$2,manager_id=$3,department=$4,permissions=$5,active=$6,department_code=$7,qualification_code=$8,job_title_id=$9,updated_at=now() WHERE user_id=$1',[b.userId,b.role,managerId,b.role==='admin'?'':department,[...new Set(b.permissions)],b.active,departmentCode,qualification,jobTitle]);
 if(old.role==='manager'&&(b.role!=='manager'||!b.active))await client.query('UPDATE workspace_members SET manager_id=NULL,updated_at=now() WHERE manager_id=$1',[b.userId]);
 await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,'member.updated',$4::jsonb)",[randomUUID(),actor,b.userId,JSON.stringify({before:old,after:{...b,managerId}})]);
}
