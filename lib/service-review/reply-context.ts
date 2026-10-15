export function isCapabilityQuestion(q:string){return /\b(?:your|you(?:r)?|eassist|assistant)\b.*\bcapabilit(?:y|ies)\b|\bwhat (?:can|do) you (?:do|help)|\b(?:show|list).*\bcapabilities\b/i.test(q);}
export function isDailyOverview(q:string){return /\b(?:overall|over all|all data|everything|daily|today|yesterday)\b/i.test(q)&&(/\b(?:data|summary|report|overview|updates?)\b/i.test(q)||/\b(?:today|yesterday)\b/i.test(q));}
export function reviewPeriod(q:string,now=new Date()){
 const explicit=q.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/),iso=q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
 let day=iso?`${iso[1]}-${iso[2]}-${iso[3]}`:explicit?`${explicit[3]}-${explicit[2].padStart(2,'0')}-${explicit[1].padStart(2,'0')}`:'';
 if(!day&&/\b(?:today|yesterday)\b/i.test(q)){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  day=['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');
  if(/\byesterday\b/i.test(q))day=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 }
 if(!day)return null;
 if(Number.isNaN(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw new Error('Enter a valid date, such as 8-10-2026 (8 October 2026).');
 const start=new Date(day+'T00:00:00+05:30'),end=new Date(start.getTime()+86400000);
 return {day,start:start.toISOString(),end:end.toISOString(),label:new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeZone:'Asia/Kolkata'}).format(start)};
}
export function sourceDate(value:unknown){
 const s=String(value||'');if(!s)return null;
 const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'Z':s;
 return Number.isFinite(Date.parse(normalized))?new Date(normalized).toISOString():null;
}
export function withinPeriod(value:unknown,period:ReturnType<typeof reviewPeriod>){const date=sourceDate(value);return !period||!!date&&date>=period.start&&date<period.end;}
export function reviewFollowup(question:string,prior:{question:string;evidence?:unknown}[]){
 if(!/^(?:what(?:'s| is)|why|explain|tell me|what about|and|how)\b/i.test(question.trim())||!/\b(?:this|that|it|same|again|more)\b/i.test(question))return question;
 // Only carry a topic into explanations; never inherit an action verb.
 const previous=prior[0];if(!previous)return question;
 if(/clickjack|anti.clickjacking/i.test(previous.question))return question+' about missing anti-clickjacking header';
 if(/\bxss\b|cross.site scripting/i.test(previous.question))return question+' about XSS';
 if(/servicenow/i.test(previous.question))return question+' about ServiceNow';
 const evidence=Array.isArray(previous.evidence)?previous.evidence:[];
 const titles=evidence.map(e=>String((e as {facts?:{title?:string}}).facts?.title||'')).filter(Boolean);
 if(new Set(titles).size===1)return question+' about '+titles[0];
 return question;
}
export function securityTopic(q:string){return /clickjack|anti.clickjacking|\bxss\b|cross.site scripting|api.?key|secret|credential|cve|scan|vulnerabilit|security|breach/i.test(q);}
export function findingKey(f:Record<string,unknown>){return [f.scanner,f.qid||f.cve||f.title,f.ip||f.dns||'',f.url||''].map(v=>String(v||'').toLowerCase()).join('|');}
export function findingExplanation(q:string){
 if(/clickjack|anti.clickjacking/i.test(q))return '**Missing Anti-clickjacking Header** means the scanned response lacked the frame-embedding protection the scanner expected. Another website might be able to embed that page and trick someone into clicking its controls. It is a configuration finding—not XSS and not proof that an attack occurred.\n\nCheck the response’s Content-Security-Policy `frame-ancestors` and any `X-Frame-Options` header against the framing your application actually needs. Re-test the affected page after configuration changes; do not assume every route has the same headers.';
 if(/\bxss\b|cross.site scripting/i.test(q))return '**XSS (cross-site scripting)** is a flaw where untrusted input becomes executable browser content. A missing clickjacking header does not establish XSS. The continuous project scanner uses passive web checks and does not run active XSS payloads or authenticated tests; it cannot confirm the application is XSS-free.';
 if(/api.?key|secret|credential/i.test(q))return '**Potential exposed credential:** the scanner matched a secret-like value in the scanned source. This needs validation; it does not prove the credential is valid, publicly accessible or stolen. Never paste the value into chat. If a real credential was exposed, revoke/rotate it and remove it from tracked source. Repeated reports can refer to the same finding.';
 return null;
}
