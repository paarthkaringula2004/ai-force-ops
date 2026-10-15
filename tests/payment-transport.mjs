import 'dotenv/config';
import assert from 'node:assert/strict';
import {load} from './helpers/load-ts.mjs';
const {seal}=load('lib/eassist/transport.ts'),{razorpay}=load('lib/payment-provider.ts');
const original=globalThis.fetch,config={key_id:'rzp_test_fixture',key_cipher:seal('fixture-secret-only')};
try{
 for(const [path,method] of [['https://evil.example','GET'],['/orders/../payments','GET'],['/orders','DELETE'],['/orders?count=1','POST'],['/subscriptions/sub_a/cancel','GET']])await assert.rejects(()=>razorpay(config,path,method),/Unsupported/);
 let seen;globalThis.fetch=async (url,options)=>{seen={url,options};return Response.json({id:'order_fixture'});};
 assert.equal((await razorpay(config,'/orders','POST',{amount:8000})).id,'order_fixture');assert.equal(seen.url,'https://api.razorpay.com/v1/orders');assert.equal(seen.options.redirect,'error');assert.equal(seen.options.cache,'no-store');assert.equal(JSON.parse(seen.options.body).amount,8000);
 for(const response of [()=>new Response('not-json'),()=>Response.json(null),()=>Response.json([]),()=>new Response('x'.repeat(1024*1024+1))]){globalThis.fetch=async()=>response();await assert.rejects(()=>razorpay(config,'/orders?count=1'),e=>e.status===502);}
 globalThis.fetch=async()=>new Response('private upstream secret',{status:401});await assert.rejects(()=>razorpay(config,'/orders?count=1'),e=>e.status===400&&!e.message.includes('private'));
 globalThis.fetch=async()=>{throw Error('network private data');};await assert.rejects(()=>razorpay(config,'/orders?count=1'),e=>e.status===503&&!e.message.includes('private'));
 console.log('PASS fixed-host/method restrictions, auth request, no redirects/cache, bounded JSON and sanitized provider failures.');
}finally{globalThis.fetch=original;}
