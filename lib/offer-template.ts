import type {GuidedOffer,OfferContact} from './guided-offer';
export const offerTemplateFields={name:'Candidate name',email:'Candidate email',role:'Position',department:'Department',employmentType:'Employment type',location:'Work location',joiningDate:'Joining date',reportingManager:'Reporting manager',compensation:'Approved compensation',note:'Additional note',adminName:'Admin name',adminEmail:'Admin email',adminPhone:'Admin phone',reference:'Offer reference',date:'Issue date'};
export type TemplateField=keyof typeof offerTemplateFields;
export function offerPositionOptions(titles:{name:string;department_code?:number}[],departmentCode?:number){return [...new Set(titles.filter(t=>departmentCode===undefined||t.department_code===departmentCode).map(t=>t.name))];}
export const defaultOfferSubject='Employment Offer — {{role}} | AIForce.Ops';
export const defaultOfferTemplate=`# AIForce.Ops

Intelligent Service Operations

## Employment Offer

Reference: {{reference}}  
Date: {{date}}

Dear {{name}},

We are pleased to offer you the position of **{{role}}** at AIForce.Ops. We look forward to the skills, ideas and commitment you will bring to our team.

## Employment details

| Particular | Details |
| --- | --- |
| Position | {{role}} |
| Department | {{department}} |
| Employment type | {{employmentType}} |
| Work location / arrangement | {{location}} |
| Joining date | {{joiningDate}} |
| Reporting manager | {{reportingManager}} |
| Approved compensation | {{compensation}} |

## Acceptance and next steps

Please reply to confirm your acceptance of this offer. Following your acceptance, our team will contact you with the required onboarding documents and joining instructions. Any additional employment terms and applicable policies will be communicated separately.

We look forward to welcoming you to our team.

Kind regards,  
{{adminName}}  
Authorized Representative  
AIForce.Ops

## Contact us

Email: {{adminEmail}}  
Phone: {{adminPhone}}`;
export function validateOfferTemplate(markdown:unknown,subject:unknown){
 if(typeof markdown!=='string'||!markdown.trim()||markdown.length>12000||typeof subject!=='string'||!subject.trim()||subject.length>300||/[\r\n]/.test(subject))throw new Error('Enter a template and a single-line subject within the editor limits.');
 for(const match of (markdown+' '+subject).matchAll(/\{\{([^{}]+)\}\}/g))if(!(Object.hasOwn(offerTemplateFields,match[1])))throw new Error('Unknown template field: '+match[1]);
 if(!markdown.includes('{{name}}')||!markdown.includes('{{role}}'))throw new Error('Keep Candidate name and Position fields in the template. Right-click to insert them.');
 return {markdown,subject};
}
export function fillOfferTemplate(template:{markdown:string;subject:string},fields:GuidedOffer,contact:OfferContact,reference:string,date=new Date(),preview=false){
 const values:Record<string,string>={...fields,adminName:contact.name,adminEmail:contact.email,adminPhone:contact.phone,reference,date:new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeZone:'Asia/Kolkata'}).format(date)};
 if(fields.joiningDate)values.joiningDate=new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeZone:'UTC'}).format(new Date(fields.joiningDate+'T00:00:00Z'));
 const replace=(source:string,markdown:boolean)=>source.replace(/\{\{([^{}]+)\}\}/g,(_,key:string)=>{
  if(!(Object.hasOwn(offerTemplateFields,key)))throw new Error('Unknown template field: '+key);
  const value=values[key];if(!value&&key!=='note'&&!preview)throw new Error('Complete '+offerTemplateFields[key as TemplateField]+' before previewing the email.');
  const text=value||(key==='note'?'':'Choose '+offerTemplateFields[key as TemplateField].toLowerCase());
  return markdown?text.replace(/[\\`*_[\]<>|]/g,'\\$&'):text;
 });
 return {markdown:replace(template.markdown,true),subject:replace(template.subject,false)};
}
