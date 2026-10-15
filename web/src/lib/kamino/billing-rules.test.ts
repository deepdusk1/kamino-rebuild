import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assertPaidCheckout, billingConfig, chargeOutcome, subscriptionAccessUntil, subscriptionRenews, trustedReceiptUrl, trustedStripeRedirect, verifyStripeEvent, type BillingOrderSnapshot } from './billing-rules.ts';
import { billingModeSql, liveBillingFrom } from './billing-policy.ts';
import { accessLabel, checkoutButtonLabel, orderStatusLabel } from './billing-labels.ts';

const order:BillingOrderSnapshot={id:'order1',buyerId:'buyer1',beneficiaryId:'friend1',priceMinor:500,currency:'usd',mode:'subscription'};
const metadata={kamino_order_id:order.id,kamino_buyer_id:order.buyerId,kamino_beneficiary_id:order.beneficiaryId};
const env={KAMINO_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_1234567890123456',STRIPE_WEBHOOK_SECRET:'whsec_1234567890123456',KAMINO_BILLING_ORIGIN:'https://kamino.example'};
test('billing is opt-in, test-key-only and requires a safe configured origin and webhook',()=>{
  assert.equal(billingConfig({}).enabled,false);assert.equal(billingConfig(env).mode,'test');
  for(const change of [{KAMINO_PAYMENTS_ENABLED:'false'},{STRIPE_SECRET_KEY:'sk_live_1234567890123456'},{STRIPE_WEBHOOK_SECRET:''},{KAMINO_BILLING_ORIGIN:'http://public.example'},{KAMINO_BILLING_ORIGIN:'https://user:password@example.com'},{KAMINO_BILLING_ORIGIN:'https://kamino.example/other'}])assert.equal(billingConfig({...env,...change}).enabled,false);
});
test('signatures authenticate the exact raw body and reject replay, ambiguity and live events',()=>{
  const event={id:'evt_Rules',type:'checkout.session.completed',created:1000,livemode:false,data:{object:{id:'cs_test_Rules'}}};
  const raw=JSON.stringify(event),signature=(body=raw,time=1000)=>`t=${time},v1=${createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${time}.${body}`).digest('hex')}`;
  assert.equal(verifyStripeEvent(raw,signature(),env.STRIPE_WEBHOOK_SECRET,1000).id,event.id);
  assert.equal(verifyStripeEvent(raw,`${signature()},v1=${'0'.repeat(64)}`,env.STRIPE_WEBHOOK_SECRET,1000).id,event.id);
  assert.throws(()=>verifyStripeEvent(raw+' ',signature(),env.STRIPE_WEBHOOK_SECRET,1000),/signature/);
  assert.throws(()=>verifyStripeEvent(raw,signature(),env.STRIPE_WEBHOOK_SECRET,1301),/expired/);
  assert.throws(()=>verifyStripeEvent(raw,`t=1000,${signature()}`,env.STRIPE_WEBHOOK_SECRET,1000),/signature/);
  const live=JSON.stringify({...event,livemode:true});assert.throws(()=>verifyStripeEvent(live,signature(live),env.STRIPE_WEBHOOK_SECRET,1000),/test-mode/);
});
test('checkout fulfillment binds buyer, beneficiary, amount, currency, mode and order',()=>{
  const paid={metadata,livemode:false,client_reference_id:order.id,mode:'subscription',payment_status:'paid',status:'complete',amount_total:500,currency:'usd'};
  assert.doesNotThrow(()=>assertPaidCheckout(paid,order));
  for(const change of [{amount_total:499},{currency:'eur'},{mode:'payment'},{payment_status:'unpaid'},{status:'open'},{client_reference_id:'other'},{metadata:{...metadata,kamino_beneficiary_id:'attacker'}}])assert.throws(()=>assertPaidCheckout({...paid,...change},order),/order|paid/);
});
test('subscription access requires the matching paid invoice and expires at the paid period',()=>{
  const sub={id:'sub_Rules',customer:'cus_Rules',metadata,livemode:false,status:'active',latest_invoice:'in_Rules',current_period_end:2000,items:{data:[{quantity:1,price:{unit_amount:500,currency:'usd',recurring:{interval:'month',interval_count:1}}}]}};
  const invoice={id:'in_Rules',subscription:'sub_Rules',customer:'cus_Rules',livemode:false,status:'paid',paid:true,paid_out_of_band:false,amount_paid:500,currency:'usd'};
  assert.equal(subscriptionAccessUntil(sub,invoice,order,1000),new Date(2000000).toISOString());
  assert.equal(subscriptionAccessUntil(sub,invoice,order,2000),null);
  assert.equal(subscriptionAccessUntil({...sub,status:'past_due'},invoice,order,1000),null);
  assert.equal(subscriptionAccessUntil(sub,{...invoice,paid_out_of_band:true},order,1000),null);
  assert.throws(()=>subscriptionAccessUntil(sub,{...invoice,subscription:'sub_Other'},order,1000),/Invoice/);
  assert.throws(()=>subscriptionAccessUntil(sub,{...invoice,customer:'cus_Other'},order,1000),/Invoice/);
});
test('checkout redirects cannot point to another host or include credentials',()=>{
  assert.equal(trustedStripeRedirect('https://checkout.stripe.com/c/pay/cs_test_Rules'),'https://checkout.stripe.com/c/pay/cs_test_Rules');
  for(const value of ['javascript:alert(1)','https://checkout.stripe.com.attacker.example/pay','https://user:secret@checkout.stripe.com/pay','http://checkout.stripe.com/pay'])assert.throws(()=>trustedStripeRedirect(value));
});

test('live mode needs every opt-in, and access rules use exactly the same check as checkout',()=>{
  const live={...env,KAMINO_BILLING_MODE:'live',STRIPE_SECRET_KEY:'sk_live_1234567890123456'};
  assert.equal(liveBillingFrom(live),true);assert.equal(billingConfig(live).mode,'live');
  for(const change of [{KAMINO_BILLING_MODE:'test'},{KAMINO_PAYMENTS_ENABLED:'false'},{STRIPE_SECRET_KEY:'sk_test_1234567890123456'},{KAMINO_BILLING_ORIGIN:''}]){
    const env2={...live,...change};assert.equal(liveBillingFrom(env2),false);assert.notEqual(billingConfig(env2).mode,'live');
  }
  assert.equal(billingModeSql('be',true),'be.test_mode=false');assert.equal(billingModeSql('be',false),'be.test_mode=true');
  assert.throws(()=>billingModeSql('be;drop table x',true),/alias/);
});
test('only full refunds and disputes end access; subscriptions set to end do not renew',()=>{
  assert.equal(chargeOutcome({refunded:false,amount_refunded:100}),null);
  assert.equal(chargeOutcome({refunded:true,amount_refunded:500}),'refunded');
  assert.equal(chargeOutcome({refunded:false,disputed:true}),'disputed');
  assert.equal(subscriptionRenews({status:'active'}),true);
  assert.equal(subscriptionRenews({status:'active',cancel_at_period_end:true}),false);
  assert.equal(subscriptionRenews({status:'active',cancel_at:1900000000}),false);
  assert.equal(subscriptionRenews({status:'canceled'}),false);
});
test('receipt links must be Stripe receipt pages',()=>{
  assert.equal(trustedReceiptUrl('https://pay.stripe.com/receipts/payment/abc'),'https://pay.stripe.com/receipts/payment/abc');
  assert.equal(trustedReceiptUrl('https://invoice.stripe.com/i/acct/abc'),'https://invoice.stripe.com/i/acct/abc');
  for(const bad of ['http://pay.stripe.com/x','https://pay.stripe.com.evil.example/x','https://user:pw@pay.stripe.com/x','javascript:alert(1)','',null,42])assert.equal(trustedReceiptUrl(bad),null);
});
test('purchase labels say plainly whether access renews, ends or is over',()=>{
  const later='2030-03-05T12:00:00.000Z';
  assert.match(accessLabel({active:true,expiresAt:later,renews:true}),/renews/);
  assert.match(accessLabel({active:true,expiresAt:later,renews:false}),/ends/);
  assert.equal(accessLabel({active:true,expiresAt:null,renews:null}),'Active');
  assert.equal(accessLabel({active:false,expiresAt:later,renews:true}),'Ended');
  assert.equal(orderStatusLabel('failed'),'Payment failed');assert.equal(orderStatusLabel('weird'),'Processing');
  assert.equal(checkoutButtonLabel('premium','live'),'Subscribe');assert.equal(checkoutButtonLabel('gift','test'),'Buy (test checkout)');assert.equal(checkoutButtonLabel('tip','disabled'),'Payments unavailable');
});
