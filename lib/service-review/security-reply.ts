import {db} from '@/lib/db';
import {scanProjection} from '@/lib/vulnerabilities/scans';
import {findingKey,findingExplanation,reviewPeriod,withinPeriod} from './reply-context';
import {safeOperationalText} from './assistant-operations';
import {operationalTime} from './operational-display';

export async function securityReviewReply(owner:string,question:string){
 const period=reviewPeriod(question);
 const [jobs,complete,imported,importSummary]=await Promise.all([
  db.query(`SELECT ${scanProjection} FROM security_scan_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,[owner]),
  db.query(`SELECT ${scanProjection},findings FROM security_scan_jobs WHERE user_id=$1 AND status='completed' AND ($2::timestamptz IS NULL OR completed_at>=$2 AND completed_at<$3) ORDER BY completed_at DESC LIMIT 1`,[owner,period?.start||null,period?.end||null]),
  db.query('SELECT scope,facts,scanned_at FROM vulnerability_findings WHERE user_id=$1 AND ($2::timestamptz IS NULL OR scanned_at>=$2 AND scanned_at<$3) ORDER BY updated_at DESC LIMIT 1000',[owner,period?.start||null,period?.end||null]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE facts->>'severity' IN ('Critical','High') AND facts->>'status' NOT IN ('Fixed','Resolved','Closed'))::int AS urgent FROM vulnerability_findings WHERE user_id=$1 AND ($2::timestamptz IS NULL OR scanned_at>=$2 AND scanned_at<$3)",[owner,period?.start||null,period?.end||null])
 ]);
 const latest=jobs.rows[0],report=complete.rows[0];
 const specific=/clickjack|\bxss\b|cross.site|api.?key|secret|credential|CVE-\d/i.test(question);
 const explanation=findingExplanation(question);
 let answer=explanation||'Here is the latest recorded security update.';
 if(period)answer+=`\n\nRequested date: **${period.label} (IST)**. Historical findings are separated from current scan progress.`;
 if(latest&&!period)answer+=`\n\n**Current scan:** ${latest.status==='running'||latest.status==='queued'?`${latest.status==='queued'?'Queued':'Running'} — ${safeOperationalText(latest.phase)} (${latest.progress}%). This scan has not produced a completed result yet.`:latest.status==='failed'?`Failed — ${safeOperationalText(latest.error)}. This does not establish the project’s security status.`:`Completed at ${operationalTime(latest.completedAt)}.`}`;
 const raw:{facts:Record<string,unknown>;scope:string;scanned_at:unknown}[]=(report?.findings||[]).map((facts:Record<string,unknown>)=>({facts,scope:'Latest completed project scan',scanned_at:report.completedAt}));
 const projectFindings=[...new Map(raw.map(row=>[findingKey(row.facts),row])).values()];
 raw.push(...imported.rows.filter(r=>withinPeriod(r.scanned_at,period)));
 const unique=new Map<string,{facts:Record<string,unknown>;scope:string;scanned_at:unknown}>();
 for(const row of raw){const key=findingKey(row.facts);if(!unique.has(key))unique.set(key,row);}
 const findings=[...unique.values()];
 const matching=findings.filter(r=>!specific||(/clickjack/i.test(question)?/clickjack|frame.ancestors|x.frame.options/i.test(String(r.facts.title)):/\bxss\b|cross.site/i.test(question)?/cross.site scripting|\bxss\b/i.test(String(r.facts.title)):/api.?key|secret|credential/i.test(question)?/key|secret|credential/i.test(String(r.facts.title)):JSON.stringify(r.facts).toLowerCase().includes(question.match(/CVE-\d{4}-\d+/i)?.[0].toLowerCase()||'')));
 const evidence=matching.slice(0,12).map((r,i)=>({number:i+1,type:'vulnerability',source:safeOperationalText(r.facts.scanner||r.scope),observedAt:r.scanned_at,stale:false,facts:{title:safeOperationalText(r.facts.title),severity:safeOperationalText(r.facts.severity),qid:safeOperationalText(r.facts.qid),device:safeOperationalText(r.facts.dns||r.facts.ip),location:safeOperationalText(r.facts.url),solution:safeOperationalText(r.facts.solution)}}));
 if(report&&!specific){const urgent=projectFindings.filter(r=>/^(critical|high)$/i.test(String(r.facts.severity))&&!/^(fixed|resolved|closed)$/i.test(String(r.facts.status))).length;answer+=`\n\n**Latest completed report:** ${operationalTime(report.completedAt)} — **${report.findingCount} observations**, **${urgent} distinct critical/high findings not marked fixed**. A running scan’s progress is not a new findings count.`;}
 if(!specific){const summary=importSummary.rows[0]||{total:0,urgent:0};answer+=`\n\n**Saved imported reports:** ${summary.total} findings; ${summary.urgent} critical/high findings not marked fixed. These are stored scanner observations, not a current scan. Detailed matching uses up to 1,000 saved findings; at most 12 evidence records are shown.`;}
 if(specific)answer+=matching.length?`\n\nI found **${matching.length} distinct matching saved finding${matching.length===1?'':'s'}** in the checked records. These are scanner observations, not confirmed attacks.`:'\n\n**No matching XSS finding was found in the checked saved records.** This does not mean active XSS testing passed.';
 if(specific&&!/\bxss\b|cross.site/i.test(question)&&!matching.length)answer=answer.replace('No matching XSS finding','No matching finding').replace('active XSS testing passed','the issue is absent');
 const grouped=new Map<string,{title:string;severity:string;count:number;refs:number[]}>();
 for(const e of evidence){const k=e.facts.title+'|'+e.facts.severity;const item=grouped.get(k)||{title:e.facts.title,severity:e.facts.severity,count:0,refs:[]};item.count++;item.refs.push(e.number);grouped.set(k,item);}
 if(grouped.size)answer+='\n\n'+[...grouped.values()].slice(0,5).map(g=>`- **${g.title}** — ${g.severity}${g.count>1?`; ${g.count} distinct locations/records shown`:''}. ${g.refs.map(n=>`[${n}]`).join(' ')}`).join('\n');
 if(!report&&!specific)answer+='\n\nNo completed project report is available for this scope yet.';
 if(/clickjack/i.test(question))answer+='\n\n**Next step:** review the affected response headers and framing requirements. I have not changed the project configuration.';
 if(!specific)answer+='\n\nCoverage: passive public-page checks and source/dependency scanning. Authenticated tests, active XSS and confirmed breaches are not established by this report.';
 const summary=importSummary.rows[0]||{total:0,urgent:0};
 return {answer,evidence:specific?evidence:[...evidence,{number:evidence.length+1,type:'vulnerability-summary',source:'Saved imported reports',observedAt:null,stale:false,facts:{total:summary.total,urgent:summary.urgent}}],actions:[{kind:specific?'findings':'monitoring'}]};
}
