"use client";
import {useEffect,useState} from 'react';
import ThemedSelect from '@/components/themed-select';
import SalarySettings from './SalarySettings';
type Allocation={month:string;paid:number;unpaid:number};
export default function LeavePayReview({userId,name,details,onTreatment,onDeduction}:{userId:string;name:string;details:Record<string,string>;onTreatment:(value:string)=>void;onDeduction:(month:string,value:string)=>void}){
 const [treatment,setTreatment]=useState('policy');
 const [salary,setSalary]=useState<{monthly_salary:string;currency:string;deduction_basis:string}|null>(null);
 let allocations:Allocation[]=[];try{allocations=JSON.parse(details.leaveAllocations||'[]');}catch{}
 useEffect(()=>{const controller=new AbortController();fetch(`/api/workspace/salary?userId=${encodeURIComponent(userId)}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{if(r.ok)setSalary((await r.json()).salary);}).catch(()=>{});return()=>controller.abort();},[userId]);
 return <div className="my-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"><h3 className="text-sm font-semibold">Leave pay decision</h3><p className="mt-1 text-xs leading-5 text-slate-500">Additional leave defaults to unpaid. Record a reason for any exception or adjusted deduction. This records a payroll adjustment; it does not alter base salary or transfer money.</p><label className="mt-3 block text-xs">Pay treatment<ThemedSelect className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={treatment} onChange={e=>{setTreatment(e.target.value);onTreatment(e.target.value);}}><option value="policy">Keep recorded paid / unpaid allocation</option><option value="paid">Grant all days as paid leave</option><option value="unpaid">Treat all days as unpaid leave</option></ThemedSelect></label>{allocations.map(item=>{
  const unpaid=treatment==='paid'?0:treatment==='unpaid'?item.paid+item.unpaid:item.unpaid;
  if(!unpaid)return <p key={item.month} className="mt-2 text-xs text-emerald-700">{item.month}: No salary deduction.</p>;
  const [year,month]=item.month.split('-').map(Number),divisor=salary?.deduction_basis==='fixed_30'?30:new Date(Date.UTC(year,month,0)).getUTCDate();
  const estimate=salary?Math.round(Number(salary.monthly_salary)/divisor*unpaid*100)/100:null;
  return <label key={item.month} className="mt-3 block text-xs">{item.month} · {unpaid} unpaid days{salary?` · ${salary.currency} ${Number(salary.monthly_salary).toFixed(2)} ÷ ${divisor}`:' · Salary settings required'}<input aria-label={`Deduction for ${item.month}`} type="number" min="0" step="0.01" key={`${item.month}:${treatment}`} placeholder={estimate===null?'Set salary before approving':`Calculated: ${estimate.toFixed(2)}; leave blank to use formula`} onChange={e=>onDeduction(item.month,e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/></label>;
 })}<SalarySettings userId={userId} name={name}/><button type="button" onClick={()=>{fetch(`/api/workspace/salary?userId=${encodeURIComponent(userId)}`,{cache:'no-store'}).then(async r=>{if(r.ok)setSalary((await r.json()).salary);}).catch(()=>{});}} className="mt-2 text-xs text-indigo-700">Refresh salary estimate</button></div>;
}
