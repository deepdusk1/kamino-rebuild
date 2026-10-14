# Billing sandbox

Billing is **disabled by default**. The implementation supports Stripe checkout, a purchase ledger, signed webhooks and access entitlements. It runs as a **test sandbox** by default: without an explicit operator switch it cannot charge real money and rejects live keys and live events. With `KAMINO_BILLING_MODE=live` and a live key it charges real money and enables creator payouts (see the live-mode section below). Native App Store / Google Play purchases are not implemented.

## Configure a sandbox

Apply all database migrations, including `0032_billing.sql` and `0034_billing_revision.sql`. Configure these server-side environment variables, then restart the server:

| Variable | Value |
| --- | --- |
| `KAMINO_PAYMENTS_ENABLED` | `true` to explicitly enable the sandbox; omit or use `false` to keep it disabled |
| `STRIPE_SECRET_KEY` | An actual Stripe test secret key starting with `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | The signing secret for this specific test webhook endpoint, starting with `whsec_` |
| `KAMINO_BILLING_ORIGIN` | The application origin, such as `https://preview.example.com` or `http://localhost:8085`; no path, credentials, query or fragment |

All four values must be valid. The app does not accept a live key, an insecure public HTTP origin or a secret supplied by a client. Never put these secrets in the mobile app, browser bundle or a committed environment file. Provider API reads and checkout creation pin Stripe API version `2025-02-24.acacia`.

Create a Stripe **test-mode** webhook endpoint at:

```text
https://YOUR_APP_ORIGIN/api/v1/billing/stripe-webhook
```

Subscribe it to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
checkout.session.async_payment_failed
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
charge.refunded
charge.dispute.created
```

Local forwarding can use the Stripe CLI. Its forwarded endpoint has its own signing secret; use that secret for local development. A Dashboard endpoint secret and a CLI forwarding secret are different. Signature verification uses the exact raw request body, with a five-minute timestamp tolerance and a one-megabyte payload limit. See [Stripe signature verification](https://docs.stripe.com/webhooks/signature).

When billing is disabled the webhook returns `503`, checkout refuses to open, and paid requirements cannot be added. Free content continues to use the normal visibility rules. An enabled sandbox is shown as test mode in the app; native purchase buttons remain disabled (purchases happen on the web checkout).

## Offers and fulfillment

- Membership and premium offers use a fixed monthly subscription. Access is limited to the paid subscription period.
- Tickets and marketplace offers use a one-time payment. They must have an available mapped event or resource; expired/cancelled events and missing items cannot be sold through checkout.
- Community membership offers must map an existing community controlled by the seller. Other mapped resources must still belong to the seller.
- Gifts use a one-time payment and grant the entitlement to the selected eligible recipient. They do not create recurring gift billing.
- Tips are one-time support payments and do not unlock content.
- Boosts and advertisements are catalog/setup features only. Automated paid boost delivery and ad delivery are refused by checkout.

An entitlement unlocks its mapped community, post, dedicated private/live chat or event through server checks. It does not bypass community membership, age limits, private visibility, bans, blocks or account restrictions. Checkout validates the buyer, recipient and seller against every mapped community before opening the provider page. A purchase does not automatically approve a community join request.

Premium/gift entitlements and optional supporter badges are stored. An active, verified, paid premium subscription enables original-byte GIF avatars up to 2 MB and doubles Content Studio/shared-file quotas (video up to 24 MB; audio/files up to 16 MB; GIF up to 8 MB; images up to 4 MB). These quotas do not change legacy album, cover, voice-note or quiz limits. Benefits expire with the entitlement; an existing uploaded avatar is not retroactively deleted. The native GIF option uses the document picker to preserve animation. Physical-device rendering remains unverified. Marketplace fulfillment currently covers mapped digital access. Physical delivery, stock management, seller settlement, tax automation and marketplace dispute resolution are not implemented.

## Ledger and retries

The browser return URL never grants benefits. A valid signed event causes a fresh provider API read, and fulfillment checks the order, buyer, beneficiary, session, amount, currency and payment mode. Subscriptions also require the matching paid invoice, customer and subscription.

One pending order is allowed per buyer, beneficiary and offer. Retries reuse that order's provider idempotency key. An open provider checkout stays the only checkout even if the local order is old. Only provider-confirmed expiration releases the pending slot. A completed checkout waits for payment reconciliation instead of creating a second checkout.

If an order is older than 24 hours and its provider response/session ID was lost, checkout requires **support review**. A maintainer must verify that order's Stripe metadata and payment state before repair; opening another checkout blindly could duplicate a payment. There is currently no automated repair screen for this case. Stripe may remove old idempotency keys after its retention period; see [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

Webhook delivery is durable and idempotent. In-progress or failed processing returns `503` so the provider retries. Processed duplicates return success. Claim tokens prevent an expired worker from writing after takeover, and order revisions reject a stale update that raced with a newer payment. Raw webhook bodies are not stored; the event ID, payload hash and processing state are retained.

Refunds and disputes revoke access, including when they arrive before checkout completion. An older renewal refund maps through its invoice to the subscription. Partial refunds currently revoke the whole offer entitlement; proportional access/refund accounting is not implemented. A late completion event cannot restore a refunded, disputed or cancelled order. Expired subscriptions fail access checks without requiring a member to open the app.

## Verification

The automated provider tests use mocks and embedded Postgres. They do not contact Stripe or create remote charges:

```text
node --experimental-strip-types --test src/lib/kamino/billing-rules.test.ts src/lib/kamino/billing.server.test.ts
```

They cover disabled/live rejection, signatures, attribution, pending-order reuse, provider idempotency keys, concurrent delivery, lease takeover, transient retries, delayed expiry, subscription expiration, stale update races, refunds before completion, renewal refunds and disputes.

A configured Stripe test-account end-to-end run has not been performed in this implementation session. Before opening a configured sandbox to testers, verify checkout completion and signed delivery, declined payments, refunds, cancellation/renewal, gift eligibility, every mapped access surface, and the purchase-history/portal UI against a real Stripe test account. This implementation provides a test foundation; it does not enable production payments or store purchases.


### Account deletion and sandbox orders

Account deletion closes pending local orders, revokes that account's benefits, removes personal uploads and replaces retained accounting identities with a deletion pseudonym. Other members keep already-paid gifts with their existing expiry; creator-owned shared resources remain, with offers unpublished. Privacy-closed orders reject late fulfillment/refund writes. Retained sandbox order rows have no personal email/name.

This flow does not cancel a subscription at the external payment provider. Operators must cancel the associated subscription in Stripe and reconcile any refund separately before removing an account with recurring payments. In sandbox mode the app accepts test-mode payments only. Complete provider cancellation, financial retention policy and store billing review before enabling live mode.

## Live mode and creator payouts (added October 5, 2026)

The sandbox described above is unchanged and remains the default. A second, explicitly separate
switch turns on **real money**:

1. `STRIPE_SECRET_KEY` must be a `sk_live_…` key and `STRIPE_WEBHOOK_SECRET` the matching live
   webhook secret, `KAMINO_BILLING_ORIGIN` the canonical https origin, and
2. `KAMINO_PAYMENTS_ENABLED=true` **and** `KAMINO_BILLING_MODE=live` must both be set. A pasted
   live key alone never enables real charging.

**Payout safety.** Earnings are credited with a refund hold period (`KAMINO_PAYOUT_HOLD_DAYS`,
default 7) before they can be paid out. A payout reserves exactly the rows it settles before
calling Stripe, uses a per-payout idempotency key (so retries can never create a second transfer),
settles one currency at a time, and an interrupted payout is reconciled by the background worker
and the next attempt instead of silently returning earnings to the pool. Refunds and chargebacks
reverse earnings still in the pool directly; earnings already paid out are offset by a negative
adjustment that blocks further payouts until the loss is recovered. Failed credits are retried by
the worker. Financial records survive account deletion (pseudonymised), and deleting a room's
recorder no longer fails.

In live mode every completed order also credits **creator earnings**
(`creator_earnings`: gross, platform fee, net). The platform fee is `KAMINO_PLATFORM_FEE_PERCENT`
(default 10, clamped 0–50). Creators connect a Stripe Express account from the Creator page
("Set up payouts"), then "Request payout" transfers the whole available balance via Stripe
Connect and records it in `creator_payouts`. Payouts refuse outside live mode; sandbox orders
never credit a payable balance.

Before enabling live mode: taxes, invoicing, terms of service, refunds and dispute handling are
operator responsibilities; have counsel review them for your jurisdictions. The webhook path
also accepts `identity.verification_session.*` events for the independent age-verification
feature (see IDENTITY_SECURITY.md).
