import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import pg from 'pg';
import {load} from './helpers/load-ts.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();let tx=0,sequence=0,clock=0;
const client={async query(sql,args){if(sql==='BEGIN')return c.query('SAVEPOINT membership_test_'+(++tx));if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT membership_test_'+tx--);if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT membership_test_'+tx);return c.query('RELEASE SAVEPOINT membership_test_'+tx--);}return c.query(sql,args);},release(){}};
const db={query:(sql,args)=>c.query(sql,args),connect:async()=>client};
const access={workspaceAccess:async id=>(await c.query('SELECT * FROM workspace_members WHERE user_id=$1',[id])).rows[0]};
const {PaymentError}=load('lib/payment-provider.ts'),{MEMBERSHIP_PLANS}=load('lib/membership-plans.ts');
const subs=new Map(),invoices=new Map(),payments=new Map();let badPlan=false;
const provider={PaymentError,async razorpay(config,path,method,body){
 if(path==='/orders?count=1')return {items:[]};
 if(path.startsWith('/plans/')){const key=path.split('_').at(-1).replace('fixture',''),p=MEMBERSHIP_PLANS[key];return {id:path.slice(7),period:'daily',interval:p.days,item:{amount:badPlan?1:p.price*100,currency:'INR'}};}
 if(path==='/subscriptions'&&method==='POST'){const id='sub_fixture'+(++sequence),s={...body,id,status:'created',short_url:'https://rzp.io/rzp/fixture'};subs.set(id,s);return s;}
 if(path.endsWith('/cancel')){const s=subs.get(path.split('/')[2]);s.status=body.cancel_at_cycle_end?'active':'cancelled';return s;}
 if(path.startsWith('/subscriptions/'))return subs.get(path.split('/')[2]);
 if(path.startsWith('/invoices?')){const id=new URL('https://example.invalid'+path).searchParams.get('subscription_id');return {items:[...invoices.values()].filter(i=>i.subscription_id===id)};}
 if(path.startsWith('/payments/'))return payments.get(path.split('/')[2]);
 throw Error('Unexpected provider request '+path);
}};
const deps={'./db':{db},'@/lib/db':{db},'./workspace-access':access,'@/lib/workspace-access':access,'./payment-provider':provider,'@/lib/payment-provider':provider};
const api=load('lib/payments.ts',deps),membership=load('lib/memberships.ts',deps),review=load('lib/payment-review.ts',deps),tickets=load('lib/tickets.ts',deps);
const secret='fixture-key-secret-only',webhook='fixture-webhook-secret-only',signature=raw=>createHmac('sha256',webhook).update(raw).digest('hex');
async function fixture(role){const id=randomUUID();await c.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Membership fixture',id+'@example.invalid']);await c.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[id,role]);return id;}
const balance=async id=>Number((await c.query('SELECT balance FROM ticket_wallets WHERE user_id=$1',[id])).rows[0].balance);
function charge(providerId,plan,daysAgo=0){const n=++sequence,p={id:'pay_fixture'+n,invoice_id:'inv_fixture'+n,amount:MEMBERSHIP_PLANS[plan].price*100,currency:'INR',status:'captured',captured:true,amount_refunded:0,created_at:clock-daysAgo*86400};const invoice={id:p.invoice_id,subscription_id:providerId,payment_id:p.id,status:'paid',amount_paid:p.amount,currency:'INR'};payments.set(p.id,p);invoices.set(invoice.id,invoice);subs.get(providerId).status='active';return p;}
async function notify(providerId,event='subscription.charged'){const raw=JSON.stringify({event,payload:{subscription:{entity:{id:providerId}}}});return api.paymentWebhook(raw,signature(raw),'member-fixture-'+randomUUID());}
try{
 await c.query('BEGIN');clock=Number((await c.query('SELECT floor(extract(epoch from now())) AS value')).rows[0].value);await c.query('UPDATE payment_settings SET configuration_id=NULL WHERE id=true');
 const admin=await fixture('admin'),user=await fixture('user'),other=await fixture('user'),employee=await fixture('employee');
 const bindings={monthly:'plan_fixturemonthly',weekly:'plan_fixtureweekly',lite:'plan_fixturelite'};
 const settings=(mode,revision=null)=>({revision,mode,keyId:'rzp_'+mode+'_fixture1234',keySecret:secret,webhookSecret:webhook,businessName:'Fixture only',liveAcknowledged:true,merchantPolicies:{termsUrl:'https://example.invalid/terms',privacyUrl:'https://example.invalid/privacy',refundUrl:'https://example.invalid/refunds',supportEmail:'payments@example.invalid'},publicOrigin:'https://example.invalid',enabled:true,membershipPlans:bindings});
 badPlan=true;await assert.rejects(()=>api.savePaymentConfig(admin,settings('test')),/must charge/);badPlan=false;
 const test=await api.savePaymentConfig(admin,settings('test'));
 await assert.rejects(()=>membership.createMembership(employee,{plan:'monthly',requestId:randomUUID(),cycles:12,acceptRecurring:true}),e=>e.status===403);
 await assert.rejects(()=>membership.createMembership(user,{plan:'monthly',requestId:randomUUID(),cycles:12,acceptRecurring:false}),/explicitly accept/);
 const initial=await balance(user),checkout=await membership.createMembership(user,{plan:'lite',requestId:randomUUID(),cycles:12,acceptRecurring:true});
 const testSub=(await membership.membershipState(user)).subscriptions[0];assert.equal(checkout.url,'https://rzp.io/rzp/fixture');
 charge(testSub.provider_id,'lite',2);await notify(testSub.provider_id);await membership.checkMembership(user,testSub.id);assert.equal(await balance(user),initial);
 await assert.rejects(()=>membership.checkMembership(other,testSub.id),e=>e.status===404);
 await assert.rejects(()=>membership.cancelMembership(user,{id:testSub.id,confirm:false}),/Confirm cancellation/);
 await membership.cancelMembership(user,{id:testSub.id,confirm:true});assert.equal((await membership.membershipState(user)).subscriptions[0].cancel_requested,true);
 console.log('PASS plan mapping validation, roles, explicit recurring consent, Test isolation, ownership and cancellation.');

 const live=await api.savePaymentConfig(admin,settings('live',test.id));assert.ok(live.membershipPlans.monthly);
 const liveId=randomUUID();await membership.createMembership(user,{plan:'monthly',requestId:liveId,cycles:12,acceptRecurring:true});
 const sub=(await membership.membershipState(user)).subscriptions.find(s=>s.id===liveId);
 await assert.rejects(()=>membership.createMembership(user,{plan:'weekly',requestId:randomUUID(),cycles:12,acceptRecurring:true}),/already exists/);
 const paid=charge(sub.provider_id,'monthly',2);await notify(sub.provider_id);assert.equal(await balance(user),initial+1100);
 await notify(sub.provider_id);await membership.checkMembership(user,liveId);assert.equal(await balance(user),initial+1100);
 await c.query("UPDATE membership_cycles SET starts_at=now()-interval '40 days',ends_at=now()-interval '10 days' WHERE subscription_id=$1",[liveId]);
 await c.query('SELECT award_membership_rewards($1)',[user]);assert.equal(await balance(user),initial+2500);
 await c.query('SELECT award_membership_rewards($1)',[user]);assert.equal(await balance(user),initial+2500);
 const renewal=charge(sub.provider_id,'monthly');await notify(sub.provider_id);assert.equal(await balance(user),initial+3500);
 const raw=JSON.stringify({event:'subscription.charged',payload:{subscription:{entity:{id:sub.provider_id}}}});await assert.rejects(()=>api.paymentWebhook(raw,'0'.repeat(64),'forged'),/signature/);
 assert.equal((await c.query('SELECT count(*) FROM membership_cycles WHERE subscription_id=$1',[liveId])).rows[0].count,'2');
 await membership.cancelMembership(user,{id:liveId,confirm:true});assert.equal((await membership.membershipState(user)).subscriptions.find(s=>s.id===liveId).cancel_requested,true);
 console.log('PASS captured invoice verification, replay idempotency, exact daily cap, offline earned rewards, renewal cycles and signed webhooks.');

 payments.set(renewal.id,{...renewal,amount_refunded:renewal.amount});
 const refundRaw=JSON.stringify({event:'refund.processed',payload:{refund:{entity:{payment_id:renewal.id}}}});await api.paymentWebhook(refundRaw,signature(refundRaw),'refund-member-fixture');
 await assert.rejects(()=>tickets.requireTickets(user),/refund review/);
 const pending=(await review.refundQueue(admin)).find(r=>r.kind==='membership');assert.ok(pending);
 assert.equal((await review.resolveRefund(admin,{id:pending.id,kind:'membership',refundedAmount:renewal.amount,confirm:true})).ticketsDebited,1000);
 await tickets.requireTickets(user);assert.equal(await balance(user),initial+2500);
 await api.paymentWebhook(refundRaw,signature(refundRaw),'refund-member-fixture-repeat');await tickets.requireTickets(user);
 await c.query("UPDATE workspace_members SET role='employee' WHERE user_id=$1",[user]);await membership.checkMembership(user,liveId);await membership.cancelMembership(user,{id:liveId,confirm:true});
 console.log('PASS membership refund hold, verified Admin adjustment, replay and continued suspension of future refunded-cycle rewards. No real payment or renewal was made.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
