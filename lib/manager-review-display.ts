export type ManagerReading={recordType:string;recordKey:string;payload:Record<string,unknown>;observedAt:unknown};
const business=['experience','automation','financial','innovation','benchmarked','sustainability','techDebt','csat'];
export function managerTime(value:unknown){const d=new Date(String(value));return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Kolkata'}).format(d)+' IST':'Not recorded';}
function label(r:ManagerReading){return String(r.payload.label||r.payload.device||r.payload.service||r.recordKey);}
function value(r:ManagerReading){return `${r.payload.value??r.payload.status??r.payload.availability??'Not reported'}${r.payload.unit?' '+String(r.payload.unit).trim():r.recordType==='availability'?'%':''}`;}
export function managerSmallTalk(question:string):string|null {
 const q=question.replace(/[*_`~]/g,'').trim().toLowerCase().replace(/[!.,?]+$/,'').trim();
 if(/^(hi|hello|helo|helloo+|hey+|hii+|good (morning|afternoon|evening))( there)?$/.test(q))return 'Hello! How can I help you with Review Center today?';
 if(/^(thanks|thank you|thankyou|ty)( so much)?$/.test(q))return 'You’re welcome!';
 if(/^(how are you|how are you doing)$/.test(q))return 'I’m ready to help. What would you like to check in Review Center?';
 return null;
}
export function managerOverviewReply(question:string,readings:ManagerReading[],previousQuestion='',now=new Date()) {
 const smallTalk=managerSmallTalk(question);if(smallTalk)return {answer:smallTalk,readings:[]};
 const followup=/\b(?:that|this|it|those|more|again|why|when|explain)\b/i.test(question)||/^(?:which|what|at what)\s+time[?!.]*$/i.test(question.trim());
 const q=(question+(followup?' '+previousQuestion:'')).toLowerCase(),context=q;
 const timeQuestion=/\b(time|when|timestamp)\b/.test(q);
 const timestamp=question.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/);
 if(timeQuestion&&timestamp)return {answer:`That timestamp is **${managerTime(timestamp[0])}**. It is the observation time of that reading, not the current time.`,readings:[]};
 if(timeQuestion&&/\b(now|current)\b/.test(q))return {answer:`The current time is **${managerTime(now.toISOString())}**.`,readings:[]};
 const metricKeys=context.includes('customer satisfaction')||/\bcsat\b/.test(context)?['csat']:context.includes('experience')?['experience']:context.includes('savings')||context.includes('financial')?['financial']:context.includes('innovation')?['innovation']:context.includes('benchmark')?['benchmarked']:context.includes('sustainab')?['sustainability']:context.includes('technical debt')?['techDebt']:context.includes('automation index')?['automation']:[];
 const hosts=context.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?|localhost(?::\d+)?/gi)||[];
 let selected=readings.filter(r=>r.recordType==='health');
 // Prefer actual scrape health over connector-login health for the same endpoint.
 const targets=new Map<string,ManagerReading>();for(const r of selected){const key=String(r.payload.device||r.recordKey).toLowerCase();const old=targets.get(key);if(!old||r.recordKey.includes(':target:'))targets.set(key,r);}selected=[...targets.values()];
 if(hosts.length)selected=selected.filter(r=>hosts.some(host=>label(r).toLowerCase().includes(host.toLowerCase())));
 if(/\b(down|failed|failing|unhealthy|why|problem|wrong)\b/.test(q)&&!metricKeys.length){
  const down=selected.filter(r=>/down|unhealthy|failed|critical|error/i.test(String(r.payload.status)));
  if(!down.length)return {answer:selected.length?'The latest stored health readings do not show a down service. Tell me the service name you are checking.':'No health reading matches that service. I cannot confirm its status yet.',readings:selected.slice(0,3)};
  const lines=down.slice(0,5).map(r=>`- **${label(r)}:** ${String(r.payload.status)} · last observed ${managerTime(r.observedAt)}`);
  return {answer:`${down.length===1?'One monitored service is reporting a problem.':'These monitored services are reporting problems.'}\n\n${lines.join('\n')}\n\nThe health reading confirms the status, but does not establish the cause. Ask an Admin to check the source diagnostics.`,readings:down.slice(0,5)};
 }
 if(metricKeys.length)selected=readings.filter(r=>metricKeys.includes(r.recordKey));
 else if(/value|business/.test(q))selected=readings.filter(r=>business.includes(r.recordKey));
 else if(/ai ops|automation|tasks/.test(q))selected=readings.filter(r=>r.recordType==='metric'&&/:(automationSuccess|failedTasks|pendingTasks|runningTasks|successfulTasks|taskCount)$/.test(r.recordKey));
 else if(/executive|summary|overview/.test(q))selected=[...selected,...readings.filter(r=>r.recordType==='metric'&&/:(automationSuccess|unavailableTargets)$/.test(r.recordKey))];
 if(!metricKeys.length&&!hosts.length&&!timeQuestion&&!/value|business|ai ops|automation|tasks|executive|summary|overview|observability|geo|health|status|services?|systems?|running|working|everything|okay|\bok\b/.test(q))return {answer:'What would you like to check—service health, business value, or an executive summary?',readings:[]};
 const shown=selected.slice(0,8);
 if(!selected.length)return {answer:'No matching reading is available yet. Your organization Admin can connect or import the required data.',readings:[]};
 if(timeQuestion)return {answer:selected.slice(0,3).map(r=>`**${label(r)}** was observed at **${managerTime(r.observedAt)}**.`).join('\n\n'),readings:selected.slice(0,3)};
 const lines=shown.map(r=>`- **${label(r)}:** ${value(r)}`);
 const latest=selected.reduce((a,r)=>Math.max(a,new Date(String(r.observedAt)).getTime()||0),0);
 const isBusiness=selected.every(r=>business.includes(r.recordKey));
 const stale=!isBusiness&&selected.some(r=>now.getTime()-new Date(String(r.observedAt)).getTime()>120000);
 let body=lines.join('\n');
 if(selected.every(r=>r.recordType==='health')&&!/list|each|all services|details|geo/.test(q)) {
  const healthy=selected.filter(r=>String(r.payload.status).toLowerCase()==='healthy');
  const down=selected.filter(r=>/down|failed|critical|error|unhealthy/i.test(String(r.payload.status)));
  const unknown=selected.length-healthy.length-down.length;
  body=down.length?`**${down.length} ${down.length===1?'service needs':'services need'} attention.** ${healthy.length} of ${selected.length} monitored services are reporting healthy.\n\n`+down.slice(0,8).map(r=>`- ${label(r)} is reporting **${String(r.payload.status).toLowerCase()}**.`).join('\n'):unknown?`${healthy.length} of ${selected.length} monitored services are reporting healthy; ${unknown} ${unknown===1?'has':'have'} an unconfirmed status.`:`All **${selected.length}** monitored services are reporting healthy.`;
 } else if(metricKeys.length&&selected.length===1)body=`**${label(selected[0])}: ${value(selected[0])}.**`;
 return {answer:body+(selected.length>8?`\n\nCounts cover all ${selected.length} matching readings; up to eight examples are shown.`:'')+`\n\nLast observed: ${managerTime(new Date(latest).toISOString())}.`+(stale?' Some readings are over two minutes old; current health is unconfirmed.':'')+(selected.some(r=>/demo|tutorial/i.test(label(r)))?' These include demonstration values, not verified business results.':''),readings:shown};
}
