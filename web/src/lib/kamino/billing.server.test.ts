import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from '../db';
import { applyStripeEvent, checkoutUrl, endSubscriptionsForAccount, orderReceiptUrl, resumeCheckout, type StripeRequest } from './billing.server.ts';
import { paidResourceAccessSql } from './billing-policy.ts';
import { premiumActiveSql } from './premium.server.ts';
import type { BillingConfig, BillingOrderSnapshot, StripeEvent, StripeObject } from './billing-rules.ts';

// These tests use embedded Postgres and an injected provider. No secret, checkout or network call leaves the test.
const pg=new PGlite();await pg.waitReady;
await pg.exec('create table creator_offers(id int primary key);insert into creator_offers values(1);create table memberships(community_id text,user_id text,status text,role text);create table profiles(user_id text primary key);');
await pg.exec(readFileSync(new URL('../../../migrations/0032_billing.sql',import.meta.url),'utf8'));
await pg.exec(readFileSync(new URL('../../../migrations/0034_billing_revision.sql',import.meta.url),'utf8'));
await pg.exec(readFileSync(new URL('../../../migrations/0036_privacy_billing.sql',import.meta.url),'utf8'));
// Only the billing part of 0045 (live/test rows); the rest needs tables this fixture does not create.
const money=readFileSync(new URL('../../../migrations/0045_production_money_infra.sql',import.meta.url),'utf8');
await pg.exec(money.slice(0,money.indexOf('-- Creator earnings')));
await pg.exec(readFileSync(new URL('../../../migrations/0056_billing_fixes.sql',import.meta.url),'utf8'));
after(()=>pg.close());
const sql=(async(strings:TemplateStringsArray,...values:unknown[])=>{let query=strings[0]!;for(let i=0;i<values.length;i++)query+=`$${i+1}${strings[i+1]}`;return(await pg.query(query,values)).rows;}) as Sql;
sql.query=async<T>(query:string,values:unknown[]=[])=> (await pg.query<T>(query,values)).rows;
const config:BillingConfig={enabled:true,mode:'test',origin:'http://localhost:8085',secretKey:'unused',webhookSecret:'unused',reason:'Mock provider only'};
let sequence=0;
async function order(mode:'payment'|'subscription'='payment',linked=false,livemode=false,kind=mode==='subscription'?'membership':'gift'){
  const n=++sequence,id=`order${n}`,buyerId=`buyer${n}`,beneficiaryId=`friend${n}`,sessionId=`cs_${livemode?'live':'test'}_Order${n}`,subId=`sub_Order${n}`,paymentId=`pi_Order${n}`,customerId=`cus_Order${n}`;
  await sql`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode,stripe_session_id,stripe_subscription_id,test_mode)
    values(${id},${buyerId},${beneficiaryId},1,'seller',${kind},'Mock offer',500,'usd',${mode},${sessionId},${linked?subId:null},${!livemode})`;
  const snapshot:BillingOrderSnapshot={id,buyerId,beneficiaryId,priceMinor:500,currency:'usd',mode};
  const metadata={kamino_order_id:id,kamino_buyer_id:buyerId,kamino_beneficiary_id:beneficiaryId};
  const session={id:sessionId,livemode,metadata,client_reference_id:id,mode,payment_status:'paid',status:'complete',amount_total:500,currency:'usd',customer:customerId,payment_intent:paymentId,subscription:subId};
  const invoiceId=`in_Order${n}`,end=Math.floor(Date.now()/1000)+3600;
  const invoice={id:invoiceId,livemode,subscription:subId,customer:customerId,status:'paid',paid:true,paid_out_of_band:false,currency:'usd',amount_paid:500,payment_intent:paymentId};
  const subscription:StripeObject={id:subId,livemode,metadata,status:'active',customer:customerId,latest_invoice:invoiceId,current_period_end:end,items:{data:[{quantity:1,price:{unit_amount:500,currency:'usd',recurring:{interval:'month',interval_count:1}}}]}};
  const payment={id:paymentId,livemode,metadata,amount:500,currency:'usd',latest_charge:`ch_Order${n}`};
  const charge={id:`ch_Order${n}`,livemode,receipt_url:`https://pay.stripe.com/receipts/payment/Order${n}`,payment_intent:paymentId,amount_refunded:500,refunded:true,invoice:mode==='subscription'?invoiceId:null};
  const objects:Record<string,StripeObject>={[`/v1/checkout/sessions/${sessionId}`]:session,[`/v1/subscriptions/${subId}`]:subscription,[`/v1/invoices/${invoiceId}`]:invoice,[`/v1/payment_intents/${paymentId}`]:payment,[`/v1/charges/${charge.id}`]:charge};
  const deleted:string[]=[];
  const api:StripeRequest=async(path,method='GET')=>{assert.ok(objects[path],`Unexpected mock provider read ${path}`);
    if(method==='DELETE'){deleted.push(path);objects[path]={...objects[path]!,status:'canceled'};}return structuredClone(objects[path]!);};
  return {snapshot,session,subscription,invoice,payment,charge,objects,api,deleted};
}
function event(type:string,remote:StripeObject,id=`evt_Test${++sequence}`,livemode=false):StripeEvent{return {id,type,created:Math.floor(Date.now()/1000),livemode,data:{object:remote}};}
const liveConfig:BillingConfig={...config,mode:'live',reason:'Mock live provider only'};
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
test('an old order whose checkout link never reached the buyer expires instead of blocking the purchase forever',async()=>{
  const o=await order();await sql`update billing_orders set stripe_session_id=null,created_at=now()-interval '2 days' where id=${o.snapshot.id}`;const row=(await sql`select * from billing_orders where id=${o.snapshot.id}`)[0]!;
  assert.deepEqual(await resumeCheckout(sql,config,row,async()=>{throw new Error('Provider should not be called');}),{expired:true});assert.equal((await state(o.snapshot.id)).status,'expired');
  const inserted=await sql`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode) values(${`retry${sequence}`},${o.snapshot.buyerId},${o.snapshot.beneficiaryId},1,'seller','gift','Mock offer',500,'usd','payment') on conflict do nothing returning id`;assert.equal(inserted.length,1);
});
test('a sandbox checkout left over after switching to live payments expires without calling Stripe',async()=>{
  const o=await order();const row=(await sql`select * from billing_orders where id=${o.snapshot.id}`)[0]!;
  assert.deepEqual(await resumeCheckout(sql,liveConfig,row,async()=>{throw new Error('Provider should not be called');}),{expired:true});assert.equal((await state(o.snapshot.id)).status,'expired');
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

test('live purchases unlock premium and paid content, and sandbox purchases never count in live mode',async()=>{
  const o=await order('subscription',false,true,'premium');
  const e=event('checkout.session.completed',o.session,undefined,true);
  assert.deepEqual(await applyStripeEvent(sql,e,JSON.stringify(e),liveConfig,o.api),{duplicate:false});
  const row=(await sql`select o.test_mode as order_test,e.test_mode as access_test,e.state from billing_orders o join billing_entitlements e on e.order_id=o.id where o.id=${o.snapshot.id}`)[0]!;
  assert.deepEqual([row.order_test,row.access_test,row.state],[false,false,'active']);
  const premium=async(live:boolean)=>(await sql.query<{active:boolean}>(`select ${premiumActiveSql('$1',live)} as active`,[o.snapshot.beneficiaryId]))[0]?.active;
  assert.equal(await premium(true),true,'a real premium subscriber gets premium in live mode');
  assert.equal(await premium(false),false,'a real purchase is not reused as a sandbox one');
  const sandbox=await order('subscription');await apply(event('customer.subscription.updated',sandbox.subscription),sandbox.api);
  await sql`insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id) values('post',${sandbox.snapshot.id},1,'seller')`;
  const allowed=(live:boolean)=>sql.query<{allowed:boolean}>(`select ${paidResourceAccessSql('$1','post','$2',live)} as allowed`,[sandbox.snapshot.beneficiaryId,sandbox.snapshot.id]);
  assert.equal((await allowed(false))[0]?.allowed,true);
  assert.equal((await allowed(true))[0]?.allowed,false,'a sandbox purchase never unlocks content once real payments are on');
});
test('a partial refund keeps access; only a full refund ends it',async()=>{
  const o=await order();await apply(event('checkout.session.completed',o.session),o.api);
  o.objects[`/v1/charges/${o.charge.id}`]={...o.charge,refunded:false,amount_refunded:100};
  await apply(event('charge.refunded',o.charge),o.api);assert.equal((await state(o.snapshot.id)).status,'paid');assert.equal((await state(o.snapshot.id)).state,'active');
  o.objects[`/v1/charges/${o.charge.id}`]={...o.charge,refunded:true,amount_refunded:500};
  await apply(event('charge.refunded',o.charge),o.api);assert.equal((await state(o.snapshot.id)).status,'refunded');assert.equal((await state(o.snapshot.id)).state,'revoked');
});
test('refunding or disputing a subscription also stops Stripe from charging again',async()=>{
  const o=await order('subscription',true);await apply(event('invoice.paid',o.invoice),o.api);
  await apply(event('charge.refunded',o.charge),o.api);
  assert.equal((await state(o.snapshot.id)).status,'refunded');assert.deepEqual(o.deleted,[`/v1/subscriptions/${o.subscription.id}`]);
  await apply(event('charge.refunded',o.charge),o.api);assert.equal(o.deleted.length,1,'an already cancelled subscription is not cancelled twice');
  const d=await order('subscription',true);await apply(event('invoice.paid',d.invoice),d.api);
  d.objects[`/v1/charges/${d.charge.id}`]={...d.charge,refunded:false,amount_refunded:0,disputed:true};
  await apply(event('charge.dispute.created',{charge:d.charge.id}),d.api);
  assert.equal((await state(d.snapshot.id)).status,'disputed');assert.deepEqual(d.deleted,[`/v1/subscriptions/${d.subscription.id}`]);
});
test('cancelling at period end keeps access until the paid period ends and records that it will not renew',async()=>{
  const o=await order('subscription',true);await apply(event('invoice.paid',o.invoice),o.api);
  assert.equal((await sql`select renews from billing_orders where id=${o.snapshot.id}`)[0]?.renews,true);
  o.objects[`/v1/subscriptions/${o.subscription.id}`]={...o.subscription,cancel_at_period_end:true};
  await apply(event('customer.subscription.updated',o.subscription),o.api);
  const s=await state(o.snapshot.id);assert.equal(s.status,'paid');assert.equal(s.state,'active');assert.ok(s.expires_at);
  assert.equal((await sql`select renews from billing_orders where id=${o.snapshot.id}`)[0]?.renews,false);
  o.objects[`/v1/subscriptions/${o.subscription.id}`]={...o.subscription,status:'canceled'};
  await apply(event('customer.subscription.deleted',o.subscription),o.api);assert.equal((await state(o.snapshot.id)).status,'cancelled');assert.equal((await state(o.snapshot.id)).state,'revoked');
});
test('receipts open only for the buyer and only on Stripe receipt pages',async()=>{
  const o=await order();await apply(event('checkout.session.completed',o.session),o.api);
  assert.equal(await orderReceiptUrl(sql,config,o.snapshot.buyerId,o.snapshot.id,o.api),`https://pay.stripe.com/receipts/payment/Order${sequence-1}`);
  await assert.rejects(orderReceiptUrl(sql,config,o.snapshot.beneficiaryId,o.snapshot.id,o.api),/no receipt/);
  await assert.rejects(orderReceiptUrl(sql,liveConfig,o.snapshot.buyerId,o.snapshot.id,o.api),/sandbox/);
  o.objects[`/v1/charges/${o.charge.id}`]={...o.charge,receipt_url:'https://evil.example/receipt'};
  await assert.rejects(orderReceiptUrl(sql,config,o.snapshot.buyerId,o.snapshot.id,o.api),/isn't ready/);
  const pending=await order();await assert.rejects(orderReceiptUrl(sql,config,pending.snapshot.buyerId,pending.snapshot.id,pending.api),/no receipt/);
});
test('deleting an account cancels the subscriptions that person pays for',async()=>{
  const o=await order('subscription',true);await apply(event('invoice.paid',o.invoice),o.api);
  assert.equal(await endSubscriptionsForAccount(sql,o.snapshot.buyerId,config,o.api),1);assert.deepEqual(o.deleted,[`/v1/subscriptions/${o.subscription.id}`]);
  assert.equal(await endSubscriptionsForAccount(sql,o.snapshot.buyerId,{...config,enabled:false},async()=>{throw new Error('Provider should not be called');}),0);
  assert.equal(await endSubscriptionsForAccount(sql,'nobody',config,async()=>{throw new Error('Provider should not be called');}),0);
});
