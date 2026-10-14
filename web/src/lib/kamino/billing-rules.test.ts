import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assertPaidCheckout, billingConfig, subscriptionAccessUntil, trustedStripeRedirect, verifyStripeEvent, type BillingOrderSnapshot } from './billing-rules.ts';

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
