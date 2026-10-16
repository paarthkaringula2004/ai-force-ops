import {randomUUID} from 'node:crypto';
import {db} from './db';
import {workspaceAccess} from './workspace-access';
import {permitted,type WorkspaceAccess} from './workspace-permissions';
import {employeeServiceLabels,requestStatusLabel,requestFieldLabel} from './employee-services';
import {decideRequestInTransaction,RequestDecisionError,type RequestDecision} from './workspace-decisions';
type DecisionDraft={type:'decision';token:string;decision:RequestDecision;version:string;number:string};
const answer=(reply:string,choices:string[]=[])=>({reply,choices,responseMode:'workspace',recordedAt:new Date().toISOString()});
export async function workspaceRequestChatReply(user:string,input:string,access?:WorkspaceAccess){
 const text=input.trim(),member=access||await workspaceAccess(user);
 if(/^(team requests|team approvals|my team)$/i.test(text)){
  if(!permitted(member,'team'))return answer('Team requests are available to Managers and Admins. You can track your own requests in My Requests.',['My requests']);
  const rows=(await db.query(`SELECT r.request_number,r.kind,r.status,u.name FROM employee_service_requests r JOIN workspace_members m ON m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE ${member.role==='admin'?'$1::text IS NOT NULL':"m.manager_id=$1 AND r.user_id<>$1 AND r.kind<>'ticket_topup'"} ORDER BY r.created_at DESC LIMIT 20`,[user])).rows;
  return answer(rows.length?`**${member.role==='admin'?'Workspace':'Team'} requests**\n\n| Request | Employee | Service | Status |\n|---|---|---|---|\n${rows.map(row=>`| ${row.request_number} | ${String(row.name).replaceAll('|','\\|').replaceAll('\n',' ')} | ${employeeServiceLabels[row.kind]||row.kind} | ${requestStatusLabel(row.status)} |`).join('\n')}\n\nTo review a decision, say **Approve REQ-…** or **Reject REQ-… because [reason]**. No changes are made until you confirm. [Open Team Requests](/dashboard/team-requests).`:'There are no requests in your team view. Assign reporting managers through Administration to route requests.',['Employee services',...(member.role==='admin'?['Assign role']:[])]);
 }
 const command=text.match(/^(approve|reject|cancel|fulfil)\s+(REQ-[A-Z0-9-]+)(?:\s+(?:because|with note)\s+(.+))?$/i);
 const confirmation=text.startsWith('Confirm request decision '),cancel=text==='Cancel decision';
 if(!command&&!confirmation&&!cancel)return null;
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`workspace-chat:${user}`]);
  let result:ReturnType<typeof answer>;
  if(cancel){await client.query("DELETE FROM workspace_chat_actions WHERE user_id=$1 AND draft->>'type'='decision'",[user]);result=answer('Decision preview cancelled. The request is unchanged.',['My requests']);}
  else if(confirmation){
   const draft=(await client.query("SELECT draft FROM workspace_chat_actions WHERE user_id=$1 AND expires_at>now() AND draft->>'type'='decision' FOR UPDATE",[user])).rows[0]?.draft as DecisionDraft|undefined;
   if(!draft||text!==`Confirm request decision ${draft.token}`)result=answer('This decision preview expired or was replaced. Review the request again.',['My requests']);
   else{const outcome=await decideRequestInTransaction(client,user,draft.decision,draft.version);await client.query('DELETE FROM workspace_chat_actions WHERE user_id=$1',[user]);result=answer(`**${draft.number}: ${requestStatusLabel(outcome.status)}**\n\n${outcome.notice}`,['My requests',...(permitted(member,'team')?['Team requests']:[])]);}
  }else{
   const action=command![1].toLowerCase() as RequestDecision['action'],number=command![2].toUpperCase(),note=command![3]?.trim()||'';
   const item=(await client.query(`SELECT r.*,r.updated_at::text AS version,u.name,m.manager_id FROM employee_service_requests r JOIN workspace_members m ON m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE upper(r.request_number)=$2 AND ${member.role==='admin'?'$1::text IS NOT NULL':member.role==='manager'?'(r.user_id=$1 OR m.manager_id=$1)':'r.user_id=$1'}`,[user,number])).rows[0];
   if(item?.kind==='ticket_topup'&&action!=='cancel'&&member.role!=='admin')throw new RequestDecisionError('Ticket top-up requests require Admin review.',403);
   const owns=item?.user_id===user;
   if(!item||!member.active||(action==='cancel'?(!owns&&member.role!=='admin'):action==='fulfil'?(member.role!=='admin'||owns):(!permitted(member,'team')||owns)))throw new RequestDecisionError('Request not found or action not permitted. Self-approval is not allowed.',403);
   if(item.status!==(action==='fulfil'?'approved':'pending_approval'))throw new RequestDecisionError('This request is no longer eligible for that action.');
   if((action==='reject'||action==='fulfil')&&!note)result=answer(`Provide ${action==='reject'?'a rejection reason':'verified manual fulfilment evidence'}: **${action} ${number} ${action==='reject'?'because':'with note'} [your note]**. The request is unchanged.`);
   else if(note.length>2000)result=answer('Keep your decision note within 2,000 characters.');
   else{
    const draft:DecisionDraft={type:'decision',token:randomUUID(),decision:{id:item.id,action,note},version:item.version,number:item.request_number};
    await client.query("INSERT INTO workspace_chat_actions(user_id,draft) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET draft=EXCLUDED.draft,expires_at=now()+interval '10 minutes'",[user,JSON.stringify(draft)]);
    result=answer(`**Review request decision**\n\n- **Request:** ${item.request_number}\n- **Employee:** ${item.name}\n- **Service:** ${employeeServiceLabels[item.kind]||item.kind}\n- **Current status:** ${requestStatusLabel(item.status)}\n- **Action:** ${action}\n\n${Object.entries(item.details).map(([key,value])=>`- **${requestFieldLabel(key)}:** ${value}`).join('\n')}\n\n**Decision note:** ${note||'No note'}\n\nNothing has changed yet. Confirm within 10 minutes. Approval records a decision; it does not book rooms, send email or grant access.`,[`Confirm request decision ${draft.token}`,'Cancel decision']);
   }
  }
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');if(error instanceof RequestDecisionError)return answer(error.message,['My requests']);throw error;}finally{client.release();}
}
