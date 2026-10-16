import {db} from './db';
import type {WorkspaceAccess} from './workspace-permissions';

// Recognize explicit catalog questions before a draft can consume them as names.
export function departmentLookupQuestion(input:string):{name?:string}|null {
 const text=input.trim().replace(/^(?:please\s+)?can you\s+(?:check|tell me)\s+(?:if|whether)\s+/i,'check if ').replace(/\s+in (?:our|the|this) (?:organization|organisation|company)\s*[?!.]*$/i,'').replace(/[?!.]+$/,'').trim();
 if(!/\b(?:depts?|departments?)\b/i.test(text)||/\b(?:create|add|delete|remove|rename|establish)\b/i.test(text))return null;
 if(/^(?:(?:please|can you)\s+)*(?:list|show|what are|which are|give me|check)\s+(?:(?:me|all|the|our|company|available|existing)\s+)*(?:depts?|departments?)(?:\s+(?:available|in (?:our|the) company))?$/i.test(text))return {};
 const patterns=[
  /^(?:do we|does (?:our|the) (?:company|organization))\s+have\s+(?:a\s+|an\s+)?(?:dept|department)\s+(?:named\s+|called\s+)?(.+)$/i,
  /^(?:do we|does (?:our|the) (?:company|organization))\s+have\s+(.+?)\s+(?:dept|department)$/i,
  /^(?:is|check(?: whether| if)?)\s+(.+?)\s+(?:available|present|existing)\s+(?:as a|as an)\s+(?:dept|department)$/i,
  /^(?:is|was)\s+there\s+(?:an?\s+)?(.+?)\s+(?:dept|department)$/i,
  /^(?:is|check(?: whether| if)?)\s+(.+?)\s+(?:dept|department)\s+(?:there|available|present|existing|exists?)$/i,
  /^(?:is|was)\s+there(?:'s| is)?\s+(?:any\s+|a\s+)?(?:dept|department)\s+(?:named|called)\s+(.+)$/i,
  /^(?:does|do)\s+(?:the\s+)?(?:dept|department)\s+(.+?)\s+exist$/i,
  /^(?:is|check(?: whether| if)?)\s+(?:the\s+)?(?:dept|department)\s+(.+?)\s+(?:available|present|existing|in the catalog)$/i,
  /^(.+?)\s+(?:is\s+)?(?:this|that)\s+(?:dept|department)\s+(?:available|present|existing)$/i,
  /^(?:is|does)\s+(.+?)\s+(?:dept|department)\s+(?:available|exist|present)$/i,
 ];
 for(const pattern of patterns){const match=text.match(pattern);if(match){const name=match[1].trim().replace(/^["“']|["”']$/g,'').trim();if(name&&name.length<=160)return {name};}}
 return null;
}
export async function readDepartmentLookup(member:WorkspaceAccess,name?:string){
 if(!member.active)return null;
 const result=name
  ?await db.query('SELECT code,name FROM staff_departments WHERE lower(trim(name))=lower(trim($1)) ORDER BY code',[name])
  :await db.query('SELECT code,name FROM staff_departments ORDER BY code');
 const safe=(value:string)=>value.replace(/[\\`*_{}\[\]<>]/g,'');
 const reply=name
  ?result.rows.length?`Yes, **${safe(result.rows[0].name)}** is available in the company department catalog. **Department ID: ${result.rows[0].code}**.`:`No department named **${safe(name)}** was found in the company catalog.`
  :result.rows.length?`**Company departments (${result.rows.length})**\n\n`+result.rows.map(row=>`- **${safe(row.name)}** — Department ID ${row.code}`).join('\n'):'There are no departments in the company catalog.';
 return {reply:reply+'\n\nChecked the saved catalog just now. No department was created or changed.',choices:member.role==='admin'?['List departments','Admin People']:['List departments'],responseMode:'workspace',recordedAt:new Date().toISOString()};
}
