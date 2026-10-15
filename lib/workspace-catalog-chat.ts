import {departmentCommand,suppliedDepartmentName} from './department-name';
import {organizationWriteAllowed} from './organization-security';
import {randomUUID} from 'node:crypto';
import {db} from './db';
import {type WorkspaceAccess,permitted} from './workspace-permissions';
import {CatalogError,createCatalogEntry} from './staff-catalog';

type DepartmentDraft={type:'department';token:string;name?:string};
const choices=(d:DepartmentDraft)=>d.name?['Confirm department creation '+d.token,'Cancel department creation']:['Cancel department creation'];
const answer=(reply:string,buttons:string[]=[])=>({reply,choices:buttons,responseMode:'workspace',recordedAt:new Date().toISOString()});
export async function workspaceCatalogChatReply(user:string,input:string,member:WorkspaceAccess){
 const text=input.trim();
 const command=departmentCommand(text);
 const departmentMutation=/\bdepartments?\b/i.test(text)&&/\b(create|add|establish|set up|setup|update|rename|delete|remove)\b/i.test(text);
 const confirm=/^Confirm department creation\s+/i.test(text),cancel=/^Cancel department creation$/i.test(text);
 const plainConfirm=/^(?:yes|confirm|conform|confirm it|conform it|proceed|go ahead)[.!]?$/i.test(text);
 if(!permitted(member,'admin'))return command||confirm||cancel||departmentMutation?answer('Only an active Admin can manage departments. No catalog entry was changed.'):null;
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`workspace-chat:${user}`]);
  const row=(await client.query('SELECT draft,expires_at FROM workspace_chat_actions WHERE user_id=$1 FOR UPDATE',[user])).rows[0];
  const draft=row?.draft?.type==='department'&&new Date(row.expires_at)>new Date()?row.draft as DepartmentDraft:undefined;
  let result:ReturnType<typeof answer>|null=null;
  if(cancel){await client.query("DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'type'='department'",[user]);result=answer('Department creation cancelled. No department was created.',['Create department']);}
  else if(plainConfirm&&!draft&&!row?.draft){result=answer('There is no saved action preview to confirm. For a department, choose Create department and review its name first.',['Create department','Assign role']);}
  else if(confirm||(plainConfirm&&row?.draft?.type==='department')){
   if(!draft?.name||(!plainConfirm&&text!==`Confirm department creation ${draft.token}`))result=answer('This department preview expired or was replaced. Start again to review the department before creating it.',['Create department']);
   else{
    await organizationWriteAllowed(user,client);
    const entry=await createCatalogEntry(client,user,{kind:'department',name:draft.name});
    await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);
    result=answer(`**Department created successfully**\n\n- **Name:** ${entry.name}\n- **Department ID:** ${entry.code}\n\nSaved in the company catalog and recorded in the audit log. It is available for staff assignments.`,['Create department','Assign role']);
   }
  }else if(command||draft){
   // Other explicit workflows replace or cancel this draft through their own handlers.
   if(!command&&(/^(assign role|team requests|about me|about aiforce\.ops|new chat)$/i.test(text)||/^(assign|promote|approve|reject)\b/i.test(text))){await client.query("DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'type'='department'",[user]);}
   else{
    const next:DepartmentDraft=command&&command[1].trim()?{type:'department',token:randomUUID()}:draft??{type:'department',token:randomUUID()};
    if(!next.name){const name=suppliedDepartmentName(text,!command)||'';
     if(name&&name.length<=160&&!plainConfirm)next.name=name;
     else if(name.length>160)result=answer('Keep the department name within 160 characters.',['Cancel department creation']);
    }
    if(next.name&&!result){
     const exists=await client.query('SELECT code FROM staff_departments WHERE lower(trim(name))=lower($1)',[next.name]);
     if(exists.rowCount){await client.query("DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'type'='department'",[user]);result=answer(`This department already exists with **Department ID ${exists.rows[0].code}**. No duplicate was created.`,['Create department','Assign role']);}
     else result=answer(`**Review new department**\n\n- **Department name:** ${next.name}\n- **Department ID:** next available incremental number, assigned on creation\n\nThis creates a company catalog entry. Staff assignments are managed separately. Nothing has been created yet. Confirm this preview within 10 minutes.`,choices(next));
    }else if(!result)result=answer('What is the exact name of the new department?',choices(next));
    if(!result.reply.includes('already exists'))await client.query("INSERT INTO workspace_chat_actions(user_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET draft=excluded.draft,expires_at=now()+interval '10 minutes'",[user,JSON.stringify(next)]);
   }
  }else if(departmentMutation){result=answer('No department was changed. To create one, choose Create department and enter its exact name. Department creation requires a saved preview and confirmation. Other department changes must be made through supported Administration controls.',['Create department']);}
  await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');if(e instanceof CatalogError)return answer(e.message,['Create department','Cancel department creation']);throw e;}finally{client.release();}
}
