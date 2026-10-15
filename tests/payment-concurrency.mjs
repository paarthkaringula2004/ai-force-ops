import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import pg from 'pg';
import {load} from './helpers/load-ts.mjs';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:6}),user=randomUUID(),configuration=randomUUID(),order=randomUUID();
const email='payment-concurrency-'+user+'@example.invalid',providerOrder='order_'+order.replaceAll('-',''),providerPayment='pay_'+order.replaceAll('-','');
const key='fixture-concurrency-secret',webhook='fixture-concurrency-webhook',sign=(secret,value)=>createHmac('sha256',secret).update(value).digest('hex');
const {seal}=load('lib/eassist/transport.ts'),{PaymentError}=load('lib/payment-provider.ts');
const payment={id:providerPayment,order_id:providerOrder,amount:8000,currency:'INR',captured:true,status:'captured',amount_refunded:0};
const provider={PaymentError,razorpay:async()=>payment};
const deps={'./db':{db},'@/lib/db':{db},'./payment-provider':provider,'@/lib/payment-provider':provider};
const api=load('lib/payments.ts',deps);
try{
 // Committed disposable fixture, separate real database transactions, no change
 // to payment_settings and no vendor call. Exact IDs are removed in finally.
 await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[user,'Disposable concurrency fixture',email]);
 await db.query('INSERT INTO payment_configurations(id,mode,key_id,key_cipher,webhook_cipher,public_origin,business_name,enabled,verified_at,created_by) VALUES($1,\'live\',\'rzp_live_fixture\',$2,$3,\'https://example.invalid\',\'Fixture only\',true,now(),$4)',[configuration,seal(key),seal(webhook),user]);
 await db.query("INSERT INTO payment_orders(id,user_id,configuration_id,tickets,amount,mode,state,provider_order_id) VALUES($1,$2,$3,100,8000,'live','pending',$4)",[order,user,configuration,providerOrder]);
 const before=Number((await db.query('SELECT balance FROM ticket_wallets WHERE user_id=$1',[user])).rows[0].balance);
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:payment}}});
 const callback={razorpay_order_id:providerOrder,razorpay_payment_id:providerPayment,razorpay_signature:sign(key,providerOrder+'|'+providerPayment)};
 const result=await Promise.all([api.paymentCallback(callback),api.paymentWebhook(raw,sign(webhook,raw),'fixture-'+order),api.paymentCallback(callback)]);
 assert.ok(result.every(r=>r.state==='paid'));
 assert.equal(Number((await db.query('SELECT balance FROM ticket_wallets WHERE user_id=$1',[user])).rows[0].balance),before+100);
 assert.equal((await db.query("SELECT count(*) FROM ticket_ledger WHERE user_id=$1 AND kind='purchase'",[user])).rows[0].count,'1');
 console.log('PASS simultaneous callback + webhook + repeated callback: three independent transactions, exactly one wallet credit and purchase ledger entry.');
}finally{
 await db.query('DELETE FROM payment_events WHERE order_id=$1',[order]);
 await db.query('DELETE FROM ticket_ledger WHERE user_id=$1',[user]);
 await db.query('DELETE FROM workspace_audit WHERE actor_id=$1',[user]);
 await db.query('DELETE FROM payment_orders WHERE id=$1 AND user_id=$2',[order,user]);
 await db.query('DELETE FROM payment_configurations WHERE id=$1 AND created_by=$2',[configuration,user]);
 await db.query('DELETE FROM "user" WHERE id=$1 AND email=$2',[user,email]);
 await db.end();
}
