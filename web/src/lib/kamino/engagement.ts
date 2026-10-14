/**
 * Ways to take part that are earned, never bought: daily check-ins inside each community,
 * leaderboards over different time windows, and challenges with entries and judging.
 *
 * Same conventions as `server.ts`: validate input, check the caller's role on the server, and never
 * trust an id sent by the client. There is no currency here (a Kamino house law).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { guard } from "./guard";
import { optionalAuth, type Viewer } from "./optional-auth";
import { internals } from "./server";
import { canLead } from "./safety";
import { asBool, iso, mapAuthor } from "./map";
import type { BoardRow, ChallengeEntry, RankBoard, RankPeriod, Role } from "./types";

type Authed = { userId: string };
const { db, notify, membershipOf, requireActiveMember, requireCommunity, requireMinAge, blockedSet, POST_SELECT, POST_JOIN } = internals;

// ────────────────────────────── Check-in inside a community ──────────────────────────────

const COMMUNITY_CHECKIN_REP = 5;

/**
 * One check-in per community per UTC day. Keeps a streak for that community (miss a day and it
 * starts again at 1) and adds a little reputation there. Atomic: two taps at once count once.
 */
export const checkInCommunity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await requireMinAge(sql, userId);
    await requireActiveMember(sql, userId, data.slug);
    const rows = await sql<{ streak: number; best_streak: number; rep: number }>`
      update memberships
      set last_checkin_on = (now() at time zone 'UTC')::date,
          streak = case when last_checkin_on = (now() at time zone 'UTC')::date - 1 then streak + 1 else 1 end,
          best_streak = greatest(best_streak, case when last_checkin_on = (now() at time zone 'UTC')::date - 1 then streak + 1 else 1 end),
          rep = rep + ${COMMUNITY_CHECKIN_REP}
      where user_id = ${userId} and community_id = ${data.slug} and status = 'active'
        and (last_checkin_on is null or last_checkin_on < (now() at time zone 'UTC')::date)
      returning streak, best_streak, rep`;
    if (!rows[0]) {
      const current = (await sql`select streak, best_streak, rep from memberships where user_id = ${userId} and community_id = ${data.slug}`)[0];
      return { already: true, streak: Number(current?.streak) || 0, bestStreak: Number(current?.best_streak) || 0, rep: Number(current?.rep) || 0 };
    }
    await sql`insert into community_checkin_days(user_id,community_id,day) values(${userId},${data.slug},(now() at time zone 'UTC')::date) on conflict do nothing`;
    return { already: false, streak: Number(rows[0].streak), bestStreak: Number(rows[0].best_streak), rep: Number(rows[0].rep) };
  });

// ────────────────────────────── Leaderboards ──────────────────────────────

const PERIOD_DAYS: Record<Exclude<RankPeriod, "all">, number> = { week: 7, month: 30 };

/**
 * The community leaderboard. `by` picks the board:
 *   activity: 3 points per like received + 4 per post in the period (all-time rep breaks ties)
 *   streak:   the longest check-in streak (current streak first, then best ever)
 *   quiz:     quiz points scored in the period
 * `period` is week, month or all (streak ignores it).
 */
export const communityRank = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { slug: string; by?: RankBoard; period?: RankPeriod }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const v = context as unknown as Viewer;
    const community = await requireCommunity(sql, data.slug);
    const member = await membershipOf(sql, v.userId, data.slug);
    const readable = community.visibility !== "private" ? member?.status !== "banned" : member?.status === "active";
    if (!readable) throw new Error("This community is private.");

    const by: RankBoard = data.by === "streak" || data.by === "quiz" ? data.by : "activity";
    const period: RankPeriod = data.period === "month" || data.period === "all" ? data.period : "week";
    // The number of days is one of our own constants, never text from the client.
    const since = period === "all" ? "" : `and x.created_at > now() - interval '${PERIOD_DAYS[period]} days'`;

    const rows = await sql.query(
      `select * from (
         select m.user_id, m.nickname, m.persona_hue, m.role, m.rep, m.streak, m.best_streak, m.last_checkin_on, pr.handle, pr.avatar_version,
                (select count(*)::int from posts x where x.author_user_id = m.user_id and x.community_id = m.community_id ${since}) as period_posts,
                (select coalesce(sum(x.like_count),0)::int from posts x where x.author_user_id = m.user_id and x.community_id = m.community_id ${since}) as period_likes,
                (select coalesce(sum(x.score),0)::int from quiz_attempts x join posts qp on qp.id = x.post_id
                  where x.user_id = m.user_id and qp.community_id = m.community_id ${since}) as period_quiz
         from memberships m
         left join profiles pr on pr.user_id = m.user_id
         where m.community_id = $1 and m.status = 'active'
       ) ranked
       order by ${
         by === "streak"
           ? "(case when last_checkin_on >= (now() at time zone 'UTC')::date - 1 then streak else 0 end) desc, best_streak desc, rep desc"
           : by === "quiz"
             ? "period_quiz desc, rep desc"
             : "period_likes * 3 + period_posts * 4 desc, rep desc"
       }
       limit 40`,
      [data.slug],
    );

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const rank: BoardRow[] = rows.map((r) => {
      const last = r.last_checkin_on ? String(iso(r.last_checkin_on)).slice(0, 10) : "";
      const alive = last === today || last === yesterday; // a streak that is still running
      const weekPosts = Number(r.period_posts) || 0;
      const weekLikes = Number(r.period_likes) || 0;
      const quizPoints = Number(r.period_quiz) || 0;
      return {
        userId: String(r.user_id),
        nickname: String(r.nickname),
        handle: String(r.handle || "member"),
        hue: Number(r.persona_hue) || 220,
        avatarV: Number(r.avatar_version) || 0,
        role: (r.role as Role) ?? "member",
        rep: Number(r.rep) || 0,
        weekPosts,
        weekLikes,
        weekScore: weekLikes * 3 + weekPosts * 4,
        score: by === "quiz" ? quizPoints : by === "streak" ? (alive ? Number(r.streak) || 0 : 0) : weekLikes * 3 + weekPosts * 4,
      };
    });
    return { community, by, period, rank };
  });

// ────────────────────────────── Challenges ──────────────────────────────

const PLACE_REP: Record<number, number> = { 1: 50, 2: 30, 3: 20 };
const PLACE_LABEL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

async function requireChallenge(sql: Awaited<ReturnType<typeof db>>, eventId: number) {
  const event = (await sql`select * from events where id = ${eventId}`)[0];
  if (!event || event.kind !== "challenge") throw new Error("Challenge not found.");
  return event;
}

/** Enter a challenge with one of your own posts in that community. Entering again swaps your post. */
export const enterChallenge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { eventId: number; postId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "post");
    await requireMinAge(sql, userId);
    const event = await requireChallenge(sql, Number(data.eventId));
    await requireActiveMember(sql, userId, String(event.community_id));
    await (await import('./billing.server')).assertPaidResourceAccess(sql,userId,'event',Number(data.eventId));
    if (event.judged_at) throw new Error("This challenge has already been judged.");
    const now = Date.now();
    if (new Date(String(event.starts_at)).getTime() > now) throw new Error("This challenge has not started yet.");
    if (event.ends_at && new Date(String(event.ends_at)).getTime() <= now) throw new Error("This challenge has ended.");

    const post = (await sql`select id, author_user_id, community_id, type, hidden, expires_at, wiki_status from posts where id = ${Number(data.postId)}`)[0];
    if (!post || post.author_user_id !== userId || post.community_id !== event.community_id) throw new Error("Pick one of your own posts from this community.");
    if (asBool(post.hidden) || post.type === "story") throw new Error("That post cannot be entered.");
    await sql`
      insert into challenge_entries (event_id, user_id, post_id) values (${Number(data.eventId)}, ${userId}, ${Number(data.postId)})
      on conflict (event_id, user_id) do update set post_id = excluded.post_id, created_at = now()`;
    return { ok: true };
  });

/** Everyone's entries (winners first, then the most liked). Readers only see visible posts. */
export const listChallengeEntries = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((eventId: number) => eventId)
  .handler(async ({ context, data: eventId }) => {
    const sql = await db();
    const v = context as unknown as Viewer;
    const event = await requireChallenge(sql, Number(eventId));
    const community = await requireCommunity(sql, String(event.community_id));
    await internals.assertCommunityReadable(sql,v.userId,community.id);
    await (await import('./billing.server')).assertPaidResourceAccess(sql,v.userId,'event',Number(eventId));
    const blocked = await blockedSet(sql, v.userId);
    const rows = await sql.query(
      `select ${POST_SELECT}, e.placement, e.created_at as entered_at
       ${POST_JOIN}
       join challenge_entries e on e.post_id = p.id and e.user_id = p.author_user_id
       where e.event_id = $1 and coalesce(p.hidden, false) = false
         and ${internals.visiblePosts("$2")}
       order by e.placement asc nulls last, p.like_count desc, e.created_at asc
       limit 60`,
      [Number(eventId), v.userId ?? ""],
    );
    const entries: ChallengeEntry[] = rows
      .filter((r) => !blocked.has(String(r.author_user_id)))
      .map((r) => ({
        postId: Number(r.id),
        title: String(r.title),
        cover: String(r.cover ?? ""),
        author: mapAuthor(r),
        likeCount: Number(r.like_count) || 0,
        placement: r.placement == null ? null : Number(r.placement),
        enteredAt: iso(r.entered_at),
      }));
    return { eventId: Number(eventId), judged: Boolean(event.judged_at), entries };
  });

/**
 * Leaders pick up to three winners (1st, 2nd, 3rd), once. Winners get reputation in the community
 * and a notification. There is no prize currency.
 */
export const judgeChallenge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { eventId: number; winners: { postId: number; place: 1 | 2 | 3 }[] }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const event = await requireChallenge(sql, Number(data.eventId));
    const me = await requireActiveMember(sql, userId, String(event.community_id));
    await (await import('./billing.server')).assertPaidResourceAccess(sql,userId,'event',Number(data.eventId));
    if (!canLead(me.role)) throw new Error("Leaders pick the winners.");
    if (event.judged_at) throw new Error("This challenge has already been judged.");
    const winners = Array.isArray(data.winners) ? data.winners : [];
    if (!winners.length || winners.length > 3) throw new Error("Choose between one and three winners.");
    const places = new Set(winners.map((w) => Number(w.place)));
    const postIds = new Set(winners.map((w) => Number(w.postId)));
    if (places.size !== winners.length || postIds.size !== winners.length || [...places].some((p) => !PLACE_REP[p])) {
      throw new Error("Each place (1st, 2nd, 3rd) and each entry can be used once.");
    }

    // Only real entries can win, and the author must still be an active member.
    const entered = await sql<{ post_id: number; user_id: string }>`
      select e.post_id, e.user_id from challenge_entries e
      join memberships m on m.user_id = e.user_id and m.community_id = ${String(event.community_id)} and m.status = 'active'
      where e.event_id = ${Number(data.eventId)}`;
    const byPost = new Map(entered.map((e) => [Number(e.post_id), String(e.user_id)]));
    for (const w of winners) if (!byPost.has(Number(w.postId))) throw new Error("A chosen post is not an entry in this challenge.");

    // Claim the judging first, so two leaders clicking at once cannot both hand out rewards.
    const claimed = await sql`update events set judged_at = now() where id = ${Number(data.eventId)} and judged_at is null returning id`;
    if (!claimed.length) throw new Error("This challenge has already been judged.");

    for (const w of winners) {
      const winnerId = byPost.get(Number(w.postId))!;
      const place = Number(w.place);
      await sql`update challenge_entries set placement = ${place} where event_id = ${Number(data.eventId)} and user_id = ${winnerId}`;
      await sql`update memberships set rep = rep + ${PLACE_REP[place]!} where user_id = ${winnerId} and community_id = ${String(event.community_id)}`;
      await sql`update profiles set rep = rep + ${PLACE_REP[place]!} where user_id = ${winnerId}`;
      await notify(sql, winnerId, "challenge", `You placed ${PLACE_LABEL[place]}!`, `Your entry won ${PLACE_LABEL[place]} place in "${String(event.title)}".`, `/c/${String(event.community_id)}`, {
        targetType: "event",
        targetId: Number(data.eventId),
      });
    }
    await sql`insert into audit_log (community_id, actor_id, action, detail)
      values (${String(event.community_id)}, ${userId}, 'challenge_judged', ${`Judged "${String(event.title)}"`})`;
    return { ok: true };
  });

/** The caller's own recent posts in one community (what they can enter into a challenge). */
export const listMyPostsIn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((slug: string) => slug)
  .handler(async ({ context, data: slug }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await requireActiveMember(sql, userId, slug);
    const rows = await sql<{ id: number; title: string; type: string }>`
      select id, title, type from posts
      where author_user_id = ${userId} and community_id = ${slug}
        and coalesce(hidden, false) = false and type <> 'story'
        and (expires_at is null or expires_at > now())
      order by created_at desc limit 30`;
    return rows.map((r) => ({ id: Number(r.id), title: String(r.title), type: String(r.type) }));
  });
