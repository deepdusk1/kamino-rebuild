import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";
import { guard } from "./guard";
import { iso } from "./map";
import type { PaidResourceKind } from "./billing-policy";

type Row = Record<string, unknown>;
const uid = (context: unknown) => (context as { userId: string }).userId;
const resource = z.enum(["community", "post", "chat", "event"]);
const resourceId = z.string().trim().min(1).max(100);
export const getPaidResourceChoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await internals.requireMinAge(sql, userId);
    const rows = await sql.query<Row>(
      `select 'community' as kind,c.id as resource_id,c.name as title,c.id as community_id
   from communities c join memberships m on m.community_id=c.id and m.user_id=$1 and m.status='active' and m.role in ('agent','leader')
   where ${internals.communityMetadataAccessSql("$1", "c")}
   union all select 'post',cast(p.id as text),p.title,p.community_id from posts p join communities c on c.id=p.community_id
   where p.author_user_id=$1 and coalesce(p.hidden,false)=false and ${internals.communityMetadataAccessSql("$1", "c")}
   union all select 'chat',cast(r.id as text),r.name,r.community_id from chat_rooms r join communities c on c.id=r.community_id
   where r.created_by=$1 and r.kind in ('private','voice','screening') and ${internals.communityMetadataAccessSql("$1", "c")}
   union all select 'event',cast(e.id as text),e.title,e.community_id from events e join communities c on c.id=e.community_id
   where e.created_by=$1 and e.status<>'cancelled' and e.starts_at>now() and ${internals.communityMetadataAccessSql("$1", "c")}
   limit 500`,
      [userId],
    );
    const offers =
      await sql<Row>`select id,title,kind,community_id,published from creator_offers where owner_id=${userId} and kind not in ('tip','boost','advertisement') order by id desc`;
    return {
      resources: rows.map((r) => ({
        kind: String(r.kind) as PaidResourceKind,
        resourceId: String(r.resource_id),
        title: String(r.title),
        communityId: r.community_id ? String(r.community_id) : null,
      })),
      offers: offers.map((r) => ({
        id: Number(r.id),
        title: String(r.title),
        kind: String(r.kind),
        communityId: r.community_id ? String(r.community_id) : null,
        published: r.published === true,
      })),
    };
  });
export const setSupporterBadgeVisibility = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ visible: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    await sql`update profiles set show_supporter_badges=${data.visible} where user_id=${uid(context)}`;
    return { ok: true };
  });

export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { getBillingConfig } = await import("./billing.server");
    const config = getBillingConfig();
    return {
      enabled: config.enabled,
      mode: config.mode,
      reason: config.reason,
      mobilePaymentsEnabled: false,
      creatorPayoutsEnabled: false,
    };
  });

export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db(),
      userId = uid(context);
    const orders =
      await sql<Row>`select id,offer_id,title,kind,price_minor,currency,status,test_mode,created_at,stripe_subscription_id from billing_orders where buyer_id=${userId} order by created_at desc limit 60`;
    const entitlements =
      await sql<Row>`select e.offer_id,o.title,e.state,e.expires_at,e.test_mode from billing_entitlements e join billing_orders o on o.id=e.order_id where e.beneficiary_id=${userId} and o.kind<>'tip' order by e.updated_at desc limit 60`;
    const requirements =
      await sql<Row>`select resource_kind,resource_id,offer_id from billing_resource_requirements where owner_id=${userId}`;
    const profile = (
      await sql`select show_supporter_badges from profiles where user_id=${userId}`
    )[0];
    return {
      showSupporterBadges: profile?.show_supporter_badges === true,
      orders: orders.map((row) => ({
        id: String(row.id),
        offerId: Number(row.offer_id),
        title: String(row.title),
        kind: String(row.kind),
        priceMinor: Number(row.price_minor),
        currency: String(row.currency),
        status: String(row.status),
        testMode: true as const,
        subscription: Boolean(row.stripe_subscription_id),
        createdAt: iso(row.created_at),
      })),
      entitlements: entitlements.map((row) => ({
        offerId: Number(row.offer_id),
        title: String(row.title),
        state: String(row.state),
        expiresAt: row.expires_at ? iso(row.expires_at) : null,
        testMode: true as const,
      })),
      requirements: requirements.map((row) => ({
        kind: String(row.resource_kind) as PaidResourceKind,
        resourceId: String(row.resource_id),
        offerId: Number(row.offer_id),
      })),
    };
  });

export const createStripeCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) =>
    z
      .object({
        offerId: z.number().int().positive(),
        recipientHandle: z.string().trim().max(50).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { requireBillingConfig, stripeRequest, resumeCheckout } =
      await import("./billing.server");
    const config = requireBillingConfig();
    const sql = await internals.db(),
      userId = uid(context);
    await guard(userId, "post");
    await internals.requireMinAge(sql, userId);
    const offer = (
      await sql<Row>`select * from creator_offers where id=${data.offerId} and published=true`
    )[0];
    if (!offer) throw new Error("Offer not available.");
    if (["boost", "advertisement"].includes(String(offer.kind)))
      throw new Error("This offer does not have automated fulfillment yet.");
    const { CHECKOUT_KINDS } = await import("./billing-rules");
    if (!z.enum(CHECKOUT_KINDS).safeParse(offer.kind).success)
      throw new Error("This offer does not have automated fulfillment yet.");
    if (["membership", "ticket", "marketplace"].includes(String(offer.kind))) {
      const mapped =
        await sql`select 1 from billing_resource_requirements br where br.offer_id=${data.offerId} and br.owner_id=${String(offer.owner_id)}
        and (${String(offer.kind)}<>'membership' or br.resource_kind='community') and (${String(offer.kind)}<>'ticket' or br.resource_kind='event')
        and ((br.resource_kind='community' and exists(select 1 from communities c join memberships m on m.community_id=c.id and m.user_id=br.owner_id and m.status='active' and m.role in ('agent','leader') where c.id=br.resource_id))
          or (br.resource_kind='post' and exists(select 1 from posts p where cast(p.id as text)=br.resource_id and p.author_user_id=br.owner_id and p.hidden=false))
          or (br.resource_kind='chat' and exists(select 1 from chat_rooms r where cast(r.id as text)=br.resource_id and r.created_by=br.owner_id))
          or (br.resource_kind='event' and exists(select 1 from events e where cast(e.id as text)=br.resource_id and e.created_by=br.owner_id and e.status<>'cancelled' and e.starts_at>now()))) limit 1`;
      if (!mapped.length)
        throw new Error(
          "This offer needs an available community, event or item before checkout can open.",
        );
    }
    if (offer.owner_id === userId) throw new Error("You cannot purchase your own offer.");
    await internals.assertAccountAllowed(sql, String(offer.owner_id));
    if (
      (
        await sql`select 1 from blocks where (blocker_id=${userId} and blocked_id=${String(offer.owner_id)}) or (blocker_id=${String(offer.owner_id)} and blocked_id=${userId})`
      ).length
    )
      throw new Error("Offer not available.");
    if (offer.community_id) {
      // A buyer may need the community membership offer to access a paid community.
      // The normal visibility, age and membership rules still apply to private communities.
      const accessible = await sql.query(
        `select 1 from communities c where c.id=$2 and ${internals.communityMetadataAccessSql("$1", "c")}`,
        [userId, String(offer.community_id)],
      );
      if (!accessible.length) throw new Error("Offer not available for this account.");
    }
    let beneficiary = userId;
    if (offer.kind === "gift") {
      if (!data.recipientHandle) throw new Error("Choose a gift recipient by @handle.");
      const recipient = (
        await sql<Row>`select user_id from profiles where lower(handle)=lower(${data.recipientHandle.replace(/^@/, "")})`
      )[0];
      if (!recipient || recipient.user_id === userId || recipient.user_id === offer.owner_id)
        throw new Error("Choose another eligible gift recipient.");
      beneficiary = String(recipient.user_id);
      await internals.assertPeerContactAllowed(sql, userId, beneficiary);
      await internals.assertAccountAllowed(sql, beneficiary);
      await internals.requireMinAge(sql, beneficiary);
      if (
        offer.community_id &&
        !(
          await sql.query(
            `select 1 from communities c where c.id=$2 and ${internals.communityMetadataAccessSql("$1", "c")}`,
            [beneficiary, String(offer.community_id)],
          )
        ).length
      )
        throw new Error("This recipient is not eligible for the offer's community.");
    } else if (data.recipientHandle)
      throw new Error("A recipient is only supported for gift offers.");
    const scopes =
      await sql<Row>`select distinct community_id from billing_resource_requirements where offer_id=${data.offerId} and community_id is not null`;
    for (const scope of scopes) {
      const accessible = await sql.query(
        `select 1 from communities c where c.id=$2 and ${internals.communityMetadataAccessSql("$1", "c")} and ${internals.communityMetadataAccessSql("$3", "c")} and ${internals.communityMetadataAccessSql("$4", "c")}`,
        [userId, String(scope.community_id), beneficiary, String(offer.owner_id)],
      );
      if (!accessible.length)
        throw new Error(
          "This offer includes a community that the buyer, recipient or creator cannot access.",
        );
    }
    if (
      (
        await sql`select 1 from billing_entitlements where beneficiary_id=${beneficiary} and offer_id=${data.offerId} and state='active' and (expires_at is null or expires_at>now())`
      ).length &&
      offer.kind !== "tip"
    )
      throw new Error("This offer is already active for this account.");
    const api = stripeRequest(config);
    for (let attempt = 0; attempt < 3; attempt++) {
      const newId = crypto.randomUUID(),
        mode = ["membership", "premium"].includes(String(offer.kind)) ? "subscription" : "payment";
      const created =
        await sql<Row>`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode)
        values(${newId},${userId},${beneficiary},${data.offerId},${String(offer.owner_id)},${String(offer.kind)},${String(offer.title)},${Number(offer.price_minor)},${String(offer.currency)},${mode}) on conflict do nothing returning *`;
      const row =
        created[0] ??
        (
          await sql<Row>`select * from billing_orders where buyer_id=${userId} and beneficiary_id=${beneficiary} and offer_id=${data.offerId} and status='pending'`
        )[0];
      if (!row) throw new Error("Please retry checkout.");
      const checkout = await resumeCheckout(sql, config, row, api);
      if (!checkout.expired)
        return { orderId: checkout.orderId, url: checkout.url, testMode: checkout.testMode };
    }
    throw new Error("Please retry checkout.");
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireBillingConfig, stripeRequest } = await import("./billing.server");
    const config = requireBillingConfig(),
      sql = await internals.db(),
      userId = uid(context);
    const row = (
      await sql<Row>`select stripe_customer_id from billing_orders where buyer_id=${userId} and stripe_customer_id is not null and stripe_subscription_id is not null order by updated_at desc limit 1`
    )[0];
    if (!row) throw new Error("No subscription billing account is available.");
    const portal = await stripeRequest(config)(
      "/v1/billing_portal/sessions",
      "POST",
      new URLSearchParams({
        customer: String(row.stripe_customer_id),
        return_url: `${config.origin}/marketplace`,
      }),
    );
    const { trustedStripeRedirect } = await import("./billing-rules");
    return { url: trustedStripeRedirect(portal.url), testMode: true as const };
  });

export const setPaidResource = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) =>
    z
      .object({ kind: resource, resourceId, offerId: z.number().int().positive().nullable() })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    if (data.offerId !== null) {
      const { requireBillingConfig } = await import("./billing.server");
      requireBillingConfig();
    }
    const sql = await internals.db(),
      userId = uid(context);
    await internals.requireMinAge(sql, userId);
    let communityId: string | null = null;
    if (data.kind === "community") {
      const member = await internals.membershipOf(sql, userId, data.resourceId);
      if (
        !member ||
        member.status !== "active" ||
        !["agent", "leader"].includes(String(member.role))
      )
        throw new Error("Community leader access required.");
      communityId = data.resourceId;
    } else {
      const table = data.kind === "post" ? "posts" : data.kind === "chat" ? "chat_rooms" : "events";
      if (!/^\d+$/.test(data.resourceId)) throw new Error("Choose a valid resource.");
      const target = (
        await sql.query<Row>(`select * from ${table} where id=$1`, [Number(data.resourceId)])
      )[0];
      if (!target) throw new Error("Content not found.");
      const owner = data.kind === "post" ? target.author_user_id : target.created_by;
      if (owner !== userId) throw new Error("Only the content creator can set its paid offer.");
      communityId = target.community_id ? String(target.community_id) : null;
      if (communityId) await internals.assertCommunityReadable(sql, userId, communityId);
      if (data.kind === "chat" && !["private", "voice", "screening"].includes(String(target.kind)))
        throw new Error("Only dedicated private or live rooms can be paid rooms.");
    }
    if (data.offerId === null) {
      await sql`delete from billing_resource_requirements where resource_kind=${data.kind} and resource_id=${data.resourceId} and owner_id=${userId}`;
      return { ok: true };
    }
    const offer = (
      await sql<Row>`select * from creator_offers where id=${data.offerId} and owner_id=${userId}`
    )[0];
    if (!offer || ["tip", "boost", "advertisement"].includes(String(offer.kind)))
      throw new Error("Choose one of your access offers.");
    if (offer.published !== true) throw new Error("List this offer before restricting access.");
    if ((offer.community_id ? String(offer.community_id) : null) !== communityId)
      throw new Error("The offer must belong to the same community as the content.");
    await sql`insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id,community_id)
      values(${data.kind},${data.resourceId},${data.offerId},${userId},${communityId})
      on conflict(resource_kind,resource_id) do update set offer_id=excluded.offer_id,owner_id=excluded.owner_id,community_id=excluded.community_id`;
    return { ok: true };
  });
