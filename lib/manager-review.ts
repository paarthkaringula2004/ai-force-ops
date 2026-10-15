import {managerOverviewReply,managerTime,managerSmallTalk,type ManagerReading} from './manager-review-display';
import {db} from './db';
import {organizationOwner,overviewProjection} from './organization';
import {workspaceAccess} from './workspace-access';
import {naturalReviewReply} from './service-review/natural-reply';
import {resolveConversationQuestion,type ConversationMessage} from './conversation-ai';
import {reviewAiEnabled} from './review-ai-config';
export const managerReviewModel='Manager overview / no paid AI'; // Stable audience marker, not the provider model.
export const managerReviewTopics=['Observability','Value dashboard','AI Ops','Executive summary','Data sources','Geo health','Service details'];
export async function managerReviewAnswer(user:string,question:string,id:string,conversationId:string|null){
 const member=await workspaceAccess(user);
 if(!member.active||member.role!=='manager')throw new Error('Active Manager access is required.');
 const cached=(await db.query('SELECT id,question,answer,status,model,evidence,actions,conversation_id FROM service_review_chat WHERE id=$1 AND user_id=$2',[id,user])).rows[0];
 if(cached){if(cached.question!==question||cached.conversation_id!==conversationId)throw new Error('This request ID belongs to another question.');return cached;}
 const previous=(await db.query("SELECT question,answer FROM service_review_chat WHERE user_id=$1 AND conversation_id IS NOT DISTINCT FROM $2::uuid AND model=$3 AND status='completed' ORDER BY created_at DESC LIMIT 6",[user,conversationId,managerReviewModel])).rows;
 let resolved=question;
 if(reviewAiEnabled()&&previous.length){
  try{const history:ConversationMessage[]=[...previous].reverse().flatMap(p=>[{role:'user' as const,content:p.question},{role:'assistant' as const,content:p.answer}]);resolved=await resolveConversationQuestion(user,question,history,{model:process.env.REVIEW_CHAT_MODEL,source:'review-chat'});}catch{/* Read-only local fallback retains the previous topic below. */}
 }
 let answer:string,evidence:Record<string,unknown>[]=[];
 const owner=await organizationOwner();
 if(managerSmallTalk(question))answer=managerSmallTalk(question)!;
 else if(!owner)answer='The organization data source has not been configured. An Admin must select its integration owner.';
 else if(/\b(?:what can|capabilit|help|service details)\b/i.test(resolved))answer='I can explain your organization’s recorded service health, business-value metrics, AI Ops, geographical health and executive overview, and clarify earlier answers. This assistant is read-only. Team employee requests are available separately in Playground and Team Requests; Admin security and configuration are not exposed here.';
 else if(/\b(?:data sources?|connection health|connected sources?)\b/i.test(resolved)){
  const sources=(await db.query('SELECT name,state,enabled,checked_at FROM eassist_connections WHERE user_id=$1 ORDER BY name LIMIT 31',[owner])).rows;
  answer='Organization data-source connection health:\n\n'+(sources.length?sources.slice(0,30).map(s=>`- ${s.name}: ${!s.enabled?'Disabled':s.state}; last checked ${s.checked_at?managerTime(s.checked_at):'not yet'}.`).join('\n'):'No connected sources are recorded.')+(sources.length>30?'\nShowing the first 30 connections.':'')+'\nAn Admin maintains the configuration.';
 }else{
  // Only the established overview projection is exposed. No private incidents, credentials or configuration.
  const rows=await db.query(`SELECT DISTINCT ON(r.record_type,r.record_key) r.record_type AS "recordType",r.record_key AS "recordKey",r.payload,r.observed_at AS "observedAt"
   FROM service_review_records r LEFT JOIN eassist_connections c ON c.id=r.source_connection_id
   WHERE r.user_id=$1 AND (c.id IS NULL OR c.enabled) AND (c.id IS NULL OR r.is_current)
   ORDER BY r.record_type,r.record_key,r.observed_at DESC`,[owner]);
  const readings=overviewProjection(rows.rows) as ManagerReading[];
  const selected=managerOverviewReply(resolved,readings,previous[0]?.question||'');
  const overview=managerOverviewReply('service health',readings);
  answer=selected.answer;
  evidence=selected.readings.map((r,i)=>({number:i+1,type:r.recordType,source:'Organization overview',observedAt:r.observedAt,stale:Date.now()-new Date(String(r.observedAt)).getTime()>120000,facts:r.payload}));
  if(reviewAiEnabled()){
   try{const natural=await naturalReviewReply(user,question,previous,{answer:selected.answer+'\n\nOverall authorized health context (not necessarily the answer to the latest question):\n'+overview.answer,evidence},'Manager Review Center: read-only organization overview; no Admin configuration, private incident/security data, team HR records or external actions');if(natural)answer=natural.answer;}catch{/* Preserve the computed answer when execution policy or provider access blocks AI. */}
  }
 }
 const saved=await db.query(`INSERT INTO service_review_chat(id,user_id,question,answer,status,model,evidence,actions,conversation_id,completed_at)
  VALUES($1,$2,$3,$4,'completed',$5,$6::jsonb,'[]',$7,now()) ON CONFLICT DO NOTHING RETURNING id`,[id,user,question,answer,managerReviewModel,JSON.stringify(evidence),conversationId]);
 if(!saved.rowCount)return (await db.query('SELECT id,question,answer,status,model,evidence,actions FROM service_review_chat WHERE id=$1 AND user_id=$2',[id,user])).rows[0];
 return {id,question,answer,status:'completed',model:managerReviewModel,evidence,actions:[]};
}
