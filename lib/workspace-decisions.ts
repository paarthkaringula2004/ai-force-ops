import {organizationWriteAllowed} from './organization-security';
import {queueLeaveEvent} from "./mail-events";
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {allocateLeave,leavePayroll,localLeaveDate,parseLeavePeriod,type LeaveAllocation} from './leave-policy';
export class RequestDecisionError extends Error{constructor(message:string,public status=400){super(message);}}
export type RequestDecision={id:string;action:'approve'|'reject'|'cancel'|'fulfil'|'amend_leave';note:string;payTreatment?:'policy'|'paid'|'unpaid';deductionOverrides?:Record<string,number>;version?:string};
export function validateRequestDecision(value:unknown):asserts value is RequestDecision{
 const b=value as RequestDecision;
 if(!b||typeof b.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)||!['approve','reject','cancel','fulfil','amend_leave'].includes(b.action)||typeof b.note!=='string'||b.note.length>2000||(['reject','fulfil','amend_leave'].includes(b.action)&&!b.note.trim()))throw new RequestDecisionError('Choose a valid decision. Rejection, amendment and fulfilment require a note.');
 if(b.payTreatment!==undefined&&!['policy','paid','unpaid'].includes(b.payTreatment))throw new RequestDecisionError('Choose a valid leave pay treatment.');
 if(b.deductionOverrides!==undefined&&(typeof b.deductionOverrides!=='object'||!b.deductionOverrides||Array.isArray(b.deductionOverrides)||Object.entries(b.deductionOverrides).some(([month,value])=>!/^\d{4}-\d{2}$/.test(month)||!Number.isFinite(value)||value<0||value>999999999999)))throw new RequestDecisionError('Enter valid monthly deduction amounts.');
}
export async function decideRequestInTransaction(client:PoolClient,actor:string,b:RequestDecision,expectedVersion?:string){
 validateRequestDecision(b);
 await organizationWriteAllowed(actor,client);
 await client.query('SELECT pg_advisory_xact_lock(8470220029)');
 const m=(await client.query('SELECT * FROM workspace_members WHERE user_id=$1',[actor])).rows[0];
 const r=(await client.query('SELECT r.*,r.updated_at::text AS version,m.manager_id,m.role AS employee_role FROM employee_service_requests r JOIN workspace_members m ON m.user_id=r.user_id WHERE r.id=$1 FOR UPDATE OF r',[b.id])).rows[0];
 const owns=r?.user_id===actor;
 const canDecide=m?.active&&!owns&&(m.role==='admin'||(m.role==='manager'&&r.kind!=='ticket_topup'&&r?.manager_id===actor&&!(r.kind==='leave'&&r.employee_role==='manager')));
 const allowed=r&&m?.active&&(b.action==='cancel'?owns||m.role==='admin':b.action==='fulfil'?m.role==='admin'&&!owns:canDecide);
 if(!allowed)throw new RequestDecisionError('Request not found or action not permitted. Self-approval is not allowed.',403);
 const approvedLeave=r.kind==='leave'&&r.status==='approved';
 const cancelApproved=b.action==='cancel'&&approvedLeave&&(m.role==='admin'||(parseLeavePeriod(String(r.details.dates||''))?.start||'')>=localLeaveDate());
 const expected=expectedVersion||b.version;
 if((b.action==='amend_leave'?(!approvedLeave||!canDecide):!cancelApproved&&r.status!==(b.action==='fulfil'?'approved':'pending_approval'))||(expected&&new Date(expected).getTime()!==new Date(r.version).getTime()))throw new RequestDecisionError('The request has already changed or this action is not available. Refresh before deciding.',409);
 if(r.kind==='leave'&&(b.action==='approve'||b.action==='amend_leave')){
  let allocations:LeaveAllocation[];
  try{allocations=JSON.parse(r.details.leaveAllocations);}catch{
   const period=parseLeavePeriod(String(r.details.dates||''));
   if(!period)throw new RequestDecisionError('This older leave record needs its dates reconciled before payroll approval.');
   allocations=(await allocateLeave(client,r.user_id,period,r.id)).allocations;
  }
  if(!Array.isArray(allocations)||!allocations.length)throw new RequestDecisionError('Leave allocation is missing.');
  const treatment=b.payTreatment||'policy';
  if((treatment!=='policy'||Object.keys(b.deductionOverrides||{}).length)&&!b.note.trim())throw new RequestDecisionError('Add a decision note for a pay exception or deduction adjustment.');
  // Paid exceptions are additional benefits; they do not spend tomorrow's entitlement.
  allocations=allocations.map(item=>({...item,entitlementPaid:treatment==='unpaid'?0:(item.entitlementPaid??item.paid),...(treatment==='paid'?{paid:item.paid+item.unpaid,unpaid:0}:treatment==='unpaid'?{unpaid:item.paid+item.unpaid,paid:0}:{})}));
  const payroll=await leavePayroll(client,r.user_id,allocations),unpaid=allocations.reduce((sum,item)=>sum+item.unpaid,0);
  if(unpaid&&!payroll)throw new RequestDecisionError('Configure this employee’s monthly salary and deduction basis before approving unpaid leave.');
  if(Object.keys(b.deductionOverrides||{}).some(month=>!allocations.some(item=>item.month===month&&item.unpaid>0)))throw new RequestDecisionError('Deduction adjustments must match the unpaid leave months.');
  const earlier=(await client.query("SELECT details FROM employee_service_requests WHERE user_id=$1 AND id<>$2 AND kind='leave' AND status IN ('approved','fulfilled')",[r.user_id,r.id])).rows;
  const previous:Record<string,number>={};
  for(const row of earlier){let items;try{items=JSON.parse(row.details.payrollDeduction||'[]');}catch{items=[];}for(const item of items||[])previous[item.month]=(previous[item.month]||0)+Number(item.deduction||0);}
  for(const item of payroll||[]){
   const maximum=Math.max(0,item.monthlySalary-(previous[item.month]||0));
   const adjustment=b.deductionOverrides?.[item.month];
   if(adjustment!==undefined&&adjustment>maximum)throw new RequestDecisionError('Total monthly leave deductions cannot exceed the stored monthly salary.');
   item.deduction=adjustment!==undefined?Math.round(adjustment*100)/100:Math.min(item.deduction,maximum);
  }
  const details={...r.details,leaveAllocations:JSON.stringify(allocations),paidDays:String(allocations.reduce((sum,item)=>sum+item.paid,0)),unpaidDays:String(unpaid),payType:unpaid===0?'paid':allocations.some(item=>item.paid)?'mixed':'unpaid',payTreatment:treatment,payrollDeduction:JSON.stringify(payroll||[]),payrollStatus:unpaid?'Approved deduction for payroll':'No deduction'};
  await client.query('UPDATE employee_service_requests SET details=$2::jsonb WHERE id=$1',[r.id,JSON.stringify(details)]);
  await client.query("INSERT INTO workspace_audit(id,actor_id,target_id,request_id,action,details) VALUES($1,$2,$3,$4,'leave.pay_decision',$5::jsonb)",[randomUUID(),actor,r.user_id,r.id,JSON.stringify({before:r.details,after:details,note:b.note.trim()})]);
 }
 const status={approve:'approved',reject:'rejected',cancel:'cancelled',fulfil:'fulfilled',amend_leave:'approved'}[b.action];
 await client.query('UPDATE employee_service_requests SET status=$2,decided_by=$3,decision_note=$4,updated_at=now() WHERE id=$1',[b.id,status,actor,b.note.trim()]);
 await client.query('INSERT INTO workspace_audit(id,actor_id,target_id,request_id,action,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[randomUUID(),actor,r.user_id,b.id,`request.${b.action}`,JSON.stringify({from:r.status,to:status,note:b.note.trim()})]);
 await queueLeaveEvent(client,b.id);
 return {status,notice:r.kind==='ticket_topup'&&b.action!=='fulfil'?'Ticket top-up decision saved. No tickets were allocated by this decision. Admin can allocate tickets using Top up tickets in Administration.':b.action==='fulfil'?'Manual fulfilment recorded from your verification note. No external system action was executed.':r.kind==='leave'?'Decision saved in AIForce.Ops. Configured leave notifications are queued for email delivery.':'Decision saved in AIForce.Ops.'};
}
