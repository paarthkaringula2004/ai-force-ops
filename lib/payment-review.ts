import {randomUUID} from 'node:crypto';
import {db} from './db';
import {workspaceAccess} from './workspace-access';
import {organizationWriteAllowed} from './organization-security';
import {MEMBERSHIP_PLANS,type MembershipPlan} from './membership-plans';
import {razorpay,PaymentError,type PaymentConfig} from './payment-provider';

export async function refundQueue(user:string){const m=await workspaceAccess(user);if(!m.active||m.role!=='admin')throw new PaymentError('Admin access required.',403);
 return (await db.query(`SELECT o.id,'tickets' AS kind,u.name AS customer,o.mode,o.refunded_amount,o.refund_adjusted_tickets,o.tickets AS granted,o.amount
 FROM payment_orders o JOIN "user" u ON u.id=o.user_id WHERE o.state='refund_review'
 UNION ALL SELECT c.id,'membership' AS kind,u.name AS customer,c.mode,c.refunded_amount,c.refund_adjusted_tickets,c.instant+c.awarded_days*c.daily AS granted,
 CASE s.plan WHEN 'monthly' THEN 79900 WHEN 'weekly' THEN 15900 ELSE 5000 END AS amount
 FROM membership_cycles c JOIN payment_subscriptions s ON s.id=c.subscription_id JOIN "user" u ON u.id=s.user_id WHERE c.refund_review AND NOT c.refund_resolved
 LIMIT 100`)).rows;
}
export async function resolveRefund(user:string,b:Record<string,unknown>){
 const m=await workspaceAccess(user);if(!m.active||m.role!=='admin')throw new PaymentError('Admin access required.',403);await organizationWriteAllowed(user);
 if(b.confirm!==true||typeof b.id!=='string'||!/^[0-9a-f-]{36}$/i.test(b.id)||!['tickets','membership'].includes(String(b.kind))||!Number.isInteger(b.refundedAmount))throw new PaymentError('Review the refund and explicitly confirm the ticket adjustment.');
 const membership=b.kind==='membership';
 const row=(await db.query(membership?'SELECT c.*,s.user_id,s.plan,s.configuration_id FROM membership_cycles c JOIN payment_subscriptions s ON s.id=c.subscription_id WHERE c.id=$1':'SELECT * FROM payment_orders WHERE id=$1',[b.id])).rows[0];if(!row)throw new PaymentError('Refund record not found.',404);
 const c=(await db.query<PaymentConfig>('SELECT * FROM payment_configurations WHERE id=$1',[row.configuration_id])).rows[0];
 const payment=await razorpay(c,'/payments/'+row.provider_payment_id);
 if(payment.id!==row.provider_payment_id||payment.amount_refunded!==b.refundedAmount||payment.amount_refunded!==row.refunded_amount)throw new PaymentError('The provider refund changed. Reconcile and review the current amount first.',409);
 const client=await db.connect();try{await client.query('BEGIN');
  const admin=(await client.query('SELECT active,role FROM workspace_members WHERE user_id=$1',[user])).rows[0];if(!admin?.active||admin.role!=='admin')throw new PaymentError('Admin access required.',403);
  if(membership){await client.query('SELECT refresh_ticket_wallet($1)',[row.user_id]);await client.query('SELECT user_id FROM ticket_wallets WHERE user_id=$1 FOR UPDATE',[row.user_id]);}
  const locked=(await client.query(membership?'SELECT * FROM membership_cycles WHERE id=$1 FOR UPDATE':'SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE',[b.id])).rows[0];
  if(locked.refunded_amount!==b.refundedAmount)throw new PaymentError('Refund changed. Refresh before confirming.',409);
  const granted=membership?locked.instant+locked.awarded_days*locked.daily:row.credited_at?row.tickets:0;
  const amount=membership?MEMBERSHIP_PLANS[row.plan as MembershipPlan].price*100:row.amount;
  const required=row.mode==='live'?Math.ceil(granted*locked.refunded_amount/amount):0;
  const debit=Math.max(0,required-locked.refund_adjusted_tickets);
  await client.query('SELECT refresh_ticket_wallet($1)',[row.user_id]);
  const wallet=(await client.query('SELECT balance,paid_balance FROM ticket_wallets WHERE user_id=$1 FOR UPDATE',[row.user_id])).rows[0];
  if(!wallet||Number(wallet.balance)<debit)throw new PaymentError('The refunded tickets were already spent. Keep the account on hold and resolve repayment or an approved credit allocation before retrying.',409);
  if(debit){await client.query('UPDATE ticket_wallets SET balance=balance-$2,paid_balance=GREATEST(0,paid_balance-$2),updated_at=now() WHERE user_id=$1',[row.user_id,debit]);await client.query("INSERT INTO ticket_ledger(id,user_id,amount,kind) VALUES($1,$2,$3,'refund_adjustment')",[randomUUID(),row.user_id,-debit]);}
  await client.query(membership?'UPDATE membership_cycles SET refund_resolved=true,resolved_refund_amount=refunded_amount,refund_adjusted_tickets=$2 WHERE id=$1':"UPDATE payment_orders SET state='refunded',resolved_refund_amount=refunded_amount,refund_adjusted_tickets=$2 WHERE id=$1",[b.id,required]);
  await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'payment.refund_review_resolved',$3::jsonb)",[randomUUID(),user,JSON.stringify({id:b.id,kind:b.kind,refundedAmount:b.refundedAmount,ticketsDebited:debit})]);
  await client.query('COMMIT');return {ticketsDebited:debit};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
