/**
 * Community tools added for the native apps: push registration, timed mutes and
 * appeals, wiki proposals and categories, external feeds, and account deletion.
 *
 * Same conventions as `server.ts`: every function validates its input, checks the
 * caller's role on the server, and never trusts an id sent by the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { optionalAuth, type Viewer } from "./optional-auth";
import { internals } from "./server";
import { guard } from "./guard";
import { ADULT_AGE, MINIMUM_AGE, checkBirthDate } from "./age";
import { canLead, canModerate, scanText } from "./safety";
import { mapCommunity, mapPost } from "./map";
import type { Community, Post } from "./types";
import { deleteMedia, loadMedia, storeMedia } from "./media-store.server";

type Authed = { userId: string };
const { db, notify, ensureProfile, membershipOf, requireActiveMember, requirePostAccess, blockedSet, mutedSet, likedSet, savedSet, POST_SELECT, POST_JOIN } = internals;

const MAX_MUTE_HOURS = 24 * 30;

// ────────────────────────────── Push devices ──────────────────────────────

export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { token: string; platform: "ios" | "android" | "web" | "unknown" }) => d)
  .handler(async ({ context, data }) => {
    const { isExpoPushToken } = await import("./push.server");
    if (!isExpoPushToken(data.token)) throw new Error("Not a valid push token.");
    const sql = await db();
    const { userId } = context as Authed;
    // A token belongs to one account at a time: signing in as someone else moves it.
    await sql`
      insert into push_tokens (token, user_id, platform)
      values (${data.token}, ${userId}, ${data.platform})
      on conflict (token) do update
        set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
    `;
    return { ok: true };
  });

export const unregisterPushToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((token: string) => token)
  .handler(async ({ context, data: token }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await sql`delete from push_tokens where token = ${token} and user_id = ${userId}`;
    return { ok: true };
  });

// ─────────────────────────── Mutes and appeals ────────────────────────────

const ROLE_RANK: Record<string, number> = { member: 0, curator: 1, leader: 2, agent: 3 };
const rank = (role: string | null | undefined) => ROLE_RANK[role ?? "member"] ?? 0;

export const issueMute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; userId: string; hours: number; reason: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const me = await requireActiveMember(sql, userId, data.slug);
    if (!canModerate(me.role)) throw new Error("Only moderators can mute members.");
    if (data.userId === userId) throw new Error("You cannot mute yourself.");
    const target = await membershipOf(sql, data.userId, data.slug);
    if (target?.status !== "active") throw new Error("That person is not an active member.");
    if (rank(target.role) >= rank(me.role)) throw new Error("You can only mute members ranked below you.");
    const hours = Math.floor(Number(data.hours));
    if (!Number.isFinite(hours) || hours < 1 || hours > MAX_MUTE_HOURS)
      throw new Error("Choose a mute between 1 hour and 30 days.");
    const reason = data.reason.trim().slice(0, 200);
    if (!reason) throw new Error("Give a short reason so the member understands.");
    const err = scanText(reason);
    if (err) throw new Error(err);
    const until = new Date(Date.now() + hours * 3600_000).toISOString();
    await sql`
      insert into member_mutes (community_id, user_id, issued_by, reason, until)
      values (${data.slug}, ${data.userId}, ${userId}, ${reason}, ${until})
    `;
    await sql`
      insert into audit_log (community_id, actor_id, action, detail)
      values (${data.slug}, ${userId}, 'mute', ${`${data.userId}:${hours}h`})
    `;
    await notify(sql, data.userId, "mute", "You were muted", reason.slice(0, 80), `/c/${data.slug}`, {
      targetType: "community",
      targetId: data.slug,
    });
    return { until };
  });

export const clearMute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; userId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const me = await requireActiveMember(sql, userId, data.slug);
    if (!canModerate(me.role)) throw new Error("Only moderators can end a mute.");
    await sql`update member_mutes set cleared = true
      where community_id = ${data.slug} and user_id = ${data.userId} and cleared = false`;
    return { ok: true };
  });

/** What the signed-in member can currently appeal in one community. */
export const getMyStanding = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((slug: string) => slug)
  .handler(async ({ context, data: slug }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const membership = await membershipOf(sql, userId, slug);
    const strikes = await sql<{ id: number; reason: string; created_at: string }>`
      select id, reason, created_at from strikes
      where community_id = ${slug} and user_id = ${userId} order by id desc limit 10`;
    const mute = (
      await sql<{ until: string; reason: string }>`
        select until, reason from member_mutes
        where community_id = ${slug} and user_id = ${userId} and cleared = false and until > now()
        order by until desc limit 1`
    )[0];
    const appeals = await sql<{ id: number; kind: string; status: string; decision_note: string; created_at: string }>`
      select id, kind, status, decision_note, created_at from appeals
      where community_id = ${slug} and user_id = ${userId} order by id desc limit 10`;
    return {
      status: membership?.status ?? "none",
      strikes: strikes.map((s) => ({ id: Number(s.id), reason: s.reason, createdAt: new Date(s.created_at).toISOString() })),
      mute: mute ? { until: new Date(mute.until).toISOString(), reason: mute.reason } : null,
      appeals: appeals.map((a) => ({
        id: Number(a.id),
        kind: a.kind,
        status: a.status,
        decisionNote: a.decision_note,
        createdAt: new Date(a.created_at).toISOString(),
      })),
    };
  });

export const fileAppeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; kind: "strike" | "mute" | "ban"; message: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "report");
    const membership = await membershipOf(sql, userId, data.slug);
    if (!membership || !["active", "banned"].includes(membership.status))
      throw new Error("You have nothing to appeal here.");
    const message = data.message.trim().slice(0, 1000);
    if (message.length < 10) throw new Error("Tell the leaders why in a sentence or two.");
    const err = scanText(message);
    if (err) throw new Error(err);

    if (data.kind === "ban" && membership.status !== "banned") throw new Error("You are not removed from this community.");
    if (data.kind === "strike") {
      const has = await sql`select 1 from strikes where community_id = ${data.slug} and user_id = ${userId}`;
      if (!has.length) throw new Error("You have no strikes here.");
    }
    if (data.kind === "mute") {
      const has = await sql`select 1 from member_mutes
        where community_id = ${data.slug} and user_id = ${userId} and cleared = false and until > now()`;
      if (!has.length) throw new Error("You are not muted here.");
    }
    const open = await sql`select 1 from appeals
      where community_id = ${data.slug} and user_id = ${userId} and kind = ${data.kind} and status = 'open'`;
    if (open.length) throw new Error("You already have an open appeal for this. Please wait for a reply.");

    await sql`insert into appeals (community_id, user_id, kind, message)
      values (${data.slug}, ${userId}, ${data.kind}, ${message})`;
    const leaders = await sql<{ user_id: string }>`
      select user_id from memberships
      where community_id = ${data.slug} and status = 'active' and role in ('leader','agent')`;
    for (const l of leaders)
      await notify(sql, l.user_id, "appeal", "New appeal", message.slice(0, 80), `/c/${data.slug}/mod`, {
        actorId: userId,
        targetType: "community",
        targetId: data.slug,
      });
    return { ok: true };
  });

export const listAppeals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((slug: string) => slug)
  .handler(async ({ context, data: slug }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const me = await requireActiveMember(sql, userId, slug);
    if (!canLead(me.role)) throw new Error("Only leaders review appeals.");
    const rows = await sql<{
      id: number; user_id: string; kind: string; message: string; status: string;
      decision_note: string; created_at: string; display_name: string | null; handle: string | null;
    }>`
      select a.id, a.user_id, a.kind, a.message, a.status, a.decision_note, a.created_at,
             p.display_name, p.handle
      from appeals a left join profiles p on p.user_id = a.user_id
      where a.community_id = ${slug}
      order by (a.status = 'open') desc, a.id desc limit 50`;
    return rows.map((r) => ({
      id: Number(r.id),
      userId: r.user_id,
      name: r.display_name ?? "Member",
      handle: r.handle ?? "",
      kind: r.kind,
      message: r.message,
      status: r.status,
      decisionNote: r.decision_note,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });

export const resolveAppeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; appealId: number; decision: "upheld" | "overturned"; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const me = await requireActiveMember(sql, userId, data.slug);
    if (!canLead(me.role)) throw new Error("Only leaders decide appeals.");
    if (!["upheld", "overturned"].includes(data.decision)) throw new Error("Choose a decision.");
    const appeal = (
      await sql<{ user_id: string; kind: string }>`
        select user_id, kind from appeals
        where id = ${data.appealId} and community_id = ${data.slug} and status = 'open'`
    )[0];
    if (!appeal) throw new Error("This appeal was already decided.");
    if (appeal.user_id === userId) throw new Error("Another leader must decide your appeal.");
    const note = (data.note ?? "").trim().slice(0, 300);

    if (data.decision === "overturned") {
      if (appeal.kind === "strike") {
        await sql`delete from strikes where id = (
          select id from strikes where community_id = ${data.slug} and user_id = ${appeal.user_id}
          order by id desc limit 1)`;
      }
      if (appeal.kind === "mute") {
        await sql`update member_mutes set cleared = true
          where community_id = ${data.slug} and user_id = ${appeal.user_id} and cleared = false`;
      }
      if (appeal.kind === "ban") {
        // Drop strikes until the member sits below the 3-strike removal line, then reinstate.
        await sql`delete from strikes where id in (
          select id from strikes where community_id = ${data.slug} and user_id = ${appeal.user_id}
          order by id desc offset 2)`;
        const restored = await sql`update memberships set status = 'active'
          where user_id = ${appeal.user_id} and community_id = ${data.slug} and status = 'banned' returning user_id`;
        if (restored.length)
          await sql`update communities set member_count = member_count + 1 where id = ${data.slug}`;
      }
    }
    await sql`update appeals set status = ${data.decision}, decided_by = ${userId},
      decision_note = ${note}, decided_at = now() where id = ${data.appealId}`;
    await sql`insert into audit_log (community_id, actor_id, action, detail)
      values (${data.slug}, ${userId}, 'appeal', ${`${appeal.user_id}:${appeal.kind}:${data.decision}`})`;
    await notify(
      sql, appeal.user_id, "appeal",
      data.decision === "overturned" ? "Appeal accepted" : "Appeal reviewed",
      (note || (data.decision === "overturned" ? "The leaders reversed the decision." : "The leaders kept the decision.")).slice(0, 80),
      `/c/${data.slug}`,
      { targetType: "community", targetId: data.slug },
    );
    return { ok: true };
  });

// ───────────────────────────── Wiki tools ─────────────────────────────────

const CATEGORY_PATH = /^[\p{L}\p{N} '&-]{1,30}(\/[\p{L}\p{N} '&-]{1,30}){0,3}$/u;

export const getWikiCategories = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const sql = await db();
    const rows = await sql<{ path: string }>`select path from wiki_categories where community_id = ${slug} order by path`;
    return rows.map((r) => r.path);
  });

export const setWikiCategories = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; paths: string[] }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const me = await requireActiveMember(sql, userId, data.slug);
    if (!canLead(me.role)) throw new Error("Only leaders manage wiki categories.");
    const paths = [...new Set(data.paths.map((p) => p.split("/").map((s) => s.trim()).join("/")))];
    if (paths.length > 60) throw new Error("Please keep the list to 60 categories.");
    if (paths.some((p) => !CATEGORY_PATH.test(p)))
      throw new Error("Categories use letters, numbers and spaces; use / to nest, up to four levels.");
    await sql`delete from wiki_categories where community_id = ${data.slug}`;
    for (const path of paths)
      await sql`insert into wiki_categories (community_id, path) values (${data.slug}, ${path})`;
    return { paths: paths.sort() };
  });

export const proposeWikiEdit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { postId: number; title: string; body: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "post");
    const post = await requirePostAccess(sql, userId, data.postId);
    if (post.type !== "wiki" || post.wiki_status !== "approved")
      throw new Error("Edits can be proposed on approved wiki pages.");
    if (post.author_user_id === userId) throw new Error("Edit your own page directly.");
    await requireActiveMember(sql, userId, String(post.community_id));
    await internals.assertNotMuted(sql, userId, String(post.community_id));
    const title = data.title.trim().slice(0, 120);
    const body = data.body.slice(0, 8000);
    const err = scanText(`${title}\n${body}`);
    if (err) throw new Error(err);
    if (title.length < 3) throw new Error("Give the page a title.");
    if (title === post.title && body === post.body) throw new Error("Change something first.");
    const pending = await sql`select count(*)::int as n from wiki_proposals
      where post_id = ${data.postId} and proposer_user_id = ${userId} and status = 'open'`;
    if (Number((pending[0] as { n: number }).n) >= 2) throw new Error("Please wait for your earlier suggestions to be reviewed.");
    await sql`insert into wiki_proposals (post_id, proposer_user_id, title, body, note)
      values (${data.postId}, ${userId}, ${title}, ${body}, ${(data.note ?? "").trim().slice(0, 300)})`;
    await notify(sql, String(post.author_user_id), "wiki", "Edit suggested", title.slice(0, 80),
      `/c/${post.community_id}/p/${data.postId}`, { actorId: userId, targetType: "post", targetId: data.postId });
    return { ok: true };
  });

export const listWikiProposals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((postId: number) => postId)
  .handler(async ({ context, data: postId }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const post = await requirePostAccess(sql, userId, postId);
    const me = await membershipOf(sql, userId, String(post.community_id));
    const reviewer = post.author_user_id === userId || (me?.status === "active" && canModerate(me.role));
    const rows = await sql<{
      id: number; proposer_user_id: string; title: string; body: string; note: string;
      status: string; created_at: string; display_name: string | null;
    }>`
      select w.id, w.proposer_user_id, w.title, w.body, w.note, w.status, w.created_at, p.display_name
      from wiki_proposals w left join profiles p on p.user_id = w.proposer_user_id
      where w.post_id = ${postId} and (${reviewer} or w.proposer_user_id = ${userId})
      order by (w.status = 'open') desc, w.id desc limit 30`;
    return {
      canReview: reviewer,
      proposals: rows.map((r) => ({
        id: Number(r.id),
        proposerId: r.proposer_user_id,
        proposer: r.display_name ?? "Member",
        title: r.title,
        body: r.body,
        note: r.note,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  });

export const resolveWikiProposal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { proposalId: number; decision: "accepted" | "rejected" }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const proposal = (
      await sql<{ post_id: number; proposer_user_id: string; title: string; body: string }>`
        select post_id, proposer_user_id, title, body from wiki_proposals
        where id = ${data.proposalId} and status = 'open'`
    )[0];
    if (!proposal) throw new Error("This suggestion was already handled.");
    const post = await requirePostAccess(sql, userId, Number(proposal.post_id));
    const me = await membershipOf(sql, userId, String(post.community_id));
    const moderator = me?.status === "active" && canModerate(me.role);
    if (post.author_user_id !== userId && !moderator)
      throw new Error("Only the page's author or a moderator can decide this.");
    if (!["accepted", "rejected"].includes(data.decision)) throw new Error("Choose accept or decline.");

    if (data.decision === "accepted") {
      // Keep the previous text so nothing is lost, credit the contributor, apply the edit.
      await sql`insert into wiki_revisions (post_id, editor_user_id, title, body)
        values (${post.id}, ${userId}, ${post.title}, ${post.body})`;
      await sql`insert into wiki_contributors (post_id, user_id)
        values (${post.id}, ${proposal.proposer_user_id}) on conflict do nothing`;
      // A moderator's acceptance is itself the review; an author's acceptance sends the page back for one.
      await sql`update posts set title = ${proposal.title}, body = ${proposal.body}, edited_at = now(),
        wiki_status = ${moderator ? "approved" : "pending"} where id = ${post.id}`;
    }
    await sql`update wiki_proposals set status = ${data.decision}, decided_by = ${userId}, decided_at = now()
      where id = ${data.proposalId}`;
    await notify(sql, proposal.proposer_user_id, "wiki",
      data.decision === "accepted" ? "Your wiki edit was accepted" : "Your wiki edit was declined",
      proposal.title.slice(0, 80), `/c/${post.community_id}/p/${post.id}`, { actorId: userId, targetType: "post", targetId: Number(post.id) });
    return { ok: true };
  });

export const getWikiContributors = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((postId: number) => postId)
  .handler(async ({ context, data: postId }) => {
    const sql = await db();
    await requirePostAccess(sql, (context as unknown as Viewer).userId, postId);
    const rows = await sql<{ user_id: string; display_name: string; handle: string }>`
      select c.user_id, p.display_name, p.handle
      from wiki_contributors c join profiles p on p.user_id = c.user_id
      where c.post_id = ${postId} order by c.accepted_at`;
    return rows.map((r) => ({ userId: r.user_id, name: r.display_name, handle: r.handle }));
  });

// ───────────────────────────── External feeds ─────────────────────────────

export const listFeeds = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((slug: string) => slug)
  .handler(async ({ context, data: slug }) => {
    const sql = await db();
    const community = await internals.requireCommunity(sql, slug);
    const member = await membershipOf(sql, (context as unknown as Viewer).userId, slug);
    const readable = await internals.canReadForViewer(sql, (context as unknown as Viewer).userId, community, member);
    if (!readable) return [];
    const rows = await sql<{ id: number; url: string; title: string }>`
      select id, url, title from community_feeds where community_id = ${slug} order by id`;
    return rows.map((r) => ({ id: Number(r.id), url: r.url, title: r.title }));
  });

export const addFeed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; url: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "post");
    const me = await requireActiveMember(sql, userId, data.slug);
    if (!canLead(me.role)) throw new Error("Only leaders can add feeds.");
    const count = await sql`select count(*)::int as n from community_feeds where community_id = ${data.slug}`;
    if (Number((count[0] as { n: number }).n) >= 3) throw new Error("A community can have up to 3 feeds.");
    const { readFeed } = await import("./feeds.server");
    const feed = await readFeed(data.url); // also validates the address and that it really is a feed
    const url = data.url.trim();
    await sql`insert into community_feeds (community_id, url, title, added_by)
      values (${data.slug}, ${url}, ${feed.title}, ${userId}) on conflict do nothing`;
    return { title: feed.title };
  });

export const removeFeed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; feedId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const me = await requireActiveMember(sql, userId, data.slug);
    if (!canLead(me.role)) throw new Error("Only leaders can remove feeds.");
    await sql`delete from community_feeds where id = ${data.feedId} and community_id = ${data.slug}`;
    return { ok: true };
  });

export const readFeeds = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((slug: string) => slug)
  .handler(async ({ context, data: slug }) => {
    const sql = await db();
    const community = await internals.requireCommunity(sql, slug);
    const member = await membershipOf(sql, (context as unknown as Viewer).userId, slug);
    const readable = community.visibility !== "private" ? member?.status !== "banned" : member?.status === "active";
    if (!readable) return { items: [] };
    const feeds = await sql<{ url: string }>`select url from community_feeds where community_id = ${slug}`;
    const { readFeed } = await import("./feeds.server");
    const settled = await Promise.allSettled(feeds.map((f) => readFeed(f.url)));
    const items = settled
      .flatMap((r) => (r.status === "fulfilled" ? r.value.items : []))
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, 40);
    return { items };
  });

// ───────────────────────────── Account deletion ───────────────────────────

/** Rows commit atomically; external object cleanup is durable and runs only after that commit. */
async function eraseAccount(sql: Awaited<ReturnType<typeof db>>, userId: string) {
  const { eraseAccountAtomically } = await import("./privacy-v9.server");
  await eraseAccountAtomically(sql, userId);
  const { processMediaDeletionQueue } = await import("./media-deletion.server");
  // Start a bounded drain after commit without delaying account removal on a provider timeout.
  // The durable queue and scheduled jobs also cover runtimes that stop this background attempt.
  void processMediaDeletionQueue(sql, { limit: 4 }).catch(error => console.warn("[delete-account] queued media cleanup:", error));
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { confirm: string }) => d)
  .handler(async ({ context, data }) => {
    if (data.confirm !== "DELETE") throw new Error('Type DELETE to confirm.');
    const sql = await db();
    const { userId } = context as Authed;
    await eraseAccount(sql, userId);
    return { ok: true };
  });

/**
 * The 18+ age check. The apps ask for a birthday when someone creates an account and send it here
 * right after sign-up. We compare it with today's date and keep only the answer ("confirmed at ...").
 * Someone under 18 has their new account erased straight away, so nothing about them is kept.
 */
export const confirmMinimumAge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { year: number; month: number; day: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    // The first call after sign-up creates the member profile, so use the name they signed up with.
    const account = (await sql<{ name: string | null; email: string | null }>`select name, email from "user" where id = ${userId}`)[0];
    await ensureProfile(sql, { userId, email: account?.email ?? null, name: account?.name ?? null });
    const row = (await sql`select age_checked_at, min_age_confirmed_at from profiles where user_id = ${userId}`)[0];
    // One check per account: never lets an existing verified member erase themselves by accident.
    // But when a migration cleared min_age_confirmed_at to force re-verification, the check must run again.
    if (row?.age_checked_at && row?.min_age_confirmed_at) return { ok: true as const };
    const result = checkBirthDate(Number(data.year), Number(data.month), Number(data.day));
    if (!result.ok) throw new Error("That is not a real date. Check the day, month and year.");
    if (result.age < MINIMUM_AGE) {
      await eraseAccount(sql, userId);
      return { ok: false as const, reason: "under-age" as const };
    }
    // Keep eligibility dates rather than birthday. Only this server check can set them.
    const eligible16 = new Date(Date.UTC(data.year + 16, data.month - 1, data.day)).toISOString().slice(0, 10);
    const eligible18 = new Date(Date.UTC(data.year + 18, data.month - 1, data.day)).toISOString().slice(0, 10);
    await sql`update profiles
      set min_age_confirmed_at = coalesce(min_age_confirmed_at, now()),
          age_checked_at = now(), age_eligible_at_16 = ${eligible16}, age_eligible_at_18 = ${eligible18},
          age_confirmed = ${result.age >= ADULT_AGE}
      where user_id = ${userId}`;
    return { ok: true as const };
  });

/** Small read used by the app's settings screen. */
export const getSafetyLimits = createServerFn({ method: "GET" }).handler(async () => ({
  maxMuteHours: MAX_MUTE_HOURS,
  maxFeedsPerCommunity: 3,
  photoMaxBytes: 2_000_000,
  videoMaxBytes: 12_000_000,
  voiceMaxBytes: 1_500_000,
}));

// ────────────────────────────── Profile photos ──────────────────────────────

const AVATAR_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_MAX_CHARS = 300_000; // about 220 KB of image: plenty for a 320-pixel square

export const setAvatar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { dataUrl: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const {hasPremium}=await import('./premium.server');const premium=await hasPremium(sql,userId),animated=data.dataUrl.startsWith('data:image/gif;');
    if(animated&&!premium)throw new Error('Animated avatars require active Kamino+ access.');
    if(!animated&&!AVATAR_DATA_URL.test(data.dataUrl))throw new Error('Choose a JPEG, PNG or WebP picture.');
    if(data.dataUrl.length>(animated?2_666_700:AVATAR_MAX_CHARS))throw new Error('That avatar is too large. Use a picture under 220 KB, or a premium GIF under 2 MB.');
    const {checkedContentMedia}=await import('./content-rules');checkedContentMedia(animated?'gif':'image',data.dataUrl,premium);
    await guard(userId, "upload");
    await refuseUnsafePicture(data.dataUrl);
    const stored = await storeMedia("avatar", data.dataUrl);
    const previous = (await sql<{ data_url: string }>`select data_url from profile_avatars where user_id = ${userId}`)[0];
    await sql`
      insert into profile_avatars (user_id, data_url) values (${userId}, ${stored})
      on conflict (user_id) do update set data_url = excluded.data_url, updated_at = now()
    `;
    await deleteMedia([previous?.data_url]);
    // The version only needs to change on every upload: the current Unix time does that.
    const version = Math.floor(Date.now() / 1000);
    await sql`update profiles set avatar_version = greatest(avatar_version + 1, ${version}) where user_id = ${userId}`;
    return { ok: true };
  });

export const removeAvatar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const gone = await sql<{ data_url: string }>`delete from profile_avatars where user_id = ${userId} returning data_url`;
    await deleteMedia(gone.map((r) => r.data_url));
    await sql`update profiles set avatar_version = 0 where user_id = ${userId}`;
    return { ok: true };
  });

/**
 * Profile pictures are seen by everyone, so a picture the safety check would hold is simply refused (there is nothing
 * to hold it in). Without an AI key only the size and type checks apply.
 */
async function refuseUnsafePicture(dataUrl: string) {
  const { checkContent } = await import("./safety.server");
  const verdict = await checkContent({ text: "", images: [dataUrl] });
  if (verdict.action === "hold") throw new Error("That picture can't be used on Kamino. Please choose another one.");
}

// ────────────────────────────── Profile wall covers ──────────────────────────────

const COVER_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const COVER_MAX_CHARS = 2_000_000; // about 1.5 MB of image: enough for a sharp 1600-pixel-wide banner

/** Your own picture as your profile's wall cover (instead of one of the built-in banners). */
export const setProfileCover = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { dataUrl: string }) => d)
  .handler(async ({ context, data }) => {
    if (typeof data?.dataUrl !== "string" || !COVER_DATA_URL.test(data.dataUrl)) throw new Error("Choose a JPEG, PNG or WebP picture.");
    if (data.dataUrl.length > COVER_MAX_CHARS) throw new Error("That picture is too large. Try one under 1.5 MB.");
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "upload");
    await refuseUnsafePicture(data.dataUrl);
    const stored = await storeMedia("avatar", data.dataUrl);
    const previous = (await sql<{ data_url: string }>`select data_url from profile_covers where user_id = ${userId}`)[0];
    await sql`
      insert into profile_covers (user_id, data_url) values (${userId}, ${stored})
      on conflict (user_id) do update set data_url = excluded.data_url, updated_at = now()
    `;
    await deleteMedia([previous?.data_url]);
    // A new address on every upload, so phones and browsers show the new picture at once.
    const cover = `/api/v1/media/cover/${encodeURIComponent(userId)}?v=${Date.now()}`;
    await sql`update profiles set cover = ${cover} where user_id = ${userId}`;
    return { cover };
  });

/** Back to no cover (the profile shows a gradient in the person's colour). */
export const removeProfileCover = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await dropProfileCover(sql, userId);
    await sql`update profiles set cover = '' where user_id = ${userId}`;
    return { ok: true };
  });

/** Deletes an uploaded cover (also used when someone switches to a built-in banner). */
async function dropProfileCover(sql: Awaited<ReturnType<typeof db>>, userId: string) {
  const gone = await sql<{ data_url: string }>`delete from profile_covers where user_id = ${userId} returning data_url`;
  await deleteMedia(gone.map((r) => r.data_url));
}

/** Wall covers are as public as profile pages, so this needs no sign-in. */
export const getProfileCoverData = createServerFn({ method: "GET" })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const sql = await db();
    const row = (await sql<{ data_url: string }>`select data_url from profile_covers where user_id = ${userId}`)[0];
    return { dataUrl: row ? await loadMedia(row.data_url) : null };
  });

/** Profile photos are as public as profile pages, so this needs no sign-in. */
export const getAvatarData = createServerFn({ method: "GET" })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const sql = await db();
    const row = (await sql<{ data_url: string }>`select data_url from profile_avatars where user_id = ${userId}`)[0];
    return { dataUrl: row ? await loadMedia(row.data_url) : null };
  });


// ────────────────────────────── Global search ──────────────────────────────

export type SearchResults = {
  query: string;
  communities: Community[];
  posts: (Post & { communityName: string })[];
  people: { userId: string; handle: string; displayName: string; hue: number; avatarV: number; rep: number }[];
};

/**
 * One search box for everything: communities, posts (including #hashtags) and people.
 * Only content the person could already open is returned: public communities and their own
 * communities; hidden posts, expired stories, unapproved wiki pages and blocked people are left out.
 */
export const searchAll = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((q: string) => q)
  .handler(async ({ context, data: raw }): Promise<SearchResults> => {
    const v = context as unknown as Viewer;
    const sql = await db();
    const query = String(raw ?? "").trim().slice(0, 60);
    const empty: SearchResults = { query, communities: [], posts: [], people: [] };
    if (query.replace(/^#/, "").length < 2) return empty;

    const isTag = query.startsWith("#");
    const term = query.replace(/^#/, "").toLowerCase().replace(/[%_\\]/g, "");
    if (term.length < 2) return empty;
    const like = `%${term}%`;
    const blocked = [...(await blockedSet(sql, v.userId))];

    const communities = isTag
      ? []
      : (
          await sql`
            select * from communities
            where visibility = 'public' and (name ilike ${like} or tagline ilike ${like} or description ilike ${like} or category ilike ${like})
            order by (name ilike ${like}) desc, member_count desc
            limit 8`
        ).map(mapCommunity);

    // Posts: public communities, plus communities the viewer belongs to.
    const postRows = await sql.query(
      `select ${POST_SELECT}, com.name as community_name
       ${POST_JOIN}
       join communities com on com.id = p.community_id
       where (${isTag ? "p.hashtags ilike $2" : "(p.title ilike $2 or p.body ilike $2 or p.hashtags ilike $2)"})
         and (com.visibility = 'public' or com.id in (select community_id from memberships where user_id = $1 and status = 'active'))
         and not exists (select 1 from memberships bm where bm.community_id = p.community_id and bm.user_id = $1 and bm.status = 'banned')
         and coalesce(p.hidden, false) = false
         and (p.expires_at is null or p.expires_at > now())
         and (p.type <> 'wiki' or p.wiki_status = 'approved')
         and p.type <> 'story'
         and ${internals.visiblePosts("$1")}
       order by p.like_count desc, p.created_at desc
       limit 40`,
      [v.userId ?? "", isTag ? `%"${term}"%` : like],
    );
    // Posts by people you muted are left out (the people search below still finds them, so you can unmute).
    const muted = await mutedSet(sql, v.userId);
    const visible = postRows.filter((r) => !blocked.includes(String(r.author_user_id)) && !muted.has(String(r.author_user_id))).slice(0, 25);
    const ids = visible.map((r) => Number(r.id));
    const liked = await likedSet(sql, v.userId, ids);
    const saved = await savedSet(sql, v.userId, ids);
    const posts = visible.map((r) => ({
      ...mapPost(r, liked.has(Number(r.id)), saved.has(Number(r.id))),
      communityName: String(r.community_name),
    }));

    const peopleRows = isTag
      ? []
      : await sql`
          select user_id, handle, display_name, avatar_hue, avatar_version, rep from profiles
          where handle ilike ${like} or display_name ilike ${like}
          order by rep desc limit 15`;
    const people = peopleRows
      .filter((r) => !blocked.includes(String(r.user_id)))
      .slice(0, 10)
      .map((r) => ({
        userId: String(r.user_id),
        handle: String(r.handle),
        displayName: String(r.display_name),
        hue: Number(r.avatar_hue) || 220,
        avatarV: Number(r.avatar_version) || 0,
        rep: Number(r.rep) || 0,
      }));

    return { query, communities, posts, people };
  });

// ────────────────────────────── Voice / video relay ──────────────────────────────

/** Network servers the browser needs for calls. Includes the relay (TURN) login when one is configured. */
export const getIceServers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context as Authed;
    const { buildIceServers } = await import("./ice.server");
    return buildIceServers(process.env, userId);
  });
