import {randomUUID} from 'node:crypto';
import {db} from './db';
import {workspaceAccess} from './workspace-access';
import {permitted,type WorkspaceAccess} from './workspace-permissions';
import {employeeHome,additionalKind} from './employee-services';
import {MemberUpdateError,updateMemberInTransaction,type MemberUpdate} from './workspace-members';
type Role=MemberUpdate['role'];
type ActionDraft={type?:string;token:string;email?:string;role?:Role;department?:string;qualificationCode?:string;awaitingQualification?:boolean;target?:{name:string;email:string;updatedAt:string};update?:MemberUpdate};
const roleNames=['User','Employee','Manager','Admin'];
const answer=(reply:string,choices:string[]=[])=>({reply,choices,responseMode:'workspace',recordedAt:new Date().toISOString()});
const emailPattern=/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/i;
const changesRole=(text:string)=>/\b(assign|promote|demote|make|set|change|add|allocate|appoint)\b/i.test(text)&&/\b(employee|manager|admin|role)\b/i.test(text);
const isRoleMenu=(text:string)=>/^(assign role|change a role|manage roles)$/i.test(text);
export async function workspaceChatReply(user:string,input:string,access?:WorkspaceAccess,initial?:{department?:string}){
 const member=access||await workspaceAccess(user),text=input.trim();
 const roleCommand=changesRole(text)||isRoleMenu(text),confirmation=/^Confirm role change /i.test(text),cancel=/^(Cancel role change|new chat)$/i.test(text);
 if(!permitted(member,'admin'))return roleCommand||confirmation?answer('Only an active Admin can assign workspace roles. Your permissions have not changed.'):null;
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`workspace-chat:${user}`]);
  const row=(await client.query('SELECT draft,expires_at FROM workspace_chat_actions WHERE user_id=$1 FOR UPDATE',[user])).rows[0];
  if(!roleCommand&&!confirmation&&(employeeHome.some(choice=>choice.toLowerCase()===text.toLowerCase())||additionalKind(text.toLowerCase()))){await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);await client.query('COMMIT');return null;}
  let draft=row&&new Date(row.expires_at)>new Date()?row.draft as ActionDraft:undefined;
  if(draft?.type==='decision'){if(!roleCommand&&!confirmation){await client.query('COMMIT');return null;}draft=undefined;}
  if(row&&!draft)await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);
  let reply:ReturnType<typeof answer>|null=null;
  if(cancel){await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);if(row&&text.toLowerCase()!=='new chat')reply=answer('Role change cancelled. No account permissions were changed.',['Assign role']);}
  else if(confirmation){
   if(!draft?.update||text!==`Confirm role change ${draft.token}`)reply=answer('That role-change preview has expired or was replaced. Start again to review the exact account and change.',['Assign role']);
   else{
    await updateMemberInTransaction(client,user,draft.update,draft.target!.updatedAt);
    const identity=(await client.query('SELECT admin_id FROM workspace_members WHERE user_id=$1',[draft.update.userId])).rows[0];
    await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);
    reply=answer(`**Role updated**\n\n- **Account:** ${draft.target!.name} (${draft.target!.email})\n- **Role:** ${draft.update.role}\n${draft.update.role==='admin'?`- **Admin ID:** ${identity.admin_id}`:`- **Department:** ${draft.update.department||'Not assigned'}`}\n\nSaved in AIForce.Ops and recorded in the audit log. ${draft.update.role==='manager'?'This Manager has Agent Studio, assigned-team approvals, Review Center and ePACE.':draft.update.role==='employee'?'This Employee has Agent Studio, personal services and ePACE after employment confirmation.':draft.update.role==='user'?'This User has Agent Studio, company guidance and published recruitment information.':'This Admin has administration, integrations, security and operations access.'}`,['Assign role','Employee services']);
   }
  }else if(roleCommand){
   draft={token:randomUUID(),email:text.match(emailPattern)?.[0].toLowerCase(),role:text.replace(emailPattern,'').match(/\b(user|employee|manager|admin)\b/i)?.[1].toLowerCase() as Role|undefined,department:text.match(/\bin\s+(.+?)\s+department\s*[.!]?$/i)?.[1].trim()??(initial?.department&&initial.department.length<=160&&!/[\r\n]/.test(initial.department)?initial.department:undefined)};
  }else if(draft&&!draft.update){
   if(!draft.email){const email=text.match(emailPattern)?.[0];if(email&&text===email)draft.email=email.toLowerCase();else reply=answer('Enter the exact login email of the existing account.',['Cancel role change']);}
   else if(!draft.role){if(roleNames.some(role=>role.toLowerCase()===text.toLowerCase()))draft.role=text.toLowerCase() as Role;else reply=answer('Choose User, Employee, Manager or Admin.',[...roleNames,'Cancel role change']);}
   else if(draft.department===undefined){if(text.length>160)reply=answer('Keep the department within 160 characters.',['Cancel role change']);else draft.department=text==='Keep current department'?'':text;}
   else if(draft.awaitingQualification){
    const qualification=(await client.query('SELECT code FROM staff_qualifications WHERE upper(code)=upper($1) OR lower(name)=lower($1) OR lower(name||\' (\'||code||\')\')=lower($1)',[text])).rows[0];
    if(qualification){draft.qualificationCode=qualification.code;draft.awaitingQualification=false;}
    else reply=answer('Choose an existing qualification name or suffix from Company catalogs. No role has changed.',['Cancel role change']);
   }
  }else if(draft?.update&&/^(yes|confirm)$/i.test(text))reply=answer('Use the confirmation button on the exact role-change preview.',['Confirm role change '+draft.token,'Cancel role change']);
  if(draft&&!reply&&(roleCommand||!draft.update)){
   if(!draft.email)reply=answer('Which existing login email should receive the role?',['Cancel role change']);
   else if(!draft.role)reply=answer(`Which role should ${draft.email} have?`,[...roleNames,'Cancel role change']);
   else if(draft.department===undefined&&draft.role!=='admin')reply=answer('Which department should be assigned? Choose Keep current department to retain it.',['Keep current department','Cancel role change']);
   else{
    if(draft.role==='admin')draft.department='';
    const target=(await client.query('SELECT m.*,m.updated_at::text AS version,u.name,u.email FROM workspace_members m JOIN "user" u ON u.id=m.user_id WHERE lower(u.email)=$1',[draft.email])).rows[0];
    if(!target){reply=answer(`No existing login was found for ${draft.email}. Ask the person to sign up first, or check the email. No account was changed.`,['Assign role','Cancel role change']);draft=undefined;await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);}
    else if(target.role==='admin'&&target.admin_id&&draft.role!=='admin'){
     reply=answer('This account has an assigned Admin ID. Its Admin role is locked and cannot be changed.',['Assign role']);draft=undefined;await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);
    }else{
     const chosen=draft.role==='admin'?null:(await client.query('SELECT code,name FROM staff_departments WHERE lower(trim(name))=lower($1)',[draft.department||target.department])).rows[0];
     if(draft.role!=='admin'&&(draft.department||draft.role==='manager')&&!chosen){
      draft.department=undefined;reply=answer('Choose an existing department name from Company catalogs. A role change does not create a department.',['Keep current department','Cancel role change']);
     }else if(draft.role==='manager'&&!draft.qualificationCode&&!target.qualification_code){
      draft.awaitingQualification=true;
      const qualifications=(await client.query('SELECT code,name FROM staff_qualifications ORDER BY id LIMIT 8')).rows;
      reply=answer('What is this person’s highest completed qualification? Use an existing qualification name or suffix from Company catalogs. It is required to generate their Manager ID.',[...qualifications.map(q=>`${q.name} (${q.code})`),'Cancel role change']);
     }else{
     draft.target={name:target.name,email:target.email,updatedAt:target.version};
     draft.update={userId:target.user_id,role:draft.role,department:draft.role==='admin'?'':chosen?.name||target.department,departmentCode:chosen?.code??target.department_code,qualificationCode:draft.qualificationCode||target.qualification_code,employeeId:target.employee_id,managerId:draft.role==='admin'?null:target.manager_id,active:target.active,permissions:[]};
     reply=answer(`**Review role change**\n\n- **Account:** ${target.name} (${target.email})\n- **Role:** ${target.role} → ${draft.role}\n${draft.role==='admin'?'':`- **Department:** ${target.department||'Not assigned'} → ${draft.update.department||'Not assigned'}\n`}\n- **Account:** ${target.active?'Active':'Disabled (stays disabled)'}\n\n${draft.role==='admin'?'Admin grants full administration, integrations, security and operations access.':draft.role==='manager'?'Manager grants Agent Studio, assigned-team approvals, Review Center and ePACE. eAssist and security remain Admin only.':'Employee grants personal services and website overview, plus ePACE after employment confirmation.'}${target.role==='manager'&&draft.role!=='manager'?' Current direct reports will be unassigned and must be reassigned by an Admin.':''}\n\nNothing has changed yet. Confirm this exact preview within 10 minutes.`,['Confirm role change '+draft.token,'Cancel role change']);
     }
    }
   }
  }
  if(draft&&reply&&!confirmation&&!cancel)await client.query("INSERT INTO workspace_chat_actions(user_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET draft=EXCLUDED.draft,expires_at=now()+interval '10 minutes'",[user,JSON.stringify(draft)]);
  await client.query('COMMIT');return reply;
 }catch(error){await client.query('ROLLBACK');if(error instanceof MemberUpdateError)return answer(error.message,['Assign role','Cancel role change']);throw error;}finally{client.release();}
}
