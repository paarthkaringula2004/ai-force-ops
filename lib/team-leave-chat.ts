import {db} from './db';
import {localLeaveDate,parseLeavePeriod} from './leave-policy';
import {requestStatusLabel} from './employee-services';
const answer=(reply:string)=>({reply,choices:['Team requests'],responseMode:'workspace',recordedAt:new Date().toISOString()});
export function leaveLookupIntent(input:string){
 const text=input.trim().replace(/[?!]+$/,'');
 if(/\b(?:my|mine|myself|do i|can i|am i|i have|i need|i want)\b/i.test(text)&&!/\b(?:my team|my employees|my staff|my direct reports)\b/i.test(text))return null;
 const team=/^(?:who|which (?:employees|staff|team members)).*\b(?:on leave|absent|off work|not coming)\b/i.test(text);
 const named=text.match(/^(?:why\s+)?(?:is|was|will|isn't|is not)\s+(.+?)\s+(?:not (?:coming|attending|in)|absent|off work|on leave|taking leave|coming to (?:work|office))/i)
  ||text.match(/^(?:what is|what's|check|show)(?: the)?\s+(.+?)(?:'s|’s)?\s+leave(?: status| request)?/i);
 if(!team&&!named)return null;
 const period=parseLeavePeriod(text);
 return {name:team?null:named![1].trim().replace(/(?:'s|’s)$/,''),start:period?.start||localLeaveDate(),end:period?.end||localLeaveDate()};
}
export async function teamLeaveChatReply(user:string,input:string){
 const intent=leaveLookupIntent(input);if(!intent)return null;
 // Reload privileges rather than trusting role claims or cached caller context.
 const actor=(await db.query('SELECT role,active FROM workspace_members WHERE user_id=$1',[user])).rows[0];
 if(!actor?.active||!['admin','manager'].includes(actor.role))return answer('Team leave records are available to authorized Managers and Admins. You can check your own leave in My Requests.');
 const people=(await db.query(`SELECT m.user_id,u.name FROM workspace_members m JOIN "user" u ON u.id=m.user_id
  WHERE ($2='admin' OR m.manager_id=$1 AND m.user_id<>$1) ORDER BY u.name`,[user,actor.role])).rows;
 const normalize=(value:string)=>value.toLocaleLowerCase().replace(/\s+/g,' ').trim();
 const sought=intent.name?normalize(intent.name):null;
 const exact=sought?people.filter(person=>normalize(person.name)===sought):[];
 const matches=!sought?people:exact.length?exact:people.filter(person=>normalize(person.name).startsWith(sought+' '));
 if(!matches.length)return answer('I couldn’t find a matching employee in your authorized team view. Check the name or reporting-manager assignment.');
 if(sought&&matches.length>1)return answer(`More than one employee matches. Please use the full name: ${matches.map(person=>person.name).join(', ')}.`);
 const rows=(await db.query(`SELECT r.request_number,r.status,r.details,r.updated_at,u.name
  FROM employee_service_requests r JOIN "user" u ON u.id=r.user_id JOIN workspace_members m ON m.user_id=r.user_id
  JOIN workspace_members viewer ON viewer.user_id=$1
  WHERE r.user_id=ANY($2::text[]) AND r.kind='leave' AND r.status IN ('approved','fulfilled','pending_approval')
  AND viewer.active AND (viewer.role='admin' OR viewer.role='manager' AND m.manager_id=$1 AND r.user_id<>$1)
  ORDER BY u.name,r.created_at DESC`,[user,matches.map(person=>person.user_id)])).rows;
 const relevant=rows.filter(row=>{const dates=row.details.leaveStart?{start:row.details.leaveStart,end:row.details.leaveEnd||row.details.leaveStart}:parseLeavePeriod(String(row.details.dates||''));return dates&&dates.start<=intent.end&&dates.end>=intent.start;});
 const date=intent.start===intent.end?intent.start:`${intent.start} to ${intent.end}`;
 if(!relevant.length)return answer(`No active leave request is recorded for ${sought?matches[0].name:'your team'} on **${date}** (Asia/Kolkata). That does not establish attendance or explain an absence.`);
 return answer(`**Recorded leave · ${date} (Asia/Kolkata)**\n\n${relevant.map(row=>`**${row.name}** ${row.status==='pending_approval'?'has requested leave; approval is still pending':'has approved leave recorded'} for **${row.details.dates||date}**.\n- **Type:** ${row.details.type||'Leave'}\n- **Status:** ${requestStatusLabel(row.status)}\n- **Recorded reason:** ${row.details.reason||'Not recorded'}\n- **Request:** ${row.request_number}\n- **Paid / unpaid days:** ${row.details.paidDays??'Not recorded'} / ${row.details.unpaidDays??'Not recorded'}\n- **Last updated:** ${new Date(row.updated_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`).join('\n\n')}\n\nThis is saved leave evidence; it is not a live attendance check. [Open Team Requests](/dashboard/team-requests).`);
}
