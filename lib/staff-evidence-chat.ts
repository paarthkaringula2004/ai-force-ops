import {db} from './db';
import {leaveLookupIntent,teamLeaveChatReply} from './team-leave-chat';
import {employeeServiceLabels,requestFieldLabel,requestStatusLabel} from './employee-services';
import {readableRequestDetails,leaveDeductionSummary} from './leave-display';
import {parseLeavePeriod} from './leave-policy';

type Area='requests'|'profile'|'activity'|'meetings'|'tools'|'usage'|'epace'|'agents'|'overview';
const safe=(value:unknown)=>String(value??'Not recorded').replace(/[\n\r|]/g,' ').replace(/([\\`*_\[\]<>])/g,'\\$1');
const time=(value:unknown)=>value?new Date(String(value)).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST':'Not recorded';
const normal=(text:string)=>text.toLocaleLowerCase().replace(/[^\p{L}\p{N}@._ -]/gu,' ').replace(/\s+/g,' ').trim();
const actionLabel=(value:string)=>({'leave.auto_approved':'Leave automatically approved','leave.submitted':'Leave submitted','leave.pay_decision':'Leave pay decision','request.submitted':'Request submitted','request.approve':'Request approved','request.reject':'Request rejected','request.cancel':'Request cancelled','request.fulfil':'Request fulfilment recorded'}[value]||value.replace(/[._]/g,' '));
export function staffEvidenceIntent(text:string):Area|null{
 if(/^usage$/i.test(text.trim()))return 'usage';
 if(/^tools? library$/i.test(text.trim()))return 'tools';
 if(/^meeting rooms$/i.test(text.trim()))return 'meetings';
 if(/^epace$/i.test(text.trim()))return 'epace';
 if(!/^(?:show|list|check|tell|what(?:'s|s)?|who|why|which|has|did|is|are|give|how|all about|employee overview|team overview|workspace overview)\b/i.test(text.trim()))return null;
 if(/\b(?:my profile|about me|my requests|my usage|my tools)\b/i.test(text))return null;
 if(/\b(?:epace|ePACE|uploads?|uploaded|knowledge documents?)\b/i.test(text))return 'epace';
 if(/\b(?:tool library|tools?|integrations?)\b/i.test(text))return 'tools';
 if(/\b(?:usage|tokens?|api costs?|tickets?)\b/i.test(text))return 'usage';
 if(/\b(?:meetings?|bookings?|meeting rooms?)\b/i.test(text))return 'meetings';
 if(/\b(?:agents?|workflows?)\b/i.test(text))return 'agents';
 if(/\b(?:activity|actions?|doing|done|history)\b/i.test(text))return 'activity';
 if(/\b(?:profile|department|employee id|reporting manager|employment|employee details)\b/i.test(text))return 'profile';
 if(/\b(?:requests?|requested|reason|status|approval|leave|laptops?|equipment|onboarding|access|support|expenses?|travel|attendance|payroll|benefits|resignation|referrals?|transfer|training|documents?|flexible work)\b/i.test(text))return 'requests';
 if(/\b(?:overview|everything|all about)\b/i.test(text))return 'overview';
 return null;
}
const scope=`viewer.active AND (viewer.role='admin' OR viewer.role='manager' AND m.manager_id=$1 AND m.user_id<>$1)`;
const kinds:Record<string,RegExp>={leave:/\bleave\b/i,equipment:/\b(laptop|equipment)\b/i,onboarding:/\bonboarding\b/i,room:/\broom\b/i,access:/\baccess\b/i,support:/\bsupport\b/i,expense:/\bexpense|reimbursement\b/i,travel:/\btravel\b/i,attendance:/\battendance\b/i,payroll:/\bpayroll\b/i,benefits:/\bbenefits\b/i,resignation:/\bresign/i,referral:/\breferr/i,transfer:/\btransfer\b/i,training:/\btraining\b/i,document:/\bdocument\b/i,flexible:/\bflexible|remote work|work from home\b/i};
export async function staffEvidenceChatReply(user:string,input:string,history:{role:string;content:string}[]=[]){
 if(/\b(?:my leave|my balance|my own|my profile|my department|my employee id|my manager|do i|can i|am i|i have)\b/i.test(input)&&!/\b(?:team|employees|staff|direct reports)\b/i.test(input))return null;
 if(/^(?:how (?:do|can|should)|what (?:is|are)|explain|help me (?:use|understand))\b/i.test(input)&&!/\b(?:employee|staff|team|uploaded|recorded|usage|status|REQ-)\b/i.test(input))return null;
 const leave=leaveLookupIntent(input),area=staffEvidenceIntent(input);
 if(!leave&&!area)return null;
 // A custom email body is data, not an employee-query command.
 const pending=(await db.query('SELECT draft FROM workspace_chat_actions WHERE user_id=$1 AND expires_at>now()',[user])).rows[0]?.draft;
 if(pending?.type==='mail'&&!pending.guided&&pending.to&&pending.subject&&!pending.encrypted)return null;
 const answer=(reply:string)=>({reply,choices:['Team requests'],responseMode:'workspace',recordedAt:new Date().toISOString()});
 if(leave)return teamLeaveChatReply(user,input);
 const actor=(await db.query('SELECT role,active FROM workspace_members WHERE user_id=$1',[user])).rows[0];
 if(!actor?.active||!['admin','manager'].includes(actor.role))return null;
 const people=(await db.query(`SELECT m.user_id,m.role,m.department,m.employee_id,m.active,m.employment_verified_at,u.name,u.email,manager.name AS manager_name
  FROM workspace_members m JOIN "user" u ON u.id=m.user_id JOIN workspace_members viewer ON viewer.user_id=$1
  LEFT JOIN "user" manager ON manager.id=m.manager_id WHERE ${scope} ORDER BY u.name`,[user])).rows;
 const text=' '+normal(input)+' ';
 const named=people.filter(person=>[person.name,person.email,person.employee_id].filter(Boolean).some(value=>text.includes(' '+normal(value)+' ')));
 let matches=named;
 if(!matches.length){matches=people.filter(person=>text.includes(' '+normal(person.name).split(' ')[0]+' '));}
 const followUp=/\b(?:reason|its status|is it approved|any update)\b/i.test(input);
 const pronoun=followUp||/\b(?:he|she|his|her|they|their|this employee|that employee)\b/i.test(input);
 if(!matches.length&&pronoun){
  for(const previous of [...history].reverse().filter(item=>item.role==='user'&&item.content!==input)){
   const prior=' '+normal(previous.content)+' ';
   const candidates=people.filter(person=>prior.includes(' '+normal(person.name)+' ')||person.employee_id&&prior.includes(' '+normal(person.employee_id)+' '));
   if(candidates.length){matches=candidates;break;}
  }
 }
 const team=/\b(?:team|employees|staff|workspace|everyone|all requests|all tools|all meetings|all usage|all uploads|organization)\b/i.test(input)
  ||!matches.length&&!pronoun&&['tools','usage','meetings','epace','agents','overview'].includes(area!);
 if(!matches.length&&!team)return answer('Which employee should I check? Give their full name or employee ID, or say “show my team’s requests”. I only search your authorized team view.');
 if(matches.length>1&&!team)return answer(`Please choose the full employee name: ${matches.map(person=>safe(person.name)).join(', ')}.`);
 if(!matches.length)matches=people;
 if(!matches.length)return answer('No employees are assigned to your authorized team view. An Admin can set reporting-manager assignments.');
 const ids=matches.map(person=>person.user_id),sections:string[]=[];
 const query=(sql:string,extra:unknown[]=[])=>db.query(sql,[user,ids,...extra]);
 const selected=(value:Area)=>area===value||area==='overview';
 if(selected('profile'))sections.push('**Employee profiles**\n\n'+matches.map(person=>`**${safe(person.name)}** · ${safe(person.role)}\n- Employee ID: ${safe(person.employee_id||'Not assigned')}\n- Department: ${safe(person.department||'Not assigned')}\n- Reporting manager: ${safe(person.manager_name||'Not assigned')}\n- Employment confirmation: ${time(person.employment_verified_at)}\n- Access: ${person.active?'Active':'Inactive'}`).join('\n\n'));
 if(selected('requests')){
  const kind=Object.entries(kinds).find(([,pattern])=>pattern.test(input))?.[0]||null;
  const priorReference=followUp?[...history].reverse().find(item=>item.role==='assistant'&&/\bREQ-[A-Z0-9-]+\b/i.test(item.content))?.content.match(/\bREQ-[A-Z0-9-]+\b/i)?.[0]:null;
  const number=input.match(/\bREQ-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase()||priorReference?.toUpperCase()||null;
  const rows=(await query(`SELECT r.request_number,r.kind,r.status,r.details,r.updated_at,r.decision_note,u.name,decider.name AS reviewer
   FROM employee_service_requests r JOIN workspace_members m ON m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id
   JOIN workspace_members viewer ON viewer.user_id=$1 LEFT JOIN "user" decider ON decider.id=r.decided_by
   WHERE r.user_id=ANY($2::text[]) AND ${scope} AND ($3::text IS NULL OR r.kind=$3) AND ($4::text IS NULL OR upper(r.request_number)=$4)
   ORDER BY r.updated_at DESC LIMIT 30`,[kind,number])).rows;
  sections.push('**Saved employee requests**\n\n'+(rows.map(row=>`**${safe(row.name)} · ${safe(employeeServiceLabels[row.kind]||row.kind)} · ${row.request_number}**\n- Status: ${requestStatusLabel(row.status)}\n${readableRequestDetails(row.details).slice(0,12).map(([key,value])=>`- ${requestFieldLabel(key)}: ${safe(value).slice(0,800)}`).join('\n')}\n- Last updated: ${time(row.updated_at)}${row.reviewer?'\n- Decision by: '+safe(row.reviewer):''}${row.decision_note?'\n- Decision note: '+safe(row.decision_note):''}${leaveDeductionSummary(row.details)?'\n- Payroll: '+safe(leaveDeductionSummary(row.details)):''}`).join('\n\n')||'No matching submitted requests are recorded.')+'\n\nShowing up to 30 latest matching records. Approval is separate from external fulfilment.');
 }
 if(selected('meetings')){
  const interval=parseLeavePeriod(input);
  const rows=(await query(`SELECT u.name,b.id,b.title,b.status,b.starts_at,b.ends_at,r.name AS room,r.location,'In person' AS mode
   FROM meeting_room_bookings b JOIN meeting_rooms r ON r.id=b.room_id JOIN workspace_members m ON m.user_id=b.user_id
   JOIN "user" u ON u.id=b.user_id JOIN workspace_members viewer ON viewer.user_id=$1 WHERE b.user_id=ANY($2::text[]) AND ${scope}
   UNION ALL SELECT u.name,v.id,v.title,v.status,v.starts_at,v.ends_at,NULL,NULL,CASE WHEN v.provider='google' THEN 'Google Meet' ELSE 'Teams' END
   FROM workspace_virtual_meetings v JOIN workspace_members m ON m.user_id=v.organizer_id JOIN "user" u ON u.id=v.organizer_id
   JOIN workspace_members viewer ON viewer.user_id=$1 WHERE v.organizer_id=ANY($2::text[]) AND v.removed_at IS NULL AND ${scope}
   ORDER BY starts_at DESC LIMIT 100`)).rows.filter(row=>!interval||(new Date(row.starts_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})<=interval.end&&new Date(row.ends_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})>=interval.start));
  sections.push('**Meeting records**\n\n'+(rows.slice(0,30).map(row=>`- **${safe(row.name)}:** ${safe(row.title)} · ${row.mode} · ${safe(row.status)} · ${time(row.starts_at)} → ${time(row.ends_at)}${row.room?' · '+safe(row.room)+' / '+safe(row.location):''} · ID ${row.id}`).join('\n')||'No matching room reservations or organized virtual meetings are recorded.')+'\n\nSaved bookings and meeting status; external calendar availability was not queried.');
 }
 if(selected('tools')){
  const rows=(await query(`SELECT t.id,t.name,t.method,t.updated_at,u.name AS owner FROM tools t JOIN workspace_members m ON m.user_id=t.user_id
   JOIN "user" u ON u.id=t.user_id JOIN workspace_members viewer ON viewer.user_id=$1 WHERE t.user_id=ANY($2::text[]) AND ${scope} ORDER BY t.updated_at DESC LIMIT 30`)).rows;
  sections.push('**Tool Library**\n\n'+(rows.map(row=>`- **${safe(row.owner)}:** ${safe(row.name)} · ${safe(row.method)} · updated ${time(row.updated_at)} · ID ${row.id}`).join('\n')||'No created tools are recorded in this scope.')+'\n\nTool registration is not proof that its external API is connected or working. Credentials and endpoint parameters are excluded.');
 }
 if(selected('usage')){
  const period=parseLeavePeriod(input);
  const rows=(await query(`SELECT u.name,count(*)::int AS events,sum(e.input_tokens)::bigint AS input_tokens,sum(e.output_tokens)::bigint AS output_tokens,
   sum(e.total_tokens)::bigint AS tokens,count(*) FILTER(WHERE e.usage_kind='local')::int AS local_replies,max(e.created_at) AS latest
   FROM usage_events e JOIN workspace_members m ON m.user_id=e.user_id JOIN "user" u ON u.id=e.user_id JOIN workspace_members viewer ON viewer.user_id=$1
   WHERE e.user_id=ANY($2::text[]) AND ${scope} AND ($3::date IS NULL OR (e.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $3::date AND $4::date)
   GROUP BY e.user_id,u.name ORDER BY u.name`,[period?.start||null,period?.end||null])).rows;
  sections.push(`**Recorded usage${period?' · '+period.start+' to '+period.end:' · all time'}**\n\n`+(rows.map(row=>`- **${safe(row.name)}:** ${row.events} events; ${row.tokens} tokens (${row.input_tokens} input / ${row.output_tokens} output); ${row.local_replies} local replies; latest ${time(row.latest)}`).join('\n')||'No usage events are recorded in this scope.')+'\n\nThese are recorded application events, not live provider billing or proof of payment.');
 }
 if(selected('epace')){
  const projects=(await query(`SELECT p.id,p.name,p.updated_at,u.name AS owner FROM epace_projects p JOIN workspace_members m ON m.user_id=p.user_id
   JOIN "user" u ON u.id=p.user_id JOIN workspace_members viewer ON viewer.user_id=$1 WHERE p.user_id=ANY($2::text[]) AND ${scope} ORDER BY p.updated_at DESC LIMIT 30`)).rows;
  const records=(await query(`SELECT r.id,r.kind,r.data->>'name' AS name,r.data->>'size' AS bytes,r.data->>'chunks' AS chunks,r.data->>'status' AS status,
   r.updated_at,p.name AS project,u.name AS owner FROM epace_records r JOIN epace_projects p ON p.id=r.project_id
   JOIN workspace_members m ON m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id JOIN workspace_members viewer ON viewer.user_id=$1
   WHERE r.user_id=ANY($2::text[]) AND ${scope} ORDER BY r.updated_at DESC LIMIT 30`)).rows;
  const audit=(await query(`SELECT a.action,a.created_at,p.name AS project,u.name AS owner FROM epace_audit a JOIN epace_projects p ON p.id=a.project_id
   JOIN workspace_members m ON m.user_id=a.user_id JOIN "user" u ON u.id=a.user_id JOIN workspace_members viewer ON viewer.user_id=$1
   WHERE a.user_id=ANY($2::text[]) AND ${scope} ORDER BY a.created_at DESC LIMIT 20`)).rows;
  sections.push('**ePACE projects**\n\n'+(projects.map(row=>`- ${safe(row.owner)} · ${safe(row.name)} · updated ${time(row.updated_at)} · ID ${row.id}`).join('\n')||'No projects recorded.')+'\n\n**Uploads and work records**\n\n'+(records.map(row=>`- ${safe(row.owner)} · ${safe(row.project)} · ${safe(row.kind)} · ${safe(row.name||row.id)}${row.bytes?' · '+safe(row.bytes)+' bytes':''}${row.chunks?' · '+safe(row.chunks)+' indexed passages':''}${row.status?' · status '+safe(row.status):''} · updated ${time(row.updated_at)}`).join('\n')||'No documents or work records recorded.')+'\n\n**Recent ePACE activity**\n\n'+(audit.map(row=>`- ${safe(row.owner)} · ${safe(row.project)} · ${safe(row.action)} · ${time(row.created_at)}`).join('\n')||'No activity recorded.')+'\n\nMetadata is shown from saved records. Document contents and private chat transcripts are not included.');
 }
 if(selected('agents')){
  const rows=(await query(`SELECT a.id,a.name,a.model_id,a.updated_at,u.name AS owner FROM agents a JOIN workspace_members m ON m.user_id=a.user_id
   JOIN "user" u ON u.id=a.user_id JOIN workspace_members viewer ON viewer.user_id=$1 WHERE a.user_id=ANY($2::text[]) AND a.deleted_at IS NULL AND ${scope} ORDER BY a.updated_at DESC LIMIT 30`)).rows;
  sections.push('**Agent records**\n\n'+(rows.map(row=>`- ${safe(row.owner)} · ${safe(row.name)} · model ${safe(row.model_id||'Not configured')} · updated ${time(row.updated_at)} · ID ${row.id}`).join('\n')||'No agents recorded in this scope.')+'\n\nSaved configuration is not proof of a successful run.');
 }
 if(selected('activity')){
  const rows=(await query(`SELECT a.action,a.created_at,actor.name AS actor,target.name AS employee,r.request_number FROM workspace_audit a
   JOIN workspace_members m ON m.user_id=a.target_id JOIN "user" target ON target.id=a.target_id LEFT JOIN "user" actor ON actor.id=a.actor_id
   LEFT JOIN employee_service_requests r ON r.id=a.request_id JOIN workspace_members viewer ON viewer.user_id=$1
   WHERE a.target_id=ANY($2::text[]) AND ${scope} ORDER BY a.created_at DESC LIMIT 30`)).rows;
  sections.push('**Recorded workplace actions**\n\n'+(rows.map(row=>`- ${safe(row.employee)} · ${safe(actionLabel(row.action))} · by ${safe(row.actor||'System')} · ${time(row.created_at)}${row.request_number?' · '+row.request_number:''}`).join('\n')||'No audited workplace actions recorded.')+'\n\nThis reports recorded actions, not continuous monitoring or unrecorded activity.');
 }
 return answer(`**${actor.role==='admin'?'Workspace':'Assigned team'} evidence** · checked ${time(new Date())}\n\n${sections.join('\n\n')}\n\n[Open Team Requests](/dashboard/team-requests).`);
}
