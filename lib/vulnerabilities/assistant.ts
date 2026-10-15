import {sharedOperationsOwner} from '@/lib/eassist/organization-context';
import { workspaceAccess } from "@/lib/workspace-access";
import { permitted } from "@/lib/workspace-permissions";
import {db} from '@/lib/db';
import {isOperationalQuestion,operationalAnswer} from '@/lib/service-review/assistant-operations';
import {PaceError} from '@/lib/epace/store';
import {startScan,scanProjection} from './scans';
import {isStandaloneGreeting} from '@/lib/chat-efficiency';
import {recordLocalChat} from '@/lib/local-chat-usage';
import {isCapabilityQuestion,reviewFollowup,securityTopic} from '@/lib/service-review/reply-context';
import {securityReviewReply} from '@/lib/service-review/security-reply';
import {naturalReviewReply} from '@/lib/service-review/natural-reply';
import {explicitReviewAction} from '@/lib/service-review/action-intent';
import {organizationWriteAllowed} from '@/lib/organization-security';
export async function workflowAnswer(user:string,question:string,requestId:string,conversationId:string|null=null){
 const originalQuestion=question;
 const actionIntent=explicitReviewAction(question);
 const member=await workspaceAccess(user),canSecurity=permitted(member,"security"),canOperations=permitted(member,"operations");
 if(!canSecurity && /scan|vulnerabilit|security|\bcve\b|\bxss\b|\bzap\b|\btrivy\b|nmap|juice shop/i.test(question))throw new PaceError("Security access is required for scanner workflows.",403);
 const sharedUser=member.role==='admin'?await sharedOperationsOwner(user):user;
 const existing=(await db.query('SELECT id,question,answer,status,model,evidence,actions,conversation_id FROM service_review_chat WHERE id=$1 AND user_id=$2',[requestId,user])).rows[0];
 if(existing){if(!canOperations&&JSON.stringify(existing.actions).includes("operations"))throw new PaceError("Operations access is required to read this saved answer.",403);if(!canSecurity&&JSON.stringify(existing).match(/vulnerability|security|guided-integration|monitoring/))throw new PaceError("Security access is required to read this saved workflow.",403);if(existing.question!==question||existing.conversation_id!==conversationId)throw new PaceError('This request ID belongs to another question.',409);return existing;}
 const previous=(await db.query("SELECT question,answer,evidence,actions FROM service_review_chat WHERE user_id=$1 AND conversation_id IS NOT DISTINCT FROM $2::uuid AND status='completed' ORDER BY created_at DESC LIMIT 3",[user,conversationId])).rows.filter(r=>(canSecurity||!securityTopic(JSON.stringify(r)))&&(canOperations||!JSON.stringify(r.actions).includes('operations')));
 question=reviewFollowup(question,previous);
 if(!canSecurity&&securityTopic(question))throw new PaceError('Security access is required to read security evidence.',403);
 let answer='',evidence:Record<string,unknown>[]=[];const actions:Record<string,unknown>[]=[];
 const normalized=question.toLowerCase().replace(/[.!?]+$/,'').trim();
 if(isCapabilityQuestion(question)){
  answer='I help you understand this workspace’s recorded operations and security data in ordinary language.\n\n'+(canOperations?'- Explain connected ServiceNow incidents, monitoring alerts, source health and Semaphore workflow results.\n- Summarize available activity for a date, distinguish old runs from new updates, and explain failures with next steps.\n':'')+(canSecurity?'- Explain saved vulnerability findings, scan progress, coverage limits and remediation guidance.\n- Prepare CSV/Excel downloads from completed scans and help configure supported scanner connections.\n':'')+'- Follow the current conversation when you ask about a specific finding.\n\nI use only sources your account is allowed to access. I do not automatically fix systems, prove that an attack occurred, or run active XSS tests through the continuous passive scanner. Changes and external actions still use the project’s authorized confirmation workflows.';
 }else if(!canSecurity && !isStandaloneGreeting(question)){
  if(!isOperationalQuestion(question))throw new PaceError("Security access is required for scanner workflows.",403);
  const result=await operationalAnswer(user,question);answer=result.answer;evidence=result.evidence;actions.push(...result.actions);
 }else if(isStandaloneGreeting(question)){
  answer='Hello! How can I help with your workspace today?';
 }else if(/clickjack|\bxss\b|cross.site scripting|api.?key|exposed secret/i.test(question)){
  const result=await securityReviewReply(sharedUser,question);answer=result.answer;evidence=result.evidence;actions.push(...result.actions);
 }else if(/nmap|juice shop|\bzap\b|\btrivy\b|integrat.*manual|manual.*integrat/i.test(normalized)||/(?:add|connect|integrat|manual|proceed).*?(?:tool|scanner|api|integrat)|^(?:proceed|integrate manually|nmap|zap|trivy|owasp juice shop|juice shop)$/i.test(normalized)){
  if(/juice shop/i.test(question))answer='OWASP Juice Shop is a deliberately vulnerable test application, not a scanner service. ZAP can assess an authorized Juice Shop deployment. Our approved target is configured by the project operator; it is not changed by arbitrary chat text.';
  else if(/nmap/i.test(question))answer='Nmap supports backend execution and XML output, but has no built-in REST API. This worker currently runs ZAP and Trivy. Connect a JSON API provided by your Nmap service, or import Nmap XML through the evidence interface. Native Nmap execution is not enabled in this worker.';
  else answer='ZAP and Trivy are already connected to the backend. I can ask for each required integration detail in chat, or you can open the manual integration interface. We support ZAP APIs and compatible JSON findings APIs. Test the connection before saving; credentials are encrypted and never stored in chat. The backend will synchronize enabled connections automatically. Unknown APIs need a compatible findings mapping; this interface does not install arbitrary software.';
  if(!/manual/i.test(question)&&!/juice shop|nmap|trivy/i.test(question))actions.push({kind:'guided-integration',connector:/\bzap\b/i.test(question)?'zap':'json'});
  actions.push({kind:'integration',connector:/\bzap\b/i.test(question)?'zap':'json'});
 }else if(actionIntent==='pause'){
  await organizationWriteAllowed(user);
  await db.query("INSERT INTO security_scan_schedules(user_id,frequency,next_run_at) VALUES($1,'manual',now()+interval '100 years') ON CONFLICT(user_id) DO UPDATE SET frequency='manual',next_run_at=excluded.next_run_at,updated_at=now()",[sharedUser]);
  answer='Continuous monitoring is paused. An already running scan will finish; new continuous cycles will not be queued. Connected API collectors remain enabled until you pause them under integrations.';actions.push({kind:'monitoring'});
 }else if(actionIntent==='resume'){
  await organizationWriteAllowed(user);
  await db.query("INSERT INTO security_scan_schedules(user_id,frequency,next_run_at) VALUES($1,'continuous',now()) ON CONFLICT(user_id) DO UPDATE SET frequency='continuous',next_run_at=now(),updated_at=now()",[sharedUser]);
  answer='Continuous project monitoring is enabled. The worker runs the next scan after the previous cycle finishes, saves its evidence to PostgreSQL, and updates eAssist alerts when findings change. Cycles do not overlap. New findings become visible when their scanner produces evidence; a scan is not instantaneous.';actions.push({kind:'monitoring'});
 }else if(/(?:check|show).*?(?:scan|monitor).*?(?:status|progress)|scan status|scan history|monitoring status/i.test(question)){
  const latest=(await db.query(`SELECT ${scanProjection} FROM security_scan_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,[sharedUser])).rows[0];
  const schedule=(await db.query('SELECT frequency FROM security_scan_schedules WHERE user_id=$1',[sharedUser])).rows[0];
  const worker=(await db.query("SELECT checked_at>now()-interval '90 seconds' AS online FROM security_scan_worker WHERE id=1")).rows[0];
  answer=`Monitoring: **${schedule?.frequency||'not configured'}**. Worker: **${worker?.online?'connected':'offline'}**.\n\n${latest?`Latest cycle: **${latest.status}**, ${latest.phase} (${latest.progress}%).`:'No scan cycle has been recorded yet.'}`;
  actions.push({kind:'monitoring'});
 }else if(/excel|csv|xlsx/i.test(question)&&/give|download|export|file|report/i.test(question)){
  const latest=(await db.query("SELECT id,completed_at FROM security_scan_jobs WHERE user_id=$1 AND status='completed' ORDER BY completed_at DESC LIMIT 1",[sharedUser])).rows[0];
  const format=/excel|xlsx/i.test(question)?'xlsx':'csv';
  if(latest){answer=`Preparing your ${format==='xlsx'?'Excel workbook':'CSV report'} from the completed scan at ${new Date(latest.completed_at).toISOString()}. The browser will receive the file automatically.`;actions.push({kind:'download',format,scanId:latest.id});}
  else answer='There is no completed project scan to export yet. Continuous monitoring will produce a report when the first cycle completes.';
 }else if(isOperationalQuestion(question)){
  const result=await operationalAnswer(user,question);answer=result.answer;evidence=result.evidence;actions.push(...result.actions);
 }else if(/alert/i.test(question)){
  const rows=(await db.query("SELECT summary,severity,state,updated_at FROM platform_alerts WHERE user_id=$1 AND (event_key LIKE 'vulnerability:%' OR event_key='security-worker' OR event_key LIKE 'security-connector:%') ORDER BY updated_at DESC LIMIT 10",[sharedUser])).rows;
  answer=rows.length?'Latest eAssist security alerts:\n\n'+rows.map(r=>`- **${r.summary}**  -  ${r.severity}, ${r.state}.`).join('\n'):'No security alerts have been recorded for your account.';actions.push({kind:'alerts'});
 }else if(/import|upload/i.test(question)){
  answer='Use the evidence interface below to upload CSV, Excel or Nmap XML, preview the source, and map its columns before saving.';actions.push({kind:'findings'});
 }else if(actionIntent==='scan'){
  await organizationWriteAllowed(user);
  const job=await startScan(sharedUser,requestId);
  answer=`Your configured project scan is **${job.status}**.\n\nTarget: **${job.target}**\n\nScan reference: \`${job.id}\`\n\nThe backend checks public web responses and the configured source checkout. The monitoring card updates automatically. CSV and Excel downloads become available when the job completes.`;
 }else if(/scan|monitor|report|vulnerabilit|security|xss|cve|smb|breach|download/i.test(question)){
  const result=await securityReviewReply(sharedUser,question);answer=result.answer;evidence=result.evidence;actions.push(...result.actions);
 }else{
  const result=await operationalAnswer(user,question);answer=result.answer;evidence=result.evidence;actions.push(...result.actions);
 }
 let model=canSecurity?'Security workflow / no paid AI':'Operational workflow / no paid AI';
 let warning:string|undefined;
 const actionQuestion=!!actionIntent||actions.some(a=>a.kind==='download'||a.kind==='guided-integration');
 if(!actionQuestion&&!isStandaloneGreeting(originalQuestion)){
  try{const natural=await naturalReviewReply(user,originalQuestion,previous,{answer,evidence});if(natural){answer=natural.answer;model=natural.model;}}catch{warning='The AI wording service is temporarily unavailable. Showing the verified server answer instead.';}
 }
 const saved=await db.query("INSERT INTO service_review_chat(id,user_id,question,answer,status,model,evidence,actions,conversation_id,completed_at) VALUES($1,$2,$3,$4,'completed',$5,$6::jsonb,$7::jsonb,$8,now()) ON CONFLICT DO NOTHING RETURNING id",[requestId,user,originalQuestion,answer,model,JSON.stringify(evidence),JSON.stringify(actions),conversationId]);
 if(!saved.rowCount)return (await db.query('SELECT id,question,answer,status,model,evidence,actions FROM service_review_chat WHERE id=$1 AND user_id=$2',[requestId,user])).rows[0];
 if(model.includes('no paid AI'))await recordLocalChat(user,'review-chat');
 return {id:requestId,question:originalQuestion,answer,status:'completed',model,evidence,actions,warning};
}
