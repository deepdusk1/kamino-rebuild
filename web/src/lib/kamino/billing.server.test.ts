import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from '../db';
import { applyStripeEvent, checkoutUrl, resumeCheckout, type StripeRequest } from './billing.server.ts';
import { paidResourceAccessSql } from './billing-policy.ts';
import type { BillingConfig, BillingOrderSnapshot, StripeEvent, StripeObject } from './billing-rules.ts';

// These tests use embedded Postgres and an injected provider. No secret, checkout or network call leaves the test.
const pg=new PGlite();await pg.waitReady;
await pg.exec('create table creator_offers(id int primary key);insert into creator_offers values(1);create table memberships(community_id text,user_id text,status text,role text);create table profiles(user_id text primary key);');
await pg.exec(readFileSync(new URL('../../../migrations/0032_billing.sql',import.meta.url),'utf8'));
await pg.exec(readFileSync(new URL('../../../migrations/0034_billing_revision.sql',import.meta.url),'utf8'));
await pg.exec(readFileSync(new URL('../../../migrations/0036_privacy_billing.sql',import.meta.url),'utf8'));
after(()=>pg.close());
const sql=(async(strings:TemplateStringsArray,...values:unknown[])=>{let query=strings[0]!;for(let i=0;i<values.length;i++)query+=`$${i+1}${strings[i+1]}`;return(await pg.query(query,values)).rows;}) as Sql;
sql.query=async<T>(query:string,values:unknown[]=[])=> (await pg.query<T>(query,values)).rows;
const config:BillingConfig={enabled:true,mode:'test',origin:'http://localhost:8085',secretKey:'unused',webhookSecret:'unused',reason:'Mock provider only'};
let sequence=0;
async function order(mode:'payment'|'subscription'='payment',linked=false){
  const n=++sequence,id=`order${n}`,buyerId=`buyer${n}`,beneficiaryId=`friend${n}`,sessionId=`cs_test_Order${n}`,subId=`sub_Order${n}`,paymentId=`pi_Order${n}`,customerId=`cus_Order${n}`;
  await sql`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode,stripe_session_id,stripe_subscription_id)
    values(${id},${buyerId},${beneficiaryId},1,'seller',${mode==='subscription'?'membership':'gift'},'Mock offer',500,'usd',${mode},${sessionId},${linked?subId:null})`;
  const snapshot:BillingOrderSnapshot={id,buyerId,beneficiaryId,priceMinor:500,currency:'usd',mode};
  const metadata={kamino_order_id:id,kamino_buyer_id:buyerId,kamino_beneficiary_id:beneficiaryId};
  const session={id:sessionId,livemode:false,metadata,client_reference_id:id,mode,payment_status:'paid',status:'complete',amount_total:500,currency:'usd',customer:customerId,payment_intent:paymentId,subscription:subId};
  const invoiceId=`in_Order${n}`,end=Math.floor(Date.now()/1000)+3600;
  const invoice={id:invoiceId,livemode:false,subscription:subId,customer:customerId,status:'paid',paid:true,paid_out_of_band:false,currency:'usd',amount_paid:500,payment_intent:paymentId};
  const subscription={id:subId,livemode:false,metadata,status:'active',customer:customerId,latest_invoice:invoiceId,current_period_end:end,items:{data:[{quantity:1,price:{unit_amount:500,currency:'usd',recurring:{interval:'month',interval_count:1}}}]}};
  const payment={id:paymentId,livemode:false,metadata,amount:500,currency:'usd'};
  const charge={id:`ch_Order${n}`,livemode:false,payment_intent:paymentId,amount_refunded:500,refunded:true,invoice:mode==='subscription'?invoiceId:null};
  const objects:Record<string,StripeObject>={[`/v1/checkout/sessions/${sessionId}`]:session,[`/v1/subscriptions/${subId}`]:subscription,[`/v1/invoices/${invoiceId}`]:invoice,[`/v1/payment_intents/${paymentId}`]:payment,[`/v1/charges/${charge.id}`]:charge};
  const api:StripeRequest=async path=>{assert.ok(objects[path],`Unexpected mock provider read ${path}`);return structuredClone(objects[path]!);};
  return {snapshot,session,subscription,invoice,payment,charge,objects,api};
}
function event(type:string,remote:StripeObject,id=`evt_Test${++sequence}`):StripeEvent{return {id,type,created:Math.floor(Date.now()/1000),livemode:false,data:{object:remote}};}
const apply=(e:StripeEvent,api:StripeRequest)=>applyStripeEvent(sql,e,JSON.stringify(e),config,api);
const state=async(id:string)=>(await sql`select o.status,o.billing_revision,e.state,e.expires_at from billing_orders o left join billing_entitlements e on e.order_id=o.id where o.id=${id}`)[0]!;
function gate(){let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});return {pending,release};}

test('pending order constraint and provider key reuse prevent duplicate checkout creation',async()=>{
  const o=await order();const rows=await sql`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode) values('duplicate',${o.snapshot.buyerId},${o.snapshot.beneficiaryId},1,'seller','gift','Mock offer',500,'usd','payment') on conflict do nothing returning id`;assert.equal(rows.length,0);
  const keys:string[]=[],bodies:string[]=[];const api:StripeRequest=async(path,method,body,key)=>{assert.equal(path,'/v1/checkout/sessions');assert.equal(method,'POST');keys.push(key!);bodies.push(body!.toString());return {...o.session,url:'https://checkout.stripe.com/mock'};};
  await checkoutUrl(config,o.snapshot,{title:'Mock offer'},api);await checkoutUrl(config,o.snapshot,{title:'Mock offer'},api);assert.deepEqual(keys,[`kamino-order-${o.snapshot.id}`,`kamino-order-${o.snapshot.id}`]);assert.equal(bodies[0],bodies[1]);assert.match(bodies[0]!,/kamino_beneficiary_id/);
});
test('an old order with an open provider session is reused without a second checkout',async()=>{
  const o=await order();await sql`update billing_orders set created_at=now()-interval '3 days' where id=${o.snapshot.id}`;
  o.objects[`/v1/checkout/sessions/${o.session.id}`]={...o.session,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/reused'};
  const row=(await sql`select * from billing_orders where id=${o.snapshot.id}`)[0]!;const resumed=await resumeCheckout(sql,config,row,o.api);assert.equal(resumed.expired,false);assert.equal((await state(o.snapshot.id)).status,'pending');
});
test('only a provider-confirmed expired session releases the pending-order slot',async()=>{
  const o=await order();o.objects[`/v1/checkout/sessions/${o.session.id}`]={...o.session,status:'expired',payment_status:'unpaid'};
  const row=(await sql`select * from billing_orders where id=${o.snapshot.id}`)[0]!;assert.deepEqual(await resumeCheckout(sql,config,row,o.api),{expired:true});assert.equal((await state(o.snapshot.id)).status,'expired');
  const inserted=await sql`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode) values(${`replacement${sequence}`},${o.snapshot.buyerId},${o.snapshot.beneficiaryId},1,'seller','gift','Mock offer',500,'usd','payment') on conflict do nothing returning id`;assert.equal(inserted.length,1);
});
test('an old order with a lost provider response needs review rather than another potentially chargeable session',async()=>{
  const o=await order();await sql`update billing_orders set stripe_session_id=null,created_at=now()-interval '2 days' where id=${o.snapshot.id}`;const row=(await sql`select * from billing_orders where id=${o.snapshot.id}`)[0]!;
  await assert.rejects(resumeCheckout(sql,config,row,async()=>{throw new Error('Provider should not be called');}),/support review/);assert.equal((await state(o.snapshot.id)).status,'pending');
});
test('webhook retries after transient failure and duplicate delivery creates one entitlement',async()=>{
  const o=await order(),e=event('checkout.session.completed',o.session);
  await assert.rejects(apply(e,async()=>{throw new Error('Provider temporarily unavailable');}));assert.equal((await sql`select status from billing_webhook_events where event_id=${e.id}`)[0]?.status,'failed');
  assert.deepEqual(await apply(e,o.api),{duplicate:false});assert.deepEqual(await apply(e,o.api),{duplicate:true});assert.equal((await state(o.snapshot.id)).state,'active');assert.equal((await sql`select count(*)::int as total from billing_entitlements where order_id=${o.snapshot.id}`)[0]?.total,1);
  await assert.rejects(apply({...e,created:e.created+1},o.api),/changed/);
});
test('a delayed expiry event cannot release an already paid checkout for a second purchase',async()=>{
  const o=await order();await apply(event('checkout.session.expired',o.session),o.api);assert.equal((await state(o.snapshot.id)).status,'paid');assert.equal((await state(o.snapshot.id)).state,'active');
  const open=await order();open.objects[`/v1/checkout/sessions/${open.session.id}`]={...open.session,status:'open',payment_status:'unpaid'};await apply(event('checkout.session.expired',open.session),open.api);assert.equal((await state(open.snapshot.id)).status,'pending');
});
test('concurrent identical delivery cannot steal an unexpired processing claim',async()=>{
  const o=await order(),e=event('checkout.session.completed',o.session),arrived=gate(),release=gate();
  const slow:StripeRequest=async path=>{arrived.release();await release.pending;return o.api(path);};const first=apply(e,slow);await arrived.pending;
  await assert.rejects(apply(e,o.api),/already processing/);release.release();await first;assert.equal((await state(o.snapshot.id)).billing_revision,1);
});
test('a worker with a reclaimed lease cannot modify the order or mark the new claim failed',async()=>{
  const o=await order(),e=event('checkout.session.completed',o.session),arrived=gate(),release=gate();
  const first=apply(e,async path=>{arrived.release();await release.pending;return o.api(path);});const rejected=assert.rejects(first,/claim changed/);await arrived.pending;
  await sql`update billing_webhook_events set started_at=now()-interval '2 minutes' where event_id=${e.id}`;await apply(e,o.api);release.release();await rejected;
  assert.equal((await state(o.snapshot.id)).billing_revision,1);assert.equal((await sql`select status from billing_webhook_events where event_id=${e.id}`)[0]?.status,'processed');
});
test('wrong session or beneficiary cannot fulfill an order',async()=>{
  const o=await order();o.objects[`/v1/checkout/sessions/${o.session.id}`]={...o.session,metadata:{...o.session.metadata,kamino_beneficiary_id:'attacker'}};
  await assert.rejects(apply(event('checkout.session.completed',o.session),o.api),/match/);assert.equal((await state(o.snapshot.id)).status,'pending');
  const wrong=await order();wrong.objects[`/v1/checkout/sessions/${wrong.session.id}`]={...wrong.session,id:'cs_test_Other'};await assert.rejects(apply(event('checkout.session.completed',wrong.session),wrong.api),/stored session/);
});
test('subscription event before checkout completion binds the stored session and grants an expiring entitlement',async()=>{
  const o=await order('subscription');await apply(event('customer.subscription.updated',o.subscription),o.api);const s=await state(o.snapshot.id);assert.equal(s.status,'paid');assert.ok(s.expires_at);
  await sql`insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id) values('post',${o.snapshot.id},1,'seller')`;
  const allowed=()=>sql.query<{allowed:boolean}>(`select ${paidResourceAccessSql('$1','post','$2')} as allowed`,[o.snapshot.beneficiaryId,o.snapshot.id]);assert.equal((await allowed())[0]?.allowed,true);
  await sql`update billing_entitlements set expires_at=now()-interval '1 second' where order_id=${o.snapshot.id}`;assert.equal((await allowed())[0]?.allowed,false);
  const wrong=await order('subscription');wrong.objects[`/v1/checkout/sessions/${wrong.session.id}`]={...wrong.session,subscription:'sub_Other'};await assert.rejects(apply(event('customer.subscription.updated',wrong.subscription),wrong.api),/stored checkout/);
});
test('failed subscription fetch cannot overwrite a newer successful payment; retry reconciles current state',async()=>{
  const o=await order('subscription',true),arrived=gate(),release=gate(),oldSub={...o.subscription,status:'past_due'};
  const old:StripeRequest=async path=>{if(path.startsWith('/v1/subscriptions/'))return oldSub;if(path.startsWith('/v1/invoices/')){arrived.release();await release.pending;return {...o.invoice,status:'open',paid:false,amount_paid:0};}return o.api(path);};
  const e=event('customer.subscription.updated',oldSub),first=apply(e,old),rejected=assert.rejects(first,/order changed/i);await arrived.pending;
  await apply(event('invoice.paid',o.invoice),o.api);release.release();await rejected;assert.equal((await state(o.snapshot.id)).state,'active');assert.equal((await state(o.snapshot.id)).status,'paid');
  await apply(e,o.api);assert.equal((await state(o.snapshot.id)).status,'paid');
});
test('refund before checkout fulfillment revokes the pending order and later completion cannot restore it',async()=>{
  for(const mode of ['payment','subscription'] as const){const o=await order(mode);await apply(event('charge.refunded',o.charge),o.api);assert.equal((await state(o.snapshot.id)).status,'refunded');await apply(event('checkout.session.completed',o.session),o.api);assert.equal((await state(o.snapshot.id)).state,'revoked');}
});
test('older renewal refunds map by invoice to the subscription and disputes revoke paid benefits',async()=>{
  const o=await order('subscription',true);await apply(event('invoice.paid',o.invoice),o.api);await sql`update billing_orders set stripe_payment_intent_id='pi_NewerRenewal' where id=${o.snapshot.id}`;
  await apply(event('charge.refunded',o.charge),o.api);assert.equal((await state(o.snapshot.id)).state,'revoked');
  const payment=await order();await apply(event('checkout.session.completed',payment.session),payment.api);payment.objects[`/v1/charges/${payment.charge.id}`]={...payment.charge,refunded:false,amount_refunded:0,disputed:true};await apply(event('charge.dispute.created',{charge:payment.charge.id}),payment.api);assert.equal((await state(payment.snapshot.id)).status,'disputed');assert.equal((await state(payment.snapshot.id)).state,'revoked');
});
test('default-disabled and live-mode events cannot write the billing ledger',async()=>{
  const o=await order(),e=event('checkout.session.completed',o.session);await assert.rejects(applyStripeEvent(sql,e,JSON.stringify(e),{...config,enabled:false},o.api),/disabled/);
  await assert.rejects(applyStripeEvent(sql,{...e,livemode:true} as unknown as StripeEvent,JSON.stringify(e),config,o.api),/test mode/);assert.equal((await state(o.snapshot.id)).status,'pending');
});


test('privacy-closed gifts retain another recipient access and ignore delayed refunds',async()=>{
 const o=await order();await apply(event('checkout.session.completed',o.session),o.api);const before=await state(o.snapshot.id);
 await sql`update billing_orders set buyer_id='deleted:fixture',privacy_closed=true,billing_revision=billing_revision+1 where id=${o.snapshot.id}`;
 await apply(event('charge.refunded',o.charge),o.api);const after=await state(o.snapshot.id);assert.equal(after.status,'paid');assert.equal(after.state,'active');assert.equal(String(after.expires_at),String(before.expires_at));
});
test('account deletion while fulfillment is in flight cannot re-create revoked access',async()=>{
 const o=await order('subscription',true),arrived=gate(),release=gate();const e=event('invoice.paid',o.invoice);
 const first=apply(e,async path=>{if(path.startsWith('/v1/invoices/')){arrived.release();await release.pending;}return o.api(path);});await arrived.pending;
 await sql`update billing_orders set status='cancelled',privacy_closed=true,billing_revision=billing_revision+1 where id=${o.snapshot.id}`;release.release();await first;assert.equal((await state(o.snapshot.id)).status,'cancelled');assert.equal((await sql`select * from billing_entitlements where order_id=${o.snapshot.id}`).length,0);
});
