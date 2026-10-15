import {randomUUID,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {db} from './db';
import {workspaceAccess} from './workspace-access';
import {seal,unseal} from './eassist/transport';
import {organizationWriteAllowed} from './organization-security';
import {membershipState,membershipWebhook,validateMembershipPlans,membershipRefund} from './memberships';
import {TICKET_PACKS} from './model-pricing';
import {razorpay,PaymentError,type PaymentConfig} from './payment-provider';
export {PaymentError};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function admin(user:string,connection:Pick<typeof db,'query'>=db){const m=(await connection.query('SELECT active,role FROM workspace_members WHERE user_id=$1',[user])).rows[0];if(!m?.active||m.role!=='admin')throw new PaymentError('Only an active Admin can configure payments.',403);}
export async function currentPaymentConfig(){return (await db.query<PaymentConfig>('SELECT c.* FROM payment_settings s JOIN payment_configurations c ON c.id=s.configuration_id WHERE s.id=true')).rows[0]||null;}
export function publicConfig(c:PaymentConfig|null){return c?{id:c.id,mode:c.mode,keyId:c.key_id,publicOrigin:c.public_origin,businessName:c.business_name,enabled:c.enabled,verifiedAt:c.verified_at,hasKeySecret:!!c.key_cipher,hasWebhookSecret:!!c.webhook_cipher,webhookVerifiedAt:c.webhook_verified_at||null,membershipPlans:c.membership_plans||{},merchantPolicies:c.merchant_policies||{},liveAcknowledgedAt:c.live_acknowledged_at||null}:null;}
export async function paymentState(user:string){const member=await workspaceAccess(user);if(!member.active)throw new PaymentError('Payments are not available to this account.',403);const c=await currentPaymentConfig();const orders=(await db.query('SELECT id,tickets,amount,mode,state,provider_order_id,provider_payment_id,provider_status,refunded_amount,checked_at,created_at,credited_at FROM payment_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',[user])).rows;return {memberships:await membershipState(user),availableMemberships:Object.keys(c?.membership_plans||{}),merchantPolicies:c?.merchant_policies||{},canPurchase:['user','admin'].includes(member.role),canConfigure:member.role==='admin',unlimited:member.role==='admin',integration:member.role==='admin'?publicConfig(c):c?{mode:c.mode,enabled:c.enabled,verifiedAt:c.verified_at}:null,orders,...(member.role==='admin'?{readiness:{apiVerified:!!c?.verified_at,webhookObserved:!!c?.webhook_verified_at,liveEnabled:c?.mode==='live'&&c.enabled,membershipBilling:Object.keys(c?.membership_plans||{}).length===3,automatedRefunds:false},reviewOrders:(await db.query("SELECT o.id,o.tickets,o.amount,o.mode,o.state,o.refunded_amount,o.checked_at,u.name AS customer FROM payment_orders o JOIN \"user\" u ON u.id=o.user_id WHERE o.state='refund_review' ORDER BY o.updated_at DESC LIMIT 50")).rows}:{})};}
export async function savePaymentConfig(user:string,b:Record<string,unknown>){
 await admin(user);const previous=await currentPaymentConfig();
 if(b.revision!==(previous?.id||null))throw new PaymentError('The integration changed. Refresh before saving.',409);
 if(b.action==='pause'){
  const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT configuration_id FROM payment_settings WHERE id=true FOR UPDATE');await admin(user,client);const current=(await client.query('SELECT configuration_id FROM payment_settings WHERE id=true')).rows[0]?.configuration_id||null;if(current!==(previous?.id||null))throw new PaymentError('The integration changed. Refresh before saving.',409);if(previous){await client.query('UPDATE payment_configurations SET enabled=false WHERE id=$1',[previous.id]);await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'payment.integration_paused',$3::jsonb)",[randomUUID(),user,JSON.stringify({configurationId:previous.id})]);}await client.query('COMMIT');return publicConfig(previous?{...previous,enabled:false}:null);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 if(!['test','live'].includes(String(b.mode))||typeof b.keyId!=='string'||!new RegExp('^rzp_'+b.mode+'_[A-Za-z0-9]{6,80}$').test(b.keyId)||typeof b.businessName!=='string'||!b.businessName.trim()||b.businessName.length>100||typeof b.enabled!=='boolean')throw new PaymentError('Enter the Razorpay mode, matching Key ID, business name and checkout status.');
 let url:URL;try{url=new URL(String(b.publicOrigin));}catch{throw new PaymentError('Enter your application origin, for example https://app.example.com.');}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||b.mode==='test'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new PaymentError('Use an HTTPS application origin without a path. HTTP localhost is supported only in Test mode.');
 const same=previous?.key_id===b.keyId&&previous?.mode===b.mode;
 const key=typeof b.keySecret==='string'&&b.keySecret?b.keySecret:same&&previous?unseal(previous.key_cipher):'';
 const webhook=typeof b.webhookSecret==='string'&&b.webhookSecret?b.webhookSecret:same&&previous?unseal(previous.webhook_cipher):'';
 if(key.length<12||key.length>512||webhook.length<16||webhook.length>512)throw new PaymentError('Enter the Key Secret and a webhook secret of at least 16 characters. Blank fields preserve secrets only for the same saved key and mode.');
 const policies:Record<string,string>={};const values=b.merchantPolicies??{};
 if(!values||typeof values!=='object'||Array.isArray(values))throw new PaymentError('Enter valid merchant policy details.');
 for(const name of ['termsUrl','privacyUrl','refundUrl','supportEmail']){
  const value=(values as Record<string,unknown>)[name];if(value==null||value==='')continue;
  if(typeof value!=='string'||value.length>1000)throw new PaymentError('Invalid merchant policy field.');
  if(name==='supportEmail'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new PaymentError('Enter a valid payment support email.');}
  else{let policy:URL;try{policy=new URL(value);}catch{throw new PaymentError('Enter valid HTTPS policy URLs.');}if(policy.protocol!=='https:'||policy.username||policy.password)throw new PaymentError('Policy links must use HTTPS without embedded credentials.');}
  policies[name]=value;
 }
 if(b.mode==='live'&&b.enabled&&(b.liveAcknowledged!==true||Object.keys(policies).length!==4))throw new PaymentError('Before enabling Live payments, add support and policy links and confirm your provider acceptance checks.');
 const config:PaymentConfig={id:randomUUID(),mode:b.mode as 'test'|'live',key_id:b.keyId,key_cipher:seal(key),webhook_cipher:seal(webhook),public_origin:url.origin,business_name:b.businessName.trim(),enabled:b.enabled,verified_at:new Date().toISOString()};
 config.merchant_policies=policies;config.live_acknowledged_at=b.mode==='live'&&b.liveAcknowledged===true?new Date().toISOString():null;
 await razorpay(config,'/orders?count=1');config.membership_plans=await validateMembershipPlans(config,b.membershipPlans??(same?previous?.membership_plans||{}:{}));
 const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT configuration_id FROM payment_settings WHERE id=true FOR UPDATE');await admin(user,client);const active=(await client.query('SELECT configuration_id FROM payment_settings WHERE id=true')).rows[0]?.configuration_id||null;if(active!==(previous?.id||null))throw new PaymentError('The integration changed. Refresh before saving.',409);
 await client.query('INSERT INTO payment_configurations(id,mode,key_id,key_cipher,webhook_cipher,public_origin,business_name,enabled,verified_at,created_by,membership_plans,merchant_policies,live_acknowledged_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10::jsonb,$11::jsonb,$12)',[config.id,config.mode,config.key_id,config.key_cipher,config.webhook_cipher,config.public_origin,config.business_name,config.enabled,user,JSON.stringify(config.membership_plans),JSON.stringify(policies),config.live_acknowledged_at]);
 await client.query('UPDATE payment_settings SET configuration_id=$1 WHERE id=true',[config.id]);await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'payment.integration_saved',$3::jsonb)",[randomUUID(),user,JSON.stringify({mode:config.mode,enabled:config.enabled,configurationId:config.id})]);await client.query('COMMIT');return publicConfig(config);
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
type Order={id:string;user_id:string;configuration_id:string;tickets:number;amount:number;mode:'test'|'live';state:string;provider_order_id:string|null;provider_payment_id:string|null;credited_at:string|null};
async function orderByProvider(id:string){if(!/^order_[A-Za-z0-9]{1,100}$/.test(id))throw new PaymentError('Invalid order.');const o=(await db.query<Order>('SELECT * FROM payment_orders WHERE provider_order_id=$1',[id])).rows[0];if(!o)throw new PaymentError('Payment order not found.',404);return o;}
async function configFor(o:Order){const c=(await db.query<PaymentConfig>('SELECT * FROM payment_configurations WHERE id=$1',[o.configuration_id])).rows[0];if(!c)throw new PaymentError('Payment configuration unavailable.',503);return c;}
async function checkout(o:Order,c:PaymentConfig,contact:string){const buyer=(await db.query('SELECT name,email FROM "user" WHERE id=$1',[o.user_id])).rows[0];if(!buyer?.email)throw new PaymentError('Your account email is unavailable.',409);return {id:o.id,state:o.state,mode:o.mode,action:'https://api.razorpay.com/v1/checkout/embedded',fields:{'prefill[name]':String(buyer.name||''),'prefill[email]':String(buyer.email),'prefill[contact]':contact,key_id:c.key_id,amount:String(o.amount),currency:'INR',order_id:o.provider_order_id!,name:c.business_name,description:`${o.tickets} AIForce.Ops tickets${o.mode==='test'?' (TEST - no ticket credit)':''}`,callback_url:c.public_origin+'/api/payments/callback',cancel_url:c.public_origin+'/dashboard/payments?payment='+o.id+'&checkout=cancelled'}};}
export async function createPaymentOrder(user:string,b:Record<string,unknown>){
 const pack=TICKET_PACKS.find(p=>p.tickets===b.tickets);
 if(!uuid(b.requestId)||!Number.isInteger(b.tickets)||!pack)throw new PaymentError('Choose a valid ticket pack.');
 const contact=typeof b.contact==='string'?b.contact.replace(/[ ()-]/g,''):'';
 if(!/^\+?[1-9]\d{7,14}$/.test(contact))throw new PaymentError('Enter your phone number with country code for Razorpay checkout.');
 const client=await db.connect();let order:Order,c:PaymentConfig,isNew=false;
 try{
  await client.query('BEGIN');
  // Serialize checkout creation for an account, including permission changes.
  const m=(await client.query('SELECT role,active FROM workspace_members WHERE user_id=$1 FOR UPDATE',[user])).rows[0];
  if(!m?.active||!['user','admin'].includes(m.role))throw new PaymentError('This account cannot purchase tickets.',403);
  await organizationWriteAllowed(user,client);
  c=(await client.query<PaymentConfig>('SELECT c.* FROM payment_settings s JOIN payment_configurations c ON c.id=s.configuration_id WHERE s.id=true FOR SHARE OF s,c')).rows[0];
  if(!c?.enabled||!c.verified_at)throw new PaymentError('Payment integration is not enabled. Ask an Admin to configure it.',409);
  if(m.role==='admin'&&c.mode==='live')throw new PaymentError('Admin tickets are unlimited. Use a User account to purchase tickets.');
  const prior=(await client.query<Order>('SELECT * FROM payment_orders WHERE id=$1',[b.requestId])).rows[0];
  if(prior){
   if(prior.user_id!==user||prior.tickets!==pack.tickets)throw new PaymentError('That attempt belongs to a different purchase.',409);
   if(prior.credited_at||['failed','refunded','refund_review'].includes(prior.state))throw new PaymentError('This purchase is already completed or closed. Check its history instead.',409);
   if(!prior.provider_order_id)throw new PaymentError('This attempt is still pending or could not be confirmed. Check history before starting a new attempt.',409);
   if(prior.configuration_id!==c.id)throw new PaymentError('The integration changed. Check the old purchase before starting a new checkout.',409);
   order=prior;
  }else{
   const recent=(await client.query("SELECT count(*) FROM payment_orders WHERE user_id=$1 AND created_at>now()-interval '15 minutes'",[user])).rows[0];
   if(Number(recent.count)>=20)throw new PaymentError('Too many checkout attempts. Review your payment history and try later.',429);
   order=(await client.query<Order>('INSERT INTO payment_orders(id,user_id,configuration_id,tickets,amount,mode) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[b.requestId,user,c.id,pack.tickets,Math.round(pack.price*100),c.mode])).rows[0];isNew=true;
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 if(!isNew)return checkout(order,c,contact);
 try{
  const remote=await razorpay(c,'/orders','POST',{amount:order.amount,currency:'INR',receipt:order.id,partial_payment:false});
  if(typeof remote.id!=='string'||!/^order_[A-Za-z0-9]+$/.test(remote.id)||remote.amount!==order.amount||remote.currency!=='INR')throw new PaymentError('Razorpay returned an unexpected order.',502);
  order=(await db.query<Order>("UPDATE payment_orders SET provider_order_id=$2,state='pending',updated_at=now() WHERE id=$1 RETURNING *",[order.id,remote.id])).rows[0];
 }catch(error){await db.query("UPDATE payment_orders SET state='unknown',updated_at=now() WHERE id=$1",[order.id]);throw error;}
 return checkout(order,c,contact);
}
export function verifyPaymentSignature(secret:string,message:string,signature:string){if(!/^[a-f0-9]{64}$/i.test(signature))return false;return timingSafeEqual(Buffer.from(createHmac('sha256',secret).update(message).digest('hex'),'hex'),Buffer.from(signature,'hex'));}
async function settle(o:Order,p:Record<string,unknown>,eventId?:string){
 if(p.id==null||!/^pay_[A-Za-z0-9]{1,100}$/.test(String(p.id))||p.order_id!==o.provider_order_id||p.amount!==o.amount||p.currency!=='INR'||p.status!=='captured'||p.captured!==true||Number(p.amount_refunded||0)!==0)throw new PaymentError('The payment is not a captured, matching, unrefunded payment. No tickets were added.',409);
 const client=await db.connect();try{await client.query('BEGIN');const locked=(await client.query<Order>('SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE',[o.id])).rows[0];
 if(['refunded','refund_review'].includes(locked.state))throw new PaymentError('This purchase has a refund and requires financial review. No further credit was applied.',409);
 if(locked.credited_at){if(locked.provider_payment_id!==p.id)throw new PaymentError('This order was already settled by another payment.',409);await client.query('COMMIT');return {id:o.id,state:locked.state,credited:o.mode==='live'?o.tickets:0};}
 if(o.mode==='live'){await client.query('SELECT refresh_ticket_wallet($1)',[o.user_id]);const credited=await client.query('UPDATE ticket_wallets SET balance=balance+$2,paid_balance=paid_balance+$2,updated_at=now() WHERE user_id=$1',[o.user_id,o.tickets]);if(credited.rowCount!==1)throw new PaymentError('The ticket wallet is unavailable. Payment remains pending reconciliation.',503);await client.query("INSERT INTO ticket_ledger(id,user_id,amount,kind,payment_order_id) VALUES($1,$2,$3,'purchase',$4)",[randomUUID(),o.user_id,o.tickets,o.id]);}
 const state=o.mode==='live'?'paid':'test_paid';await client.query("UPDATE payment_orders SET state=$2,provider_payment_id=$3,provider_status='captured',checked_at=now(),credited_at=now(),updated_at=now() WHERE id=$1",[o.id,state,p.id]);if(eventId)await client.query('INSERT INTO payment_events(id,order_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[eventId,o.id,'payment.captured']);await client.query("INSERT INTO workspace_audit(id,actor_id,action,details) VALUES($1,$2,'payment.capture_verified',$3::jsonb)",[randomUUID(),o.user_id,JSON.stringify({orderId:o.id,mode:o.mode,tickets:o.mode==='live'?o.tickets:0})]);await client.query('COMMIT');return {id:o.id,state,credited:o.mode==='live'?o.tickets:0};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function paymentCallback(b:Record<string,unknown>){const o=await orderByProvider(String(b.razorpay_order_id||'')),c=await configFor(o);const payment=String(b.razorpay_payment_id||'');if(!/^pay_[A-Za-z0-9]{1,100}$/.test(payment)||!verifyPaymentSignature(unseal(c.key_cipher),o.provider_order_id+'|'+payment,String(b.razorpay_signature||'')))throw new PaymentError('Payment signature verification failed.',400);return {...await settle(o,await razorpay(c,'/payments/'+payment)),origin:c.public_origin};}
async function observePayment(o:Order,p:Record<string,unknown>){
 if(!p||typeof p.id!=='string'||!/^pay_[A-Za-z0-9]{1,100}$/.test(p.id)||p.order_id!==o.provider_order_id||p.amount!==o.amount||p.currency!=='INR')throw new PaymentError('The provider payment does not match this purchase.',409);
 const refunded=Number(p.amount_refunded||0);
 if(!Number.isInteger(refunded)||refunded<0||refunded>o.amount)throw new PaymentError('Unexpected refund amount.',502);
 if(refunded>0||p.status==='refunded'){
  const row=(await db.query<Order>("UPDATE payment_orders SET state=CASE WHEN credited_at IS NULL OR mode='test' OR GREATEST(refunded_amount,$2)<=resolved_refund_amount THEN 'refunded' ELSE 'refund_review' END,refunded_amount=GREATEST(refunded_amount,$2),provider_status=$3,checked_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[o.id,refunded,String(p.status)])).rows[0];
  return {id:o.id,state:row.state,credited:0};
 }
 if(p.status==='captured')return settle(o,p);
 if(!['created','authorized','failed'].includes(String(p.status)))throw new PaymentError('Unexpected provider payment status.',502);
 const row=(await db.query<Order>("UPDATE payment_orders SET provider_status=$2,checked_at=now(),state=CASE WHEN credited_at IS NOT NULL THEN state WHEN $2='failed' THEN 'failed' ELSE 'pending' END,updated_at=now() WHERE id=$1 RETURNING *",[o.id,p.status])).rows[0];
 return {id:o.id,state:row.state,credited:0};
}
export async function paymentWebhook(raw:string,signature:string,eventId:string){
 let b;try{b=JSON.parse(raw);}catch{throw new PaymentError('Invalid webhook.');}
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.event!=='string')throw new PaymentError('Invalid webhook.');
 if(['subscription.authenticated','subscription.activated','subscription.charged','subscription.pending','subscription.halted','subscription.cancelled','subscription.completed','subscription.updated'].includes(b.event))return membershipWebhook(raw,signature,b);
 if(!['payment.captured','payment.failed','order.paid','refund.processed'].includes(b.event))return {ignored:true};
 const entity=b.payload?.payment?.entity;
 const refund=b.event==='refund.processed'?b.payload?.refund?.entity:null;
 if(!entity&&!refund)throw new PaymentError('Missing payment entity.');
 // Refund notifications carry payment_id; a verified provider lookup supplies order_id.
 let o:Order,c:PaymentConfig;
 if(refund){
  if(typeof refund.payment_id!=='string'||!/^pay_[A-Za-z0-9]{1,100}$/.test(refund.payment_id))throw new PaymentError('Invalid refund payment.');
  o=(await db.query<Order>('SELECT * FROM payment_orders WHERE provider_payment_id=$1',[refund.payment_id])).rows[0];
  if(!o)return membershipRefund(raw,signature,refund.payment_id);
  c=await configFor(o);
 }else{if(typeof entity.order_id!=='string')throw new PaymentError('Missing payment order.');o=await orderByProvider(entity.order_id);c=await configFor(o);}
 if(!verifyPaymentSignature(unseal(c.webhook_cipher),raw,signature))throw new PaymentError('Invalid webhook signature.',400);
 const p=await razorpay(c,'/payments/'+String(refund?refund.payment_id:entity.id));
 const result=await observePayment(o,p);
 await db.query('UPDATE payment_configurations SET webhook_verified_at=now() WHERE id=$1',[c.id]);
 await db.query('INSERT INTO payment_events(id,order_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[eventId?eventId.slice(0,200):createHash('sha256').update(raw).digest('hex'),o.id,b.event]);
 return result;
}
export async function reconcilePayment(user:string,id:unknown){
 const member=await workspaceAccess(user);if(!member.active)throw new PaymentError('Your account does not permit payment reconciliation.',403);
 if(!uuid(id))throw new PaymentError('Choose a payment attempt.');
 const o=(await db.query<Order>('SELECT * FROM payment_orders WHERE id=$1 AND user_id=$2',[id,user])).rows[0];
 if(!o?.provider_order_id)throw new PaymentError('No confirmed provider order exists for this attempt.',409);
 const c=await configFor(o);
 const result=await razorpay(c,'/orders/'+o.provider_order_id+'/payments');
 if(!Array.isArray(result.items))throw new PaymentError('Razorpay returned an invalid payment list.',502);
 const rows=result.items.filter((p:unknown):p is Record<string,unknown>=>!!p&&typeof p==='object'&&!Array.isArray(p));
 const payment=rows.find(p=>p.id===o.provider_payment_id)||rows.find(p=>p.status==='captured')||rows.find(p=>p.status==='authorized')||rows.at(-1);
 if(!payment){await db.query('UPDATE payment_orders SET checked_at=now() WHERE id=$1',[o.id]);return {id:o.id,state:o.state,credited:0};}
 return observePayment(o,payment);
}
export async function recoverPayment(user:string,b:Record<string,unknown>){
 const m=await workspaceAccess(user);if(!m.active||!['user','admin'].includes(m.role))throw new PaymentError('Payment recovery is unavailable.',403);await organizationWriteAllowed(user);
 if(!uuid(b.id)||typeof b.providerId!=='string'||!/^order_[A-Za-z0-9]{1,100}$/.test(b.providerId))throw new PaymentError('Enter the order ID shown in Razorpay.');
 const o=(await db.query<Order>('SELECT * FROM payment_orders WHERE id=$1 AND user_id=$2',[b.id,user])).rows[0];if(!o||o.state!=='unknown'||o.provider_order_id)throw new PaymentError('This purchase does not need recovery.',409);
 const c=await configFor(o),p=await razorpay(c,'/orders/'+b.providerId);
 if(p.id!==b.providerId||p.receipt!==o.id||p.amount!==o.amount||p.currency!=='INR')throw new PaymentError('The provider order does not match this purchase.',409);
 const updated=await db.query("UPDATE payment_orders SET provider_order_id=$2,state='pending',updated_at=now() WHERE id=$1 AND provider_order_id IS NULL AND state='unknown'",[o.id,b.providerId]);if(updated.rowCount!==1)throw new PaymentError('Purchase changed. Refresh.',409);
 return reconcilePayment(user,o.id);
}
