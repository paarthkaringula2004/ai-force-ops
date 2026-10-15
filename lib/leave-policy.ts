import { en } from 'chrono-node';
import type {PoolClient} from 'pg';

export const monthlyPaidLeaveDays = 2;
export const leaveTimezone = 'Asia/Kolkata';
export type LeavePeriod = {start:string;end:string;days:number;halfDay:boolean};
export type LeaveAllocation = {month:string;paid:number;unpaid:number;entitlementPaid?:number};
export function localLeaveDate(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:leaveTimezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(key=>parts.find(part=>part.type===key)!.value).join('-');
}
const dateValue=(value:string)=>new Date(value+'T12:00:00Z');
export function parseLeavePeriod(text:string,now=new Date(),referenceDate?:string):LeavePeriod|null {
 const today=localLeaveDate(now);
 const correction=text.match(/\b(?:that(?:'s| is|s)|i mean|make (?:it|that))\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
 if(correction)text=correction[1]+'th'+(/\bhalf[ -]?day\b/i.test(text)?' half day':'');
 if(referenceDate&&/\b(?:the )?(?:next|following) day\b|\bday after (?:that|it)\b/i.test(text)){
  const next=new Date(dateValue(referenceDate).getTime()+86400000).toISOString().slice(0,10);
  return {start:next,end:next,days:/\bhalf[ -]?day\b/i.test(text)?0.5:1,halfDay:/\bhalf[ -]?day\b/i.test(text)};
 }
 // Chrono does not consistently recognize conversational bare ordinals.
 // Preserve explicit month/year expressions and normalize only day-of-month dates.
 if(!/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b\d{4}-\d{2}-\d{2}\b/i.test(text)){
  let invalid=false;
  text=text.replace(/\b(after\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/gi,(_match,after:string|undefined,dayText:string)=>{
   const day=Number(dayText),base=referenceDate||today;
   const date=new Date(Date.UTC(Number(base.slice(0,4)),Number(base.slice(5,7))-1,day,12));
   if(day<1||date.getUTCDate()!==day){invalid=true;return '';}
   if(after)date.setUTCDate(date.getUTCDate()+1);
   return date.toISOString().slice(0,10);
  });
  if(invalid)return null;
 }
 // Day duration is a leave attribute, not another relative date for Chrono.
 const dateText=text.replace(/\b(?:half|full)[ -]?days?\b/gi,'').replace(/\b(?:minimum|at least|for)\s+\d+\s+days?\b/gi,'');
 const parsed=en.GB.parse(dateText,{instant:dateValue(today),timezone:0},{forwardDate:true});
 if(!parsed.length||!parsed[0].start.isCertain('day'))return null;
 const iso=(component:typeof parsed[0]['start'])=>`${component.get('year')}-${String(component.get('month')).padStart(2,'0')}-${String(component.get('day')).padStart(2,'0')}`;
 const start=iso(parsed[0].start),end=iso(parsed[0].end || (parsed.length===2?parsed[1].start:parsed[0].start));
 const halfDay=/\bhalf[ -]?day\b/i.test(text);
 const count=Math.round((dateValue(end).getTime()-dateValue(start).getTime())/86400000)+1;
 if(!Number.isFinite(count)||count<1||count>366||halfDay&&count!==1)return null;
 return {start,end,days:halfDay?0.5:count,halfDay};
}
export function leaveDates(period:LeavePeriod){return `${period.start}${period.end!==period.start?' to '+period.end:''} · ${period.halfDay?'Half day':'Full day'+(period.days>1?'s':'')} (${leaveTimezone})`;}
export function leaveMonths(period:LeavePeriod){
 const months:Record<string,number>={};
 for(let date=dateValue(period.start);date<=dateValue(period.end);date=new Date(date.getTime()+86400000)){
  const month=date.toISOString().slice(0,7);months[month]=(months[month]||0)+(period.halfDay?0.5:1);
 }
 return months;
}
export async function leaveUsage(client:PoolClient,user:string,excludeId?:string){
 const rows=(await client.query("SELECT details FROM employee_service_requests WHERE user_id=$1 AND ($2::uuid IS NULL OR id<>$2) AND kind='leave' AND status IN ('approved','fulfilled','pending_approval')",[user,excludeId||null])).rows;
 const used:Record<string,number>={};
 let unknown=false;
 for(const row of rows){
  const details=row.details;
  let allocations:LeaveAllocation[];
  try {allocations=JSON.parse(details.leaveAllocations || 'null');}catch{allocations=[];}
  if(!Array.isArray(allocations))allocations=[];
  if(!allocations.length){
   const period=parseLeavePeriod(String(details.dates||''));
   if(!period){unknown=true;continue;}
   allocations=Object.entries(leaveMonths(period)).map(([month,days])=>({month,paid:details.payType==='unpaid'?0:days,unpaid:0}));
  }
  for(const item of allocations)used[item.month]=(used[item.month]||0)+(item.entitlementPaid??item.paid);
 }
 const account=(await client.query(`SELECT to_char(GREATEST(p.effective_month,
  date_trunc('month',COALESCE(m.employment_verified_at,u."createdAt") AT TIME ZONE 'Asia/Kolkata')::date),'YYYY-MM') AS start_month
  FROM "user" u JOIN workspace_members m ON m.user_id=u.id CROSS JOIN leave_policy_settings p WHERE u.id=$1 AND p.id=1`,[user])).rows[0];
 if(!account)throw new Error('The leave policy has not been configured.');
 return {used,unknown,startMonth:String(account.start_month)};
}
const monthIndex=(month:string)=>Number(month.slice(0,4))*12+Number(month.slice(5,7))-1;
/** Future reservations constrain earlier spending of carried entitlement. */
export function availablePaidLeave(startMonth:string,month:string,used:Record<string,number>){
 if(month<startMonth)return 0;
 const checkpoints=[month,...Object.keys(used).filter(value=>value>month)];
 return Math.max(0,Math.min(...checkpoints.map(checkpoint=>{
  const accrued=(monthIndex(checkpoint)-monthIndex(startMonth)+1)*monthlyPaidLeaveDays;
  const spent=Object.entries(used).reduce((sum,[key,value])=>sum+(key>=startMonth&&key<=checkpoint?value:0),0);
  return accrued-spent;
 })));
}
export async function allocateLeave(client:PoolClient,user:string,period:LeavePeriod,excludeId?:string){
 const {used,unknown,startMonth}=await leaveUsage(client,user,excludeId);
 const allocations=Object.entries(leaveMonths(period)).map(([month,days])=>{
  const paid=unknown?0:Math.min(days,availablePaidLeave(startMonth,month,used));
  used[month]=(used[month]||0)+paid;
  return {month,paid,unpaid:days-paid,entitlementPaid:paid};
 });
 return {allocations,unknown,remaining:Object.fromEntries(allocations.map(item=>[item.month,availablePaidLeave(startMonth,item.month,used)]))};
}
export type SalaryRecord={monthly_salary:string|number;currency:string;deduction_basis:'calendar_days'|'fixed_30'};
export function calculateLeaveDeduction(salary:SalaryRecord,allocations:LeaveAllocation[]){
 const gross=Number(salary.monthly_salary);
 return allocations.map(item=>{
  const [year,month]=item.month.split('-').map(Number);
  const divisor=salary.deduction_basis==='fixed_30'?30:new Date(Date.UTC(year,month,0)).getUTCDate();
  const deduction=Math.min(gross,Math.round(gross/divisor*item.unpaid*100)/100);
  return {month:item.month,unpaidDays:item.unpaid,monthlySalary:gross,divisor,deduction,currency:salary.currency};
 });
}
export async function leavePayroll(client:PoolClient,user:string,allocations:LeaveAllocation[]){
 const salary=(await client.query('SELECT monthly_salary,currency,deduction_basis FROM workspace_salaries WHERE user_id=$1',[user])).rows[0] as SalaryRecord|undefined;
 return salary?calculateLeaveDeduction(salary,allocations):null;
}
