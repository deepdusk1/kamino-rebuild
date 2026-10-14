/**
 * The redesign's server features: home, feed tabs, explore, search, onboarding, community overview, live rooms,
 * chats overview with message requests / read receipts / typing, the new notifications list, profile overview,
 * follow requests for private accounts, and a few small helpers for the composer.
 *
 * Same conventions as `server.ts`: every function validates its input, checks permissions on the server, and never
 * trusts an id sent by the client. The small pure rules (scores, categories, quiet hours...) live in
 * `social-rules.ts` with unit tests. These functions are also reachable from the phone app over
 * `/api/v1/rpc/<name>` (see `mobile-api.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { optionalAuth, type Viewer } from "./optional-auth";
import { internals } from "./server";
import { paidResourceAccessSql } from "./billing-policy";
import { guard } from "./guard";
import { canLead, scanText } from "./safety";
import { isSiteAdmin, takeDown } from "./safety.server";
import { publishEvent } from "./events.server";
import { asBool, iso, mapCommunity, mapHallEvent, mapPost, mapProfile, mapRoom, parseJson } from "./map";
import {
  EXPLORE_BANNERS,
  HOME_HEROES,
  cleanInterests,
  cleanTopics,
  canDeleteComment,
  communityActivityScore,
  communityMatchesInterest,
  forYouScore,
  fuzzyScore,
  interestsForCommunity,
  isCreator,
  isOnlineNow,
  joinColor,
  moderatorBadge,
  muteSilences,
  MUTE_SILENCED_KINDS,
  notificationCategory,
  notificationVerb,
  parseCursor,
  parseHref,
  rankBucket,
  scrubProfile,
  streakWeek,
  suggestTagsFrom,
  trendingScore,
  utcDay,
  INTEREST_KEYS,
} from "./social-rules";
import { INTEREST_OPTIONS, PROFILE_CATEGORY_OPTIONS } from "./types";
import type {
  Achievement,
  AuthorChip,
  ChatOverviewRoom,
  Comment,
  Community,
  CommunityCardData,
  CreatorCard,
  EventCard,
  FeedTab,
  HallEvent,
  Hero,
  InterestOption,
  LiveRoomCard,
  MediaItem,
  ModeratorRow,
  MutedPerson,
  NotificationFilter,
  NotificationItem,
  PersonRow,
  Post,
  Profile,
  ProfileCategoryOption,
  Role,
  RoomKind,
  SearchEverything,
  StreakInfo,
} from "./types";

type Authed = { userId: string };
type Sql = Awaited<ReturnType<typeof internals.db>>;
type Row = Record<string, unknown>;
const { db, notify, membershipOf, requireCommunity, requireActiveMember, requirePostAccess, requireRoomAccess, blockedSet, mutedSet, likedSet, savedSet,  visiblePosts, POST_SELECT, POST_JOIN } =
  internals;

/** A post in a list that mixes communities (home, feed, search). */
export type PostWithCommunity = Post & { communityName: string; communityIcon: string; communityHue: number };

// ───────────────────────────── Shared helpers ─────────────────────────────

/** Turns `context` into the viewer's id (null when signed out). */
function viewerId(context: unknown): string | null {
  return (context as Viewer).userId ?? null;
}

/** An AuthorChip from a row holding nickname/display_name, handle, persona_hue/avatar_hue and avatar_version. */
function chip(r: Row): AuthorChip {
  return {
    userId: String(r.user_id),
    nickname: String(r.nickname || r.display_name || "Member"),
    handle: String(r.handle || "member"),
    hue: Number(r.persona_hue ?? r.avatar_hue) || 220,
    avatarV: Number(r.avatar_version) || 0,
  };
}

/** "seen in the last 15 minutes" (sample members always count, so the demo rooms look alive). */
const ACTIVE_IN_ROOM = `(cmv.user_id like 'seed:%' or exists (select 1 from profiles lp where lp.user_id = cmv.user_id and lp.last_seen_at > now() - interval '15 minutes'))`;
/** Notification kinds for chat messages: the Chats tab shows those, so the Notifications list and bell leave them out. */
const CHAT_NOTIFICATION_KINDS = ["chat", "message"];

/** What the viewer belongs to and who they do not want to see (blocked or muted). Loaded once per request. */
async function viewerContext(sql: Sql, userId: string | null) {
  if (!userId)
    return {
      userId,
      joined: new Set<string>(),
      banned: new Set<string>(),
      blocked: new Set<string>(),
      muted: new Set<string>(),
      following: new Set<string>(),
      interests: [] as string[],
      profile: null as Profile | null,
    };
  const memberships = await sql<{ community_id: string; status: string }>`select community_id, status from memberships where user_id = ${userId}`;
  const following = await sql<{ followee_id: string }>`select followee_id from profile_follows where follower_id = ${userId}`;
  const row = (await sql`select * from profiles where user_id = ${userId}`)[0];
  const profile = row ? mapProfile(row) : null;
  return {
    userId,
    joined: new Set(memberships.filter((m) => m.status === "active").map((m) => m.community_id)),
    banned: new Set(memberships.filter((m) => m.status === "banned").map((m) => m.community_id)),
    blocked: await blockedSet(sql, userId),
    // People the viewer muted: their posts and comments are left out of lists (they are not blocked).
    muted: await mutedSet(sql, userId),
    following: new Set(following.map((f) => f.followee_id)),
    interests: profile?.interests ?? [],
    profile,
  };
}
type ViewerContext = Awaited<ReturnType<typeof viewerContext>>;

type CommunityStat = {
  members: number;
  posts7: number;
  posts30: number;
  comments30: number;
  checkins30: number;
  newMembers14: number;
  activity: number;
  trending: number;
  rankPercent: number;
};

let statsCache: { at: number; byId: Map<string, CommunityStat> } | null = null;

/**
 * Activity numbers for every community (one query, kept for a minute): used for "Top 1%" badges, trending and
 * fast-growing lists. A community created after the last count is counted again straight away.
 */
async function communityStats(sql: Sql, mustInclude?: string): Promise<Map<string, CommunityStat>> {
  if (statsCache && Date.now() - statsCache.at < 60_000 && (!mustInclude || statsCache.byId.has(mustInclude))) return statsCache.byId;
  const rows = await sql<Row>`
    with p as (
      select community_id, count(*)::int as n30,
             sum(case when created_at > now() - interval '7 days' then 1 else 0 end)::int as n7
      from posts where created_at > now() - interval '30 days' and created_at <= now() and coalesce(hidden, false) = false
      group by community_id
    ), c as (
      select p.community_id, count(*)::int as n
      from comments cm join posts p on p.id = cm.post_id
      where cm.created_at > now() - interval '30 days' and cm.held = false
      group by p.community_id
    ), m as (
      select community_id,
             sum(case when last_checkin_on >= (now() at time zone 'UTC')::date - 30 then 1 else 0 end)::int as checkins,
             sum(case when joined_at > now() - interval '14 days' then 1 else 0 end)::int as new14
      from memberships where status = 'active' group by community_id
    )
    select co.id, co.member_count, coalesce(p.n30, 0) as posts30, coalesce(p.n7, 0) as posts7,
           coalesce(c.n, 0) as comments30, coalesce(m.checkins, 0) as checkins30, coalesce(m.new14, 0) as new14
    from communities co
    left join p on p.community_id = co.id
    left join c on c.community_id = co.id
    left join m on m.community_id = co.id`;
  const list = rows.map((r) => {
    const s = {
      id: String(r.id),
      members: Number(r.member_count) || 0,
      posts7: Number(r.posts7) || 0,
      posts30: Number(r.posts30) || 0,
      comments30: Number(r.comments30) || 0,
      checkins30: Number(r.checkins30) || 0,
      newMembers14: Number(r.new14) || 0,
    };
    return {
      ...s,
      activity: communityActivityScore({ posts: s.posts30, comments: s.comments30, checkins: s.checkins30, members: s.members }),
      trending: trendingScore(s),
    };
  });
  const ranked = [...list].sort((a, b) => b.activity - a.activity || b.members - a.members);
  const byId = new Map<string, CommunityStat>();
  ranked.forEach((s, i) => byId.set(s.id, { ...s, rankPercent: rankBucket(i + 1, ranked.length) }));
  statsCache = { at: Date.now(), byId };
  return byId;
}

/** Adds what the community cards need: joined, how many are online now, and up to four member faces. */
async function toCards(sql: Sql, communities: Community[], ctx: ViewerContext): Promise<CommunityCardData[]> {
  if (!communities.length) return [];
  const ids = communities.map((c) => c.id);
  const online = await sql.query<{ community_id: string; n: number }>(
    `select m.community_id, count(*)::int as n
     from memberships m join profiles pr on pr.user_id = m.user_id
     where m.community_id = any($1) and m.status = 'active' and pr.show_online = true
       and pr.last_seen_at > now() - interval '5 minutes'
     group by m.community_id`,
    [ids],
  );
  const onlineBy = new Map(online.map((r) => [String(r.community_id), Number(r.n) || 0]));
  const faces = await sql.query<Row>(
    `select * from (
       select m.community_id, m.user_id, m.nickname, m.persona_hue, pr.display_name, pr.handle, pr.avatar_hue, pr.avatar_version,
              row_number() over (partition by m.community_id order by (pr.avatar_version > 0) desc, m.rep desc, m.joined_at) as rn
       from memberships m join profiles pr on pr.user_id = m.user_id
       where m.community_id = any($1) and m.status = 'active'
     ) ranked where rn <= 4 order by community_id, rn`,
    [ids],
  );
  const facesBy = new Map<string, AuthorChip[]>();
  for (const r of faces) {
    if (ctx.blocked.has(String(r.user_id))) continue;
    const list = facesBy.get(String(r.community_id)) ?? [];
    list.push(chip(r));
    facesBy.set(String(r.community_id), list);
  }
  return communities.map((c) => ({
    ...c,
    joined: ctx.joined.has(c.id),
    onlineCount: onlineBy.get(c.id) ?? 0,
    memberFaces: facesBy.get(c.id) ?? [],
  }));
}

/** Does a community fit a chip (an interest key such as "kpop", or an old category name such as "Games")? */
function fitsCategory(c: Community, category: string | undefined): boolean {
  if (!category || category === "forYou" || category === "all") return true;
  const key = category.toLowerCase();
  if (INTEREST_KEYS.includes(key)) return communityMatchesInterest(c.category, c.topics, key);
  return c.category.toLowerCase() === key || communityMatchesInterest(c.category, c.topics, key);
}

/** Communities anyone may find: public ones the viewer is not banned from. */
async function discoverable(sql: Sql, ctx: ViewerContext): Promise<Community[]> {
  return (await sql.query<Row>(`select c.* from communities c where c.visibility='public' and ${internals.communityAccessSql('$1')}
    and not exists(select 1 from discovery_feedback f where f.user_id=$1 and f.target_type='community' and f.target_id=c.id and f.preference='hide')`, [ctx.userId ?? ''])).map(mapCommunity);
}

/** Rows from a `select POST_SELECT, com.name as community_name, com.icon as community_icon, com.hue as community_hue` query. */
async function postCards(sql: Sql, rows: Row[], ctx: ViewerContext): Promise<PostWithCommunity[]> {
  const visible = rows.filter(
    (r) => !ctx.blocked.has(String(r.author_user_id)) && !ctx.muted.has(String(r.author_user_id)) && !ctx.banned.has(String(r.community_id)),
  );
  const ids = visible.map((r) => Number(r.id));
  const liked = await likedSet(sql, ctx.userId, ids);
  const saved = await savedSet(sql, ctx.userId, ids);
  return visible.map((r) => ({
    ...mapPost(r, liked.has(Number(r.id)), saved.has(Number(r.id))),
    communityName: String(r.community_name ?? ""),
    communityIcon: String(r.community_icon ?? ""),
    communityHue: Number(r.community_hue) || 220,
  }));
}

const POST_COMMUNITY_COLUMNS = `com.name as community_name, com.icon as community_icon, com.hue as community_hue, com.category as community_category, com.topics as community_topics`;

/** Where a viewer may read posts: public and unlisted communities, plus private ones they are an active member of. */
const READABLE_COMMUNITY = (viewer: string) =>
  internals.communityAccessSql(viewer, 'com');

/** People cards: who they are, how many follow them, and whether the viewer follows them already. */
async function creatorCards(sql: Sql, rows: Row[], ctx: ViewerContext): Promise<CreatorCard[]> {
  const ids = rows.map((r) => String(r.user_id));
  const requested = new Set(
    ctx.userId && ids.length
      ? (await sql.query<{ followee_id: string }>(`select followee_id from follow_requests where follower_id = $1 and followee_id = any($2)`, [ctx.userId, ids])).map(
          (r) => String(r.followee_id),
        )
      : [],
  );
  return rows.map((r) => {
    const followers = Number(r.followers) || 0;
    return {
      userId: String(r.user_id),
      handle: String(r.handle),
      displayName: String(r.display_name),
      avatarHue: Number(r.avatar_hue) || 220,
      avatarV: Number(r.avatar_version) || 0,
      headline: String(r.headline ?? ""),
      verified: asBool(r.verified),
      creator: isCreator(asBool(r.creator), followers),
      followers,
      following: ctx.following.has(String(r.user_id)),
      requested: requested.has(String(r.user_id)),
    };
  });
}

const CREATOR_COLUMNS = `p.user_id, p.handle, p.display_name, p.avatar_hue, p.avatar_version, p.headline, p.verified, p.creator, p.interests, p.rep,
  (select count(*)::int from profile_follows f where f.followee_id = p.user_id) as followers`;

/**
 * People worth following: verified and creator accounts first, then the most followed. When interests are given,
 * people who share them (or are active in matching communities) come first.
 */
async function suggestedCreators(sql: Sql, ctx: ViewerContext, interests: string[], limit: number): Promise<CreatorCard[]> {
  const rows = await sql.query<Row>(
    `select ${CREATOR_COLUMNS} from profiles p
     where p.user_id <> $1 and p.search_visible=true and (p.min_age_confirmed_at is not null or p.user_id like 'seed:%')
       and not exists(select 1 from identity_account_status s where s.user_id=p.user_id and s.status<>'active' and (s.until is null or s.until>now()))
     order by p.featured_creator desc, p.verified desc, p.creator desc, followers desc, p.rep desc
     limit 80`,
    [ctx.userId ?? ""],
  );
  let candidates = rows.filter((r) => String(r.user_id) !== ctx.userId && !ctx.blocked.has(String(r.user_id)) && !ctx.muted.has(String(r.user_id)));
  if (interests.length) {
    const activeIn = new Map<string, Set<string>>();
    const memberRows = await sql.query<{ user_id: string; category: string; topics: string }>(
      `select m.user_id, c.category, c.topics from memberships m join communities c on c.id = m.community_id
       where m.status = 'active' and m.user_id = any($1)`,
      [candidates.map((r) => String(r.user_id))],
    );
    for (const m of memberRows) {
      const set = activeIn.get(m.user_id) ?? new Set<string>();
      for (const k of interestsForCommunity(m.category, parseJson<string[]>(m.topics, []))) set.add(k);
      activeIn.set(m.user_id, set);
    }
    const matches = (r: Row) => {
      const own = cleanInterests(parseJson<unknown>(r.interests, []));
      const via = activeIn.get(String(r.user_id)) ?? new Set<string>();
      return interests.some((k) => own.includes(k) || via.has(k));
    };
    candidates = [...candidates.filter(matches), ...candidates.filter((r) => !matches(r))];
  }
  // People you do not follow yet first (so the Follow buttons are useful), keeping the order otherwise.
  candidates = [...candidates.filter((r) => !ctx.following.has(String(r.user_id))), ...candidates.filter((r) => ctx.following.has(String(r.user_id)))];
  return creatorCards(sql, candidates.slice(0, limit), ctx);
}

/** Voice and screening rooms as cards. `onlyLive` keeps rooms somebody is in right now. */
async function roomCards(
  sql: Sql,
  ctx: ViewerContext,
  options: { scope: "joined" | "all"; communityId?: string; onlyLive: boolean; kinds?: RoomKind[]; search?: string; limit: number },
): Promise<LiveRoomCard[]> {
  const params: unknown[] = [ctx.userId ?? "", options.kinds ?? ["voice", "screening"]];
  let where = `r.kind = any($2) and r.community_id is not null
    and (r.kind <> 'private' or exists (select 1 from chat_members pm where pm.room_id = r.id and pm.user_id = $1))
    and ${internals.communityAccessSql('$1','c')}
    and (${internals.paidRoomAccessSql('$1','r')})
    and not exists(select 1 from chat_members removed where removed.room_id=r.id and removed.user_id=$1 and removed.room_removed=true)`;
  if (options.scope === "joined") where += ` and exists (select 1 from memberships jm where jm.community_id = c.id and jm.user_id = $1 and jm.status = 'active')`;
  else where += ` and c.visibility = 'public'`;
  if (options.communityId) {
    params.push(options.communityId);
    where += ` and r.community_id = $${params.length}`;
  }
  if (options.search) {
    params.push(`%${options.search}%`);
    where += ` and (r.name ilike $${params.length} or r.topic ilike $${params.length} or c.name ilike $${params.length})`;
  }
  const rows = await sql.query<Row>(
    `select * from (
       select r.id, r.name, r.kind, r.topic, r.watch_title, r.community_id, c.name as community_name, c.cover, c.category, c.hue,
              (select count(*)::int from chat_members cmv where cmv.room_id = r.id and cmv.in_voice = true and ${ACTIVE_IN_ROOM}) as live_count
       from chat_rooms r join communities c on c.id = r.community_id
       where ${where}
     ) rooms
     ${options.onlyLive ? "where live_count > 0" : ""}
     order by live_count desc, id desc
     limit ${Math.max(1, Math.min(60, options.limit))}`,
    params,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  const faceRows = await sql.query<Row>(
    `select * from (
       select cmv.room_id, cmv.user_id, mb.nickname, mb.persona_hue, pr.display_name, pr.handle, pr.avatar_hue, pr.avatar_version,
              row_number() over (partition by cmv.room_id order by cmv.in_voice desc, (pr.avatar_version > 0) desc, pr.rep desc) as rn
       from chat_members cmv
       join chat_rooms r on r.id = cmv.room_id
       join profiles pr on pr.user_id = cmv.user_id
       left join memberships mb on mb.user_id = cmv.user_id and mb.community_id = r.community_id
       where cmv.room_id = any($1) and (cmv.in_voice = false or ${ACTIVE_IN_ROOM})
     ) ranked where rn <= 4`,
    [ids],
  );
  const facesBy = new Map<number, AuthorChip[]>();
  for (const r of faceRows) {
    if (ctx.blocked.has(String(r.user_id))) continue;
    const list = facesBy.get(Number(r.room_id)) ?? [];
    list.push(chip(r));
    facesBy.set(Number(r.room_id), list);
  }
  return rows.map((r, i) => ({
    roomId: Number(r.id),
    communityId: String(r.community_id),
    communityName: String(r.community_name),
    title: String(r.name),
    subtitle: String(r.watch_title || r.community_name),
    topic: String(r.topic || r.category || ""),
    cover: String(r.cover ?? ""),
    liveCount: Number(r.live_count) || 0,
    faces: facesBy.get(Number(r.id)) ?? [],
    color: joinColor(i),
    kind: String(r.kind) as RoomKind,
    joined: ctx.joined.has(String(r.community_id)),
  }));
}

/** A picture address for a post: its own link, or the media route for uploaded pictures. */
function postThumb(id: number, cover: string): string {
  if (!cover) return "";
  return cover.startsWith("data:") || cover.startsWith("s3:") ? `/api/v1/media/post/${id}/0` : cover;
}

/** The daily streak card from a profile row. */
function streakOf(profile: Profile | null): StreakInfo {
  const last = profile?.lastCheckinAt ? utcDay(new Date(profile.lastCheckinAt)) : null;
  const s = streakWeek(last, profile?.streak ?? 0);
  return { ...s, best: Math.max(profile?.bestStreak ?? 0, s.days) };
}

function cleanText(raw: unknown, max: number): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ───────────────────────────── Home ─────────────────────────────

/**
 * Everything the Home screen shows above the feed: carousel slides, recommended and trending communities, the daily
 * streak card, the next live event, featured creators and live rooms. `interest` (a chip such as "gaming") narrows
 * the lists; "forYou" or nothing uses the viewer's own interests.
 */
export const homeOverview = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d?: { interest?: string }) => ({ interest: typeof d?.interest === "string" ? d.interest.trim().toLowerCase().slice(0, 30) : "" }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const ctx = await viewerContext(sql, viewerId(context));
    const chipKey = data.interest && data.interest !== "foryou" && data.interest !== "all" ? data.interest : "";
    const interests = chipKey ? [chipKey] : ctx.interests;
    const stats = await communityStats(sql);
    const all = await discoverable(sql, ctx);
    const matching = (c: Community) => !interests.length || interests.some((k) => fitsCategory(c, k));
    const byScore = (a: Community, b: Community) => (stats.get(b.id)?.activity ?? 0) - (stats.get(a.id)?.activity ?? 0) || b.memberCount - a.memberCount;
    const byTrend = (a: Community, b: Community) => (stats.get(b.id)?.trending ?? 0) - (stats.get(a.id)?.trending ?? 0) || b.memberCount - a.memberCount;

    let recommendedList = all.filter((c) => !ctx.joined.has(c.id) && matching(c)).sort(byScore);
    if (!recommendedList.length && !chipKey) recommendedList = all.filter((c) => !ctx.joined.has(c.id)).sort(byScore);
    const trendingList = all.filter((c) => !chipKey || fitsCategory(c, chipKey)).sort(byTrend);

    // The next event from the viewer's communities (or public ones when signed out / nothing joined).
    const joinedRows = ctx.joined.size ? (await sql.query<Row>(`select * from communities where id = any($1)`, [[...ctx.joined]])).map(mapCommunity) : [];
    const byId = new Map([...all, ...joinedRows].map((c) => [c.id, c]));
    const fitsChip = (communityId: string, topic = "") => {
      if (!chipKey) return true;
      const c = byId.get(communityId);
      return (c ? fitsCategory(c, chipKey) : false) || interestsForCommunity(topic).includes(chipKey);
    };
    const eventScope = ctx.joined.size ? [...ctx.joined] : all.map((c) => c.id);
    const allowedEvents = eventScope.filter((id) => fitsChip(id));
    let liveEvent: EventCard | null = null;
    if (allowedEvents.length) {
      const ev = (
        await sql.query<Row>(
          `select e.*, c.name as community_name, c.cover as community_cover, c.hue as community_hue,
                  (select count(*)::int from event_rsvps r where r.event_id = e.id) as rsvp_count,
                  (select count(*)::int from challenge_entries ce where ce.event_id = e.id) as entry_count,
                  (select ce.post_id from challenge_entries ce where ce.event_id = e.id and ce.user_id = $2) as my_entry_post_id
           from events e join communities c on c.id = e.community_id
           where e.community_id = any($1) and e.kind = 'event'
             and e.status<>'cancelled' and ${paidResourceAccessSql('$2','event','e.id')}
             and ${internals.communityAccessSql('$2','c')}
             and coalesce(e.ends_at, e.starts_at + interval '3 hours') > now()
           order by e.starts_at asc limit 1`,
          [allowedEvents, ctx.userId ?? ""],
        )
      )[0];
      if (ev) {
        const going = ctx.userId ? (await sql`select 1 from event_rsvps where event_id = ${Number(ev.id)} and user_id = ${ctx.userId}`).length > 0 : false;
        const faces = (
          await sql.query<Row>(
            `select r.user_id, mb.nickname, mb.persona_hue, pr.display_name, pr.handle, pr.avatar_hue, pr.avatar_version
             from event_rsvps r join profiles pr on pr.user_id = r.user_id
             left join memberships mb on mb.user_id = r.user_id and mb.community_id = $2
             where r.event_id = $1 order by (pr.avatar_version > 0) desc limit 6`,
            [Number(ev.id), String(ev.community_id)],
          )
        )
          .filter((r) => !ctx.blocked.has(String(r.user_id)))
          .slice(0, 4)
          .map(chip);
        liveEvent = {
          ...mapHallEvent(ev, going),
          communityName: String(ev.community_name),
          communityCover: String(ev.community_cover ?? ""),
          communityHue: Number(ev.community_hue) || 220,
          faces,
        };
      }
    }

    const liveRooms = (await roomCards(sql, ctx, { scope: ctx.joined.size ? "joined" : "all", onlyLive: true, limit: 12 })).filter((r) =>
      fitsChip(r.communityId, r.topic),
    );

    return {
      heroes: HOME_HEROES as Hero[],
      recommended: await toCards(sql, recommendedList.slice(0, 10), ctx),
      trending: await toCards(sql, trendingList.slice(0, 10), ctx),
      streak: streakOf(ctx.profile),
      liveEvent,
      featuredCreators: await suggestedCreators(sql, ctx, interests, 10),
      liveRooms,
    };
  });

// ───────────────────────────── Feed tabs ─────────────────────────────

const PAGE = 20;

/**
 * The home feed under the cards, in three tabs:
 *   forYou      ranked with `forYouScore` (fresh × engagement, boosted for joined communities and your interests)
 *   following   posts by people you follow, newest first
 *   communities posts in communities you joined, newest first
 * Scheduled, members-only, hidden, blocked and banned rules all apply. `next` is the cursor for the next page.
 */
export const feed = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { tab: FeedTab; cursor?: string | null }) => ({
    tab: (["forYou", "following", "communities"] as const).includes(d?.tab) ? d.tab : ("forYou" as FeedTab),
    cursor: typeof d?.cursor === "string" ? d.cursor : null,
  }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const ctx = await viewerContext(sql, viewerId(context));
    const viewer = ctx.userId ?? "";
    const base = `select ${POST_SELECT}, ${POST_COMMUNITY_COLUMNS}
      ${POST_JOIN}
      join communities com on com.id = p.community_id
      where coalesce(p.hidden, false) = false and (p.expires_at is null or p.expires_at > now())
        and p.type not in ('wiki', 'story')
        and ${visiblePosts("$1")} and ${READABLE_COMMUNITY("$1")}`;

    if (data.tab === "forYou") {
      const cursor = parseCursor(data.cursor);
      const offset = cursor && "offset" in cursor ? cursor.offset : 0;
      // Candidates: the last three weeks from joined communities and public ones (at most 400, newest first).
      const rows = await sql.query<Row>(
        `${base} and p.created_at > now() - interval '21 days'
           and (com.visibility = 'public' or exists (select 1 from memberships jm where jm.community_id = com.id and jm.user_id = $1 and jm.status = 'active'))
         order by p.created_at desc limit 400`,
        [viewer],
      );
      const now = Date.now();
      const semanticScores = ctx.userId && await (await import('./platform-flags.server')).platformFlagActive(sql,ctx.userId,'related_discovery',true)
        ? await (await import('./search-v10.server')).cachedSemanticScores(sql,ctx.userId,rows.map(r=>Number(r.id))) : new Map<number,number>();
      const feedbackRows = ctx.userId ? await sql<Row>`select target_type,target_id,preference from discovery_feedback where user_id=${ctx.userId}` : [];
      const feedback = new Map(feedbackRows.map(r => [`${r.target_type}:${r.target_id}`, String(r.preference)]));
      const preferences = (r: Row) => [feedback.get(`community:${r.community_id}`), feedback.get(`creator:${r.author_user_id}`), feedback.get(`post:${r.id}`)];
      const scored = rows
        .filter(r => !preferences(r).includes('hide'))
        .map((r) => {
          const community = { category: String(r.community_category ?? ""), topics: parseJson<string[]>(r.community_topics, []) };
          const tags = parseJson<string[]>(r.hashtags, []);
          const communityInterests = interestsForCommunity(community.category, community.topics);
          const interestMatch = ctx.interests.some((k) => communityInterests.includes(k) || tags.includes(k));
          const score = forYouScore({
            ageHours: (now - new Date(iso(r.created_at)).getTime()) / 3_600_000,
            likes: Number(r.like_count) || 0,
            comments: Number(r.comment_count) || 0,
            interestMatch,
            joined: ctx.joined.has(String(r.community_id)),
          });
          const factor = preferences(r).reduce((f, p) => f * (p === 'more' ? 1.7 : p === 'less' ? 0.25 : 1), 1);
          const similarity=semanticScores.get(Number(r.id));
          return { r, score: score * factor * (similarity===undefined?1:1+Math.max(0,similarity)*3) };
        })
        .sort((a, b) => b.score - a.score || Number(b.r.id) - Number(a.r.id));
      const page = scored.slice(offset, offset + PAGE).map((s) => s.r);
      const posts = await postCards(sql, page, ctx);
      return { posts, next: offset + PAGE < scored.length ? `o:${offset + PAGE}` : null };
    }

    if (!ctx.userId) return { posts: [] as PostWithCommunity[], next: null as string | null };
    const params: unknown[] = [viewer];
    let where =
      data.tab === "following"
        ? ` and p.author_user_id in (select followee_id from profile_follows where follower_id = $1)`
        : ` and exists (select 1 from memberships jm where jm.community_id = p.community_id and jm.user_id = $1 and jm.status = 'active')`;
    const cursor = parseCursor(data.cursor);
    if (cursor && "at" in cursor) {
      params.push(cursor.at, cursor.id);
      where += ` and (p.created_at, p.id) < ($2::timestamptz, $3::int)`;
    }
    const rows = await sql.query<Row>(`${base} ${where} order by p.created_at desc, p.id desc limit ${PAGE + 1}`, params);
    const more = rows.length > PAGE;
    const pageRows = rows.slice(0, PAGE);
    const last = pageRows[pageRows.length - 1];
    return {
      posts: await postCards(sql, pageRows, ctx),
      next: more && last ? `${new Date(iso(last.created_at)).toISOString()}|${Number(last.id)}` : null,
    };
  });

// ───────────────────────────── Explore ─────────────────────────────

/** Hashtags used most in the last two weeks (public communities, visible posts). */
async function trendingTags(sql: Sql, viewer: string, limit: number, communityId?: string): Promise<{ tag: string; count: number }[]> {
  const params: unknown[] = [viewer];
  let extra = "";
  if (communityId) {
    params.push(communityId);
    extra = ` and p.community_id = $2`;
  }
  const rows = await sql.query<{ hashtags: string }>(
    `select p.hashtags from posts p join communities com on com.id = p.community_id
     where p.created_at > now() - interval '${communityId ? 60 : 14} days' and p.hashtags <> '[]'
       and coalesce(p.hidden, false) = false and ${communityId ? READABLE_COMMUNITY("$1") : "com.visibility = 'public'"}
       and ${visiblePosts("$1")} ${extra}
     order by p.created_at desc limit 2000`,
    params,
  );
  const counts = new Map<string, number>();
  for (const r of rows) for (const tag of parseJson<string[]>(r.hashtags, [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * The Communities tab: banners, recommended communities, trending tags, and the "Your communities", "New" and
 * "Fast-growing" rows. `category` is a chip (interest key such as "anime", or an old category name).
 */
export const exploreOverview = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d?: { category?: string }) => ({ category: typeof d?.category === "string" ? d.category.trim().slice(0, 30) : "" }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const ctx = await viewerContext(sql, viewerId(context));
    const stats = await communityStats(sql);
    const all = (await discoverable(sql, ctx)).filter((c) => fitsCategory(c, data.category || undefined));
    const interests = ctx.interests;
    const notJoined = all.filter((c) => !ctx.joined.has(c.id));
    const matchFirst = (list: Community[]) =>
      interests.length && !data.category ? [...list.filter((c) => interests.some((k) => fitsCategory(c, k))), ...list.filter((c) => !interests.some((k) => fitsCategory(c, k)))] : list;
    const recommended = matchFirst([...notJoined].sort((a, b) => (stats.get(b.id)?.activity ?? 0) - (stats.get(a.id)?.activity ?? 0) || b.memberCount - a.memberCount));
    const newest = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const growing = [...all]
      .filter((c) => (stats.get(c.id)?.newMembers14 ?? 0) > 0 || (stats.get(c.id)?.posts7 ?? 0) > 0)
      .sort((a, b) => (stats.get(b.id)?.newMembers14 ?? 0) - (stats.get(a.id)?.newMembers14 ?? 0) || (stats.get(b.id)?.trending ?? 0) - (stats.get(a.id)?.trending ?? 0));
    const joinedCommunities = ctx.userId
      ? (
          await sql`select c.* from communities c join memberships m on m.community_id = c.id
                    where m.user_id = ${ctx.userId} and m.status = 'active' order by m.joined_at desc`
        )
          .map(mapCommunity)
          .filter((c) => fitsCategory(c, data.category || undefined))
      : [];
    return {
      banners: EXPLORE_BANNERS as Hero[],
      recommended: await toCards(sql, recommended.slice(0, 8), ctx),
      trendingTags: await trendingTags(sql, ctx.userId ?? "", 12),
      newest: await toCards(sql, newest.slice(0, 8), ctx),
      growing: await toCards(sql, growing.slice(0, 8), ctx),
      joined: await toCards(sql, joinedCommunities.slice(0, 20), ctx),
    };
  });

// ───────────────────────────── Search ─────────────────────────────

type SearchKind = "all" | "people" | "communities" | "posts" | "tags" | "rooms" | "events";
type SearchSort = "relevance" | "trending" | "new" | "growing" | "members";

/** Remembers a search (the last 20, without repeats). */
async function rememberSearch(sql: Sql, userId: string, query: string) {
  await sql`delete from recent_searches where user_id = ${userId} and lower(query) = ${query.toLowerCase()}`;
  await sql`insert into recent_searches (user_id, query) values (${userId}, ${query})`;
  await sql`delete from recent_searches where user_id = ${userId} and id not in (
    select id from recent_searches where user_id = ${userId} order by at desc, id desc limit 20)`;
}

/**
 * One search for everything: people, communities, posts, tags, live rooms and events. Small typos still find things
 * (letter-triple similarity when the plain match finds nothing). Signed-in searches are remembered in
 * `recentSearches`. Filters: `category` (chip), `sort`, `minMembers`, `language`, and `safe` (leaves out 16+
 * communities and posts with content warnings).
 */
export const searchEverything = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator(
    (d: { q: string; kind?: SearchKind; category?: string; sort?: SearchSort; minMembers?: number; language?: string; safe?: boolean }) => ({
      q: String(d?.q ?? "").trim().slice(0, 60),
      kind: (["all", "people", "communities", "posts", "tags", "rooms", "events"] as const).includes(d?.kind as SearchKind) ? (d.kind as SearchKind) : "all",
      category: typeof d?.category === "string" ? d.category.trim().slice(0, 30) : "",
      sort: (["relevance", "trending", "new", "growing", "members"] as const).includes(d?.sort as SearchSort) ? (d.sort as SearchSort) : "relevance",
      minMembers: Math.max(0, Math.floor(Number(d?.minMembers) || 0)),
      language: typeof d?.language === "string" ? d.language.trim().toLowerCase().slice(0, 8) : "",
      safe: Boolean(d?.safe),
    }),
  )
  .handler(async ({ context, data }): Promise<SearchEverything> => {
    const sql = await db();
    const ctx = await viewerContext(sql, viewerId(context));
    const result: SearchEverything = { query: data.q, people: [], communities: [], posts: [], tags: [], rooms: [], events: [], fuzzy: false };
    const isTag = data.q.startsWith("#");
    const term = data.q.replace(/^#/, "").toLowerCase().replace(/[%_\\]/g, "");
    // A filter-only browse (no words, but a category or sort) still lists communities.
    const browsing = !term && (data.category || data.sort !== "relevance" || data.minMembers || data.language);
    if (term.length < 2 && !browsing) return result;
    if (ctx.userId && term.length >= 2) await rememberSearch(sql, ctx.userId, data.q);
    const like = `%${term}%`;
    const want = (k: SearchKind) => data.kind === "all" || data.kind === k;
    const viewer = ctx.userId ?? "";

    if (want("communities") && !isTag) {
      const stats = await communityStats(sql);
      let list = (await discoverable(sql, ctx)).filter(
        (c) =>
          fitsCategory(c, data.category || undefined) &&
          c.memberCount >= data.minMembers &&
          (!data.language || c.language.toLowerCase() === data.language) &&
          (!data.safe || (c.ageGate < 16 && !c.contentWarnings.length)),
      );
      const plain = (c: Community) =>
        !term || [c.name, c.tagline, c.description, c.category, ...c.topics].some((t) => t.toLowerCase().includes(term));
      let matched = list.filter(plain);
      if (!matched.length && term.length >= 3) {
        matched = list
          .map((c) => ({ c, s: Math.max(fuzzyScore(term, c.name), ...c.topics.map((t) => fuzzyScore(term, t))) }))
          .filter((x) => x.s >= 0.3)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.c);
        if (matched.length) result.fuzzy = true;
      }
      list = matched;
      const st = (c: Community) => stats.get(c.id);
      const sorters: Record<SearchSort, (a: Community, b: Community) => number> = {
        relevance: (a, b) => Number(b.name.toLowerCase().includes(term)) - Number(a.name.toLowerCase().includes(term)) || b.memberCount - a.memberCount,
        trending: (a, b) => (st(b)?.trending ?? 0) - (st(a)?.trending ?? 0),
        new: (a, b) => b.createdAt.localeCompare(a.createdAt),
        growing: (a, b) => (st(b)?.newMembers14 ?? 0) - (st(a)?.newMembers14 ?? 0),
        members: (a, b) => b.memberCount - a.memberCount,
      };
      if (!result.fuzzy || data.sort !== "relevance") list.sort(sorters[data.sort]);
      result.communities = await toCards(sql, list.slice(0, 20), ctx);
    }

    if (want("people") && !isTag && term.length >= 2) {
      let rows = await sql.query<Row>(
        `select ${CREATOR_COLUMNS}, p.last_seen_at, p.show_online from profiles p
         where p.search_visible=true and (p.handle ilike $1 or p.display_name ilike $1 or p.headline ilike $1)
           and not exists(select 1 from identity_account_status s where s.user_id=p.user_id and s.status<>'active' and (s.until is null or s.until>now()))
         order by (p.handle ilike $2) desc, p.verified desc, followers desc, p.rep desc limit 30`,
        [like, `${term}%`],
      );
      if (!rows.length && term.length >= 3) {
        const pool = await sql.query<Row>(`select ${CREATOR_COLUMNS}, p.last_seen_at, p.show_online from profiles p where p.search_visible=true and not exists(select 1 from identity_account_status s where s.user_id=p.user_id and s.status<>'active' and (s.until is null or s.until>now())) order by p.rep desc limit 1500`);
        rows = pool
          .map((r) => ({ r, s: Math.max(fuzzyScore(term, String(r.handle)), fuzzyScore(term, String(r.display_name))) }))
          .filter((x) => x.s >= 0.3)
          .sort((a, b) => b.s - a.s)
          .slice(0, 20)
          .map((x) => x.r);
        if (rows.length) result.fuzzy = true;
      }
      rows = rows.filter((r) => !ctx.blocked.has(String(r.user_id))).slice(0, 20);
      const cards = await creatorCards(sql, rows, ctx);
      const followsYou = await followersOfViewer(sql, ctx.userId, cards.map((c) => c.userId));
      result.people = cards.map((c, i) => ({
        userId: c.userId,
        handle: c.handle,
        displayName: c.displayName,
        avatarHue: c.avatarHue,
        avatarV: c.avatarV,
        headline: c.headline,
        verified: c.verified,
        online: isOnlineNow(rows[i]!.last_seen_at ? iso(rows[i]!.last_seen_at) : null, rows[i]!.show_online == null ? true : asBool(rows[i]!.show_online)),
        following: c.following,
        followsYou: followsYou.has(c.userId),
        requested: c.requested,
        creator: c.creator,
        followers: c.followers,
      }));
    }

    if (want("posts") && term.length >= 2) {
      const rows = await sql.query<Row>(
        `select ${POST_SELECT}, ${POST_COMMUNITY_COLUMNS}
         ${POST_JOIN}
         join communities com on com.id = p.community_id
         where (${isTag ? "p.hashtags ilike $2" : "(p.title ilike $2 or p.body ilike $2 or p.hashtags ilike $2 or p.location ilike $2)"})
           and (com.visibility = 'public' or exists (select 1 from memberships am where am.community_id = com.id and am.user_id = $1 and am.status = 'active'))
           and ${READABLE_COMMUNITY("$1")}
           and coalesce(p.hidden, false) = false and (p.expires_at is null or p.expires_at > now())
           and (p.type <> 'wiki' or p.wiki_status = 'approved') and p.type <> 'story'
           and ${visiblePosts("$1")}
           ${data.safe ? "and p.content_warning = '' and com.age_gate < 16" : ""}
         order by ${data.sort === "new" ? "p.created_at desc" : "p.like_count + 2 * p.comment_count desc, p.created_at desc"}
         limit 40`,
        [viewer, isTag ? `%"${term}"%` : like],
      );
      result.posts = (await postCards(sql, rows, ctx)).slice(0, 25);
    }

    if (want("tags") && term.length >= 2) {
      const rows = await sql.query<{ hashtags: string }>(
        `select p.hashtags from posts p join communities com on com.id = p.community_id
         where p.hashtags ilike $2 and com.visibility = 'public' and coalesce(p.hidden, false) = false and ${visiblePosts("$1")}
         order by p.created_at desc limit 2000`,
        [viewer, `%${term.slice(0, 3)}%`],
      );
      const counts = new Map<string, number>();
      for (const r of rows) for (const tag of parseJson<string[]>(r.hashtags, [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      result.tags = [...counts.entries()]
        .map(([tag, count]) => ({ tag, count, s: tag.includes(term) ? 1 + (tag.startsWith(term) ? 1 : 0) : fuzzyScore(term, tag) }))
        .filter((x) => x.s >= 0.35)
        .sort((a, b) => b.s - a.s || b.count - a.count)
        .slice(0, 20)
        .map(({ tag, count }) => ({ tag, count }));
    }

    if (want("rooms") && term.length >= 2 && !isTag) {
      result.rooms = await roomCards(sql, ctx, { scope: "all", onlyLive: false, kinds: ["voice", "screening", "public"], search: term, limit: 20 });
    }

    if (want("events") && term.length >= 2 && !isTag) {
      const rows = await sql.query<Row>(
        `select e.*, com.name as community_name,
                (select count(*)::int from event_rsvps r where r.event_id = e.id) as rsvp_count, 0 as entry_count, null as my_entry_post_id
         from events e join communities com on com.id = e.community_id
         where (e.title ilike $2 or e.body ilike $2) and ${READABLE_COMMUNITY("$1")}
           and e.status<>'cancelled' and ${paidResourceAccessSql('$1','event','e.id')}
           and (com.visibility = 'public' or exists (select 1 from memberships am where am.community_id = com.id and am.user_id = $1 and am.status = 'active'))
           and coalesce(e.ends_at, e.starts_at + interval '3 hours') > now()
         order by e.starts_at asc limit 20`,
        [viewer, like],
      );
      const going = new Set(
        ctx.userId ? (await sql<{ event_id: number }>`select event_id from event_rsvps where user_id = ${ctx.userId}`).map((r) => Number(r.event_id)) : [],
      );
      result.events = rows.map((r) => ({ ...mapHallEvent(r, going.has(Number(r.id))), communityName: String(r.community_name) }));
    }
    return result;
  });

/** Which of `ids` follow the viewer. */
async function followersOfViewer(sql: Sql, userId: string | null, ids: string[]): Promise<Set<string>> {
  if (!userId || !ids.length) return new Set();
  const rows = await sql.query<{ follower_id: string }>(`select follower_id from profile_follows where followee_id = $1 and follower_id = any($2)`, [userId, ids]);
  return new Set(rows.map((r) => String(r.follower_id)));
}

/** Your last ten searches, newest first. */
export const recentSearches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const rows = await sql<{ query: string; at: string }>`select query, at from recent_searches where user_id = ${userId} order by at desc, id desc limit 10`;
    return rows.map((r) => ({ query: r.query, at: iso(r.at) }));
  });

export const clearRecentSearches = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await sql`delete from recent_searches where user_id = ${userId}`;
    return { ok: true };
  });

// ───────────────────────────── Onboarding ─────────────────────────────

/** The interest tiles of onboarding step 2 (pictures: `/kamino/interests/<key>.jpg` on the web). */
export const interestOptions = createServerFn({ method: "GET" }).handler(async (): Promise<InterestOption[]> => INTEREST_OPTIONS.map((o) => ({ ...o })));

/** Saves the interests picked in onboarding (or later in settings). Unknown keys are ignored. */
export const saveInterests = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { keys: string[] }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    if (!Array.isArray(data?.keys)) throw new Error("Pick some interests.");
    const keys = cleanInterests(data.keys);
    await sql`update profiles set interests = ${JSON.stringify(keys)} where user_id = ${userId}`;
    return { keys };
  });

/** Onboarding steps 3 and 4: communities and people that match the interests just picked. */
export const onboardingSuggestions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const ctx = await viewerContext(sql, userId);
    const stats = await communityStats(sql);
    const all = (await discoverable(sql, ctx)).filter((c) => !ctx.joined.has(c.id));
    const score = (c: Community) => stats.get(c.id)?.activity ?? 0;
    const matching = all.filter((c) => ctx.interests.some((k) => fitsCategory(c, k))).sort((a, b) => score(b) - score(a));
    const rest = all.filter((c) => !matching.includes(c)).sort((a, b) => score(b) - score(a));
    return {
      communities: await toCards(sql, [...matching, ...rest].slice(0, 12), ctx),
      creators: await suggestedCreators(sql, ctx, ctx.interests, 12),
    };
  });

/** Marks onboarding as done (the apps stop sending this person to it). */
export const finishOnboarding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const row = (await sql<{ onboarded_at: string }>`update profiles set onboarded_at = coalesce(onboarded_at, now()) where user_id = ${userId} returning onboarded_at`)[0];
    if (!row) throw new Error("Open your profile first.");
    return { onboardedAt: iso(row.onboarded_at) };
  });

// ───────────────────────────── Community page ─────────────────────────────

/**
 * Extra things the redesigned community page shows (the existing `getCommunityPage` keeps working): who is online,
 * member faces, the "Top N%" rank, moderators, featured and recent posts, rooms, events and a media grid.
 * A private community the viewer cannot read returns the counts only.
 */
export const communityOverview = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { slug: string }) => ({ slug: String(d?.slug ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const ctx = await viewerContext(sql, viewerId(context));
    const community = await requireCommunity(sql, data.slug);
    const member = await membershipOf(sql, ctx.userId, community.id);
    const stats = await communityStats(sql, community.id);
    const [card] = await toCards(sql, [community], ctx);
    const onlineRows = await sql.query<Row>(
      `select m.user_id, m.nickname, m.persona_hue, pr.display_name, pr.handle, pr.avatar_hue, pr.avatar_version
       from memberships m join profiles pr on pr.user_id = m.user_id
       where m.community_id = $1 and m.status = 'active' and pr.show_online = true and pr.last_seen_at > now() - interval '5 minutes'
       order by pr.last_seen_at desc limit 12`,
      [community.id],
    );
    const base = {
      community: card!,
      member,
      locked: false,
      onlineCount: card!.onlineCount,
      onlineFaces: onlineRows.filter((r) => !ctx.blocked.has(String(r.user_id))).slice(0, 6).map(chip),
      memberFaces: card!.memberFaces,
      rankPercent: stats.get(community.id)?.rankPercent ?? 100,
      moderators: [] as ModeratorRow[],
      featured: [] as Post[],
      recent: [] as Post[],
      rooms: [] as LiveRoomCard[],
      events: [] as HallEvent[],
      media: [] as MediaItem[],
      trendingTags: [] as { tag: string; count: number }[],
    };
    if (!(await internals.canReadForViewer(sql, ctx.userId, community, member))) return { ...base, locked: true, onlineFaces: [] as AuthorChip[], memberFaces: [] as AuthorChip[] };

    const mods = await sql.query<Row>(
      `select m.user_id, m.nickname, m.role, m.persona_hue, pr.handle, pr.display_name, pr.avatar_hue, pr.avatar_version
       from memberships m join profiles pr on pr.user_id = m.user_id
       where m.community_id = $1 and m.status = 'active' and m.role in ('agent', 'leader', 'curator')
       order by case m.role when 'agent' then 0 when 'leader' then 1 else 2 end, m.joined_at limit 20`,
      [community.id],
    );
    const moderators: ModeratorRow[] = mods.map((r) => ({
      userId: String(r.user_id),
      handle: String(r.handle ?? "member"),
      nickname: String(r.nickname || r.display_name || "Member"),
      avatarHue: Number(r.persona_hue ?? r.avatar_hue) || 220,
      avatarV: Number(r.avatar_version) || 0,
      role: String(r.role) as Role,
      ...moderatorBadge(String(r.role) as Role),
    }));

    const isMod = member?.status === "active" && ["agent", "leader", "curator"].includes(member.role);
    const postRows = await sql.query<Row>(
      `select ${POST_SELECT} ${POST_JOIN}
       where p.community_id = $1 and (p.expires_at is null or p.expires_at > now())
         and (coalesce(p.hidden, false) = false or p.author_user_id = $2 or $3)
         and p.type not in ('story', 'wiki') and ${visiblePosts("$2")}
       order by p.created_at desc limit 120`,
      [community.id, ctx.userId ?? "", isMod],
    );
    const visibleRows = postRows.filter((r) => !ctx.blocked.has(String(r.author_user_id)) && !ctx.muted.has(String(r.author_user_id)));
    const ids = visibleRows.map((r) => Number(r.id));
    const liked = await likedSet(sql, ctx.userId, ids);
    const saved = await savedSet(sql, ctx.userId, ids);
    const posts = visibleRows.map((r) => mapPost(r, liked.has(Number(r.id)), saved.has(Number(r.id))));
    const featured = posts
      .filter((p) => p.featured || p.pinned || p.announcement)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.announcement) - Number(a.announcement) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
    const media: MediaItem[] = [];
    for (const r of visibleRows) {
      if (media.length >= 60) break;
      const cover = String(r.cover ?? "");
      const id = Number(r.id);
      if (cover && !cover.startsWith("/covers/")) media.push({ postId: id, index: 0, url: postThumb(id, cover) });
      const albumCount = Number(parseJson<{ albumCount?: number }>(r.payload, {}).albumCount) || 0;
      for (let n = 1; n <= albumCount && media.length < 60; n++) media.push({ postId: id, index: n, url: `/api/v1/media/post/${id}/${n}` });
    }
    const eventRows = await sql.query<Row>(
      `select e.*, (select count(*)::int from event_rsvps r where r.event_id = e.id) as rsvp_count,
              (select count(*)::int from challenge_entries ce where ce.event_id = e.id) as entry_count,
              (select ce.post_id from challenge_entries ce where ce.event_id = e.id and ce.user_id = $2) as my_entry_post_id
       from events e where e.community_id = $1 and (e.ends_at is null or e.ends_at > now())
         and e.status<>'cancelled' and ${paidResourceAccessSql('$2','event','e.id')}
       order by e.starts_at limit 12`,
      [community.id, ctx.userId ?? ""],
    );
    const going = new Set(
      ctx.userId ? (await sql<{ event_id: number }>`select event_id from event_rsvps where user_id = ${ctx.userId}`).map((r) => Number(r.event_id)) : [],
    );
    return {
      ...base,
      moderators,
      featured,
      recent: posts.slice(0, 30),
      rooms: await roomCards(sql, ctx, { scope: "all", communityId: community.id, onlyLive: false, kinds: ["voice", "screening", "public", "private"], limit: 30 }),
      events: eventRows.map((r) => mapHallEvent(r, going.has(Number(r.id)))),
      media,
      trendingTags: await trendingTags(sql, ctx.userId ?? "", 8, community.id),
    };
  });

/** Leaders set the topic chips shown on their community page (up to eight short labels). */
export const setCommunityTopics = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; topics: string[] }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const me = await requireActiveMember(sql, userId, data.slug);
    if (!canLead(me.role)) throw new Error("Only leaders can change the topics.");
    if (!Array.isArray(data.topics)) throw new Error("Choose some topics.");
    const topics = cleanTopics(data.topics);
    const err = scanText(topics.join("\n"));
    if (err) throw new Error(err);
    await sql`update communities set topics = ${JSON.stringify(topics)} where id = ${data.slug}`;
    await sql`insert into audit_log (community_id, actor_id, action, detail) values (${data.slug}, ${userId}, 'community:topics', ${topics.join(", ").slice(0, 200)})`;
    return { topics };
  });

/** Invite someone you know to a community. They get a notification with a Join button. */
export const inviteToCommunity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; userId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "invite");
    const community = await requireCommunity(sql, data.slug);
    await requireActiveMember(sql, userId, community.id);
    if (data.userId === userId) throw new Error("You're already here.");
    if ((await blockedSet(sql, userId)).has(data.userId)) throw new Error("You can't invite this person.");
    const target = (await sql<{ user_id: string }>`select user_id from profiles where user_id = ${data.userId}`)[0];
    if (!target) throw new Error("Member not found.");
    const theirs = await membershipOf(sql, data.userId, community.id);
    if (theirs?.status === "active") throw new Error("They are already a member.");
    if (theirs?.status === "banned") throw new Error("They can't join this community.");
    const recent = await sql`select 1 from notifications where user_id = ${data.userId} and kind = 'invite' and target_type = 'community'
      and target_id = ${community.id} and created_at > now() - interval '1 day'`;
    if (recent.length) return { ok: true, already: true };
    await notify(sql, data.userId, "invite", "Community invite", `Join ${community.name}`, `/c/${community.id}`, {
      actorId: userId,
      targetType: "community",
      targetId: community.id,
    });
    return { ok: true, already: false };
  });

// ───────────────────────────── Live rooms ─────────────────────────────

/** Voice and screening rooms with people in them right now: in your communities (`joined`) or all public ones. */
export const liveRooms = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d?: { scope?: "joined" | "all" }) => ({ scope: d?.scope === "joined" ? ("joined" as const) : ("all" as const) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const ctx = await viewerContext(sql, viewerId(context));
    return roomCards(sql, ctx, { scope: ctx.userId ? data.scope : "all", onlyLive: true, limit: 30 });
  });

/**
 * Starts a live voice room in a community you belong to, puts you in it, and lets your followers in that community
 * know. Returns the new room's id.
 */
export const startLiveRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; name: string; topic?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "post");
    await internals.requireMinAge(sql, userId);
    const community = await requireCommunity(sql, data.slug);
    await requireActiveMember(sql, userId, community.id);
    await internals.assertNotMuted(sql, userId, community.id);
    const { enforceCommunityPolicy } = await import('./community-v9');
    await enforceCommunityPolicy(sql, userId, community.id, 'live');
    const name = cleanText(data.name, 40);
    if (name.length < 2) throw new Error("Name the room.");
    const topic = cleanText(data.topic, 24);
    const err = scanText(`${name}\n${topic}`);
    if (err) throw new Error(err);
    const open = await sql<{ n: number }>`select count(*)::int as n from chat_rooms where community_id = ${community.id} and created_by = ${userId} and kind = 'voice'`;
    if (Number(open[0]?.n ?? 0) >= 5) throw new Error("You already have five voice rooms here. Reuse one of them.");
    const created = await sql<{ id: number }>`
      insert into chat_rooms (community_id, name, kind, created_by, topic)
      values (${community.id}, ${name}, 'voice', ${userId}, ${topic})
      returning id`;
    const roomId = Number(created[0]!.id);
    await sql`insert into chat_members (room_id, user_id)
      select ${roomId}, user_id from memberships where community_id = ${community.id} and status = 'active'
      on conflict do nothing`;
    await sql`update chat_members set in_voice = true where room_id = ${roomId} and user_id = ${userId}`;
    await sql`insert into audit_log (community_id, actor_id, action, detail) values (${community.id}, ${userId}, 'room:live', ${name})`;
    const me = (await sql<{ display_name: string }>`select display_name from profiles where user_id = ${userId}`)[0];
    const followers = await sql<{ follower_id: string }>`
      select f.follower_id from profile_follows f
      join memberships m on m.user_id = f.follower_id and m.community_id = ${community.id} and m.status = 'active'
      where f.followee_id = ${userId} limit 200`;
    for (const f of followers)
      await notify(sql, f.follower_id, "live", `${me?.display_name ?? "Someone"} is live`, `${name} in ${community.name}`, `/chats/${roomId}`, {
        actorId: userId,
        targetType: "room",
        targetId: roomId,
      });
    return { id: roomId, roomId };
  });

// ───────────────────────────── Chats ─────────────────────────────

/**
 * The Chats screen: every conversation with what the new rows show (online dot, blue tick, "You: ..." prefix,
 * photo/voice icons), sorted pinned first then newest. Message requests are included with `isRequest` (they never
 * count as unread); `requests` is how many are waiting.
 */
export const chatsOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const rows = await sql.query<Row>(
      `select r.*, cm.pinned, cm.muted, c.name as community_name,
          lm.body as last_body, lm.created_at as last_at, lm.author_user_id as last_author_id, lm.media_kind as last_media_kind,
          (select count(*)::int from chat_members cmv where cmv.room_id = r.id and cmv.in_voice = true and ${ACTIVE_IN_ROOM}) as voice_count,
          (select count(*)::int from messages m where m.room_id = r.id and m.author_user_id <> $1 and m.held = false and m.deleted = false
             and m.created_at > coalesce(cm.last_read_at, to_timestamp(0))) as unread_raw,
          (select status from message_requests mr where mr.room_id = r.id and mr.user_id = $1) as my_request,
          (select status from message_requests mr where mr.room_id = r.id and mr.user_id <> $1 and mr.via_mute = false limit 1) as their_request,
          case when r.kind = 'dm' then (select om.user_id from chat_members om where om.room_id = r.id and om.user_id <> $1 limit 1) end as peer_user_id
       from chat_rooms r
       join chat_members cm on cm.room_id = r.id and cm.user_id = $1
       left join communities c on c.id = r.community_id
       left join lateral (
         select m.body, m.created_at, m.author_user_id, mm.kind as media_kind
         from messages m left join message_media mm on mm.message_id = m.id
         where m.room_id = r.id and m.held = false
         order by m.id desc limit 1
       ) lm on true
       where (r.community_id is null or exists
         (select 1 from memberships mb where mb.community_id = r.community_id and mb.user_id = $1 and mb.status = 'active'))
         and cm.room_removed=false and (${internals.paidRoomAccessSql('$1','r')})
         and (r.community_id is null or (${internals.communityAccessSql('$1','c')}))
       order by cm.pinned desc, lm.created_at desc nulls last, r.id desc
       limit 300`,
      [userId],
    );
    const blocked = await blockedSet(sql, userId);
    const visible = rows.filter((r) => r.my_request !== "declined" && !(r.peer_user_id && blocked.has(String(r.peer_user_id))));
    const peerIds = [...new Set(visible.map((r) => r.peer_user_id).filter(Boolean).map(String))];
    const authorIds = [...new Set(visible.map((r) => r.last_author_id).filter(Boolean).map(String))];
    const people = new Map<string, Row>();
    const wanted = [...new Set([...peerIds, ...authorIds])];
    if (wanted.length)
      for (const p of await sql.query<Row>(
        `select user_id, display_name, handle, avatar_hue, avatar_version, verified, last_seen_at, show_online from profiles where user_id = any($1)`,
        [wanted],
      ))
        people.set(String(p.user_id), p);
    const rooms: ChatOverviewRoom[] = visible.map((r) => {
      const peer = r.peer_user_id ? people.get(String(r.peer_user_id)) : undefined;
      const lastAuthor = r.last_author_id ? people.get(String(r.last_author_id)) : undefined;
      const isRequest = r.my_request === "pending";
      const kind = String(r.kind) as RoomKind;
      const media = r.last_media_kind ? String(r.last_media_kind) : null;
      const lastBody = r.last_body == null ? null : String(r.last_body);
      const base = mapRoom({
        ...r,
        last_message: lastBody || (media === "image" ? "📷 Sent a photo" : media === "audio" ? "🎤 Voice note" : media === "video" ? "🎬 Sent a video" : null),
        last_at: r.last_at,
        unread: isRequest ? 0 : r.unread_raw,
        peer_name: peer?.display_name,
        peer_handle: peer?.handle,
        peer_hue: peer?.avatar_hue,
        peer_avatar_v: peer?.avatar_version,
        peer_user_id: peer?.user_id,
      });
      return {
        ...base,
        peerOnline: peer ? isOnlineNow(peer.last_seen_at ? iso(peer.last_seen_at) : null, peer.show_online == null ? true : asBool(peer.show_online)) : false,
        peerVerified: peer ? asBool(peer.verified) : false,
        lastAuthor: r.last_author_id ? (String(r.last_author_id) === userId ? "You" : String(lastAuthor?.display_name ?? "Member")) : null,
        lastKind: r.last_author_id ? ((media as "image" | "audio" | "video" | null) ?? "text") : null,
        isGroup: kind === "public" || kind === "private",
        isRequest,
        awaitingAccept: r.their_request === "pending",
        communityName: r.community_name ? String(r.community_name) : null,
        topic: String(r.topic ?? ""),
      };
    });
    return { rooms, requests: rooms.filter((r) => r.isRequest).length };
  });

const roomIdOf = (d: number | { roomId: number }) => ({ roomId: Number(typeof d === "number" ? d : d?.roomId) });

/** Accept a message request: it moves into your normal chats and starts notifying you. */
export const acceptMessageRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(roomIdOf)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const done = await sql`update message_requests set status = 'accepted', decided_at = now()
      where room_id = ${data.roomId} and user_id = ${userId} and status <> 'accepted' returning room_id`;
    if (!done.length) throw new Error("This request is no longer waiting.");
    await sql`update chat_members set last_read_at = now() where room_id = ${data.roomId} and user_id = ${userId}`;
    return { ok: true };
  });

/** Decline a message request: the conversation disappears from your chats. The sender is not told. */
export const declineMessageRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(roomIdOf)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const done = await sql`update message_requests set status = 'declined', decided_at = now()
      where room_id = ${data.roomId} and user_id = ${userId} and status = 'pending' returning room_id`;
    if (!done.length) throw new Error("This request is no longer waiting.");
    return { ok: true };
  });

/** Marks a conversation read up to message `lastId` (for read receipts and unread counts). */
export const markRoomRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { roomId: number; lastId: number }) => ({ roomId: Number(d?.roomId), lastId: Math.max(0, Math.floor(Number(d?.lastId) || 0)) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await requireRoomAccess(sql, userId, data.roomId);
    const max = Number((await sql<{ n: number }>`select coalesce(max(id), 0)::int as n from messages where room_id = ${data.roomId}`)[0]?.n ?? 0);
    const lastId = Math.min(data.lastId, max);
    await sql`update chat_members set last_read_id = greatest(last_read_id, ${lastId}), last_read_at = now()
      where room_id = ${data.roomId} and user_id = ${userId}`;
    publishEvent({ type: "receipt", roomId: data.roomId, userId });
    return { ok: true, lastReadId: lastId };
  });

/**
 * "Seen" receipts: how far each other person has read. Only people who keep read receipts on are listed, and only
 * when you keep yours on too (like most chat apps).
 */
export const roomReceipts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { roomId: number }) => ({ roomId: Number(d?.roomId) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await requireRoomAccess(sql, userId, data.roomId);
    const mine = (await sql<{ show_read_receipts: unknown }>`select show_read_receipts from profiles where user_id = ${userId}`)[0];
    if (mine && !asBool(mine.show_read_receipts)) return { seenBy: [] as { userId: string; lastReadId: number; name: string; handle: string; hue: number; avatarV: number }[] };
    const blocked = await blockedSet(sql, userId);
    const rows = await sql<Row>`
      select cm.user_id, cm.last_read_id, p.display_name, p.handle, p.avatar_hue, p.avatar_version
      from chat_members cm join profiles p on p.user_id = cm.user_id
      where cm.room_id = ${data.roomId} and cm.user_id <> ${userId} and cm.last_read_id > 0 and p.show_read_receipts = true
      order by cm.last_read_id desc limit 50`;
    return {
      seenBy: rows
        .filter((r) => !blocked.has(String(r.user_id)))
        .map((r) => ({
          userId: String(r.user_id),
          lastReadId: Number(r.last_read_id) || 0,
          name: String(r.display_name ?? "Member"),
          handle: String(r.handle ?? ""),
          hue: Number(r.avatar_hue) || 220,
          avatarV: Number(r.avatar_version) || 0,
        })),
    };
  });

/** "I'm typing" (call every few seconds while typing). */
export const setTyping = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { roomId: number }) => ({ roomId: Number(d?.roomId) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await requireRoomAccess(sql, userId, data.roomId);
    await sql`insert into typing (room_id, user_id, at) values (${data.roomId}, ${userId}, now())
      on conflict (room_id, user_id) do update set at = now()`;
    publishEvent({ type: "typing", roomId: data.roomId, userId });
    return { ok: true };
  });

/** Names of the people typing in a room in the last 6 seconds (not you, not people you blocked). */
export const typingIn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { roomId: number }) => ({ roomId: Number(d?.roomId) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const room = await requireRoomAccess(sql, userId, data.roomId);
    const blocked = await blockedSet(sql, userId);
    const rows = await sql<Row>`
      select t.user_id, coalesce(nullif(mb.nickname, ''), p.display_name, 'Member') as name
      from typing t join profiles p on p.user_id = t.user_id
      left join memberships mb on mb.user_id = t.user_id and mb.community_id = ${room.community_id ? String(room.community_id) : ""}
      where t.room_id = ${data.roomId} and t.user_id <> ${userId} and t.at > now() - interval '6 seconds'
      order by t.at desc limit 5`;
    const people = rows.filter((r) => !blocked.has(String(r.user_id)));
    return { names: people.map((r) => String(r.name)), userIds: people.map((r) => String(r.user_id)) };
  });

// ───────────────────────────── Notifications ─────────────────────────────

/**
 * The new notifications list: each row says who did it (avatar), what (a short verb), a quoted snippet, a thumbnail,
 * and an optional action button (Follow Back, Join, open). Filter by tab: all, social, community, events.
 * Older rows without an actor still show (from their title and body). Paging: pass the last id as `before`.
 */
export const notificationsFeed = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d?: { filter?: NotificationFilter; before?: number }) => ({
    filter: (["all", "social", "community", "events"] as const).includes(d?.filter as NotificationFilter) ? (d!.filter as NotificationFilter) : ("all" as NotificationFilter),
    before: Number.isSafeInteger(Number(d?.before)) && Number(d?.before) > 0 ? Number(d?.before) : 0,
  }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await internals.ensureEventReminders(sql, userId);
    const rows = await sql.query<Row>(
      `select n.*, a.handle as a_handle, a.display_name as a_name, a.avatar_hue as a_hue, a.avatar_version as a_v, a.headline as a_headline,
              a.verified as a_verified, (select count(*)::int from profile_follows f where f.followee_id = n.actor_id) as a_followers
       from notifications n left join profiles a on a.user_id = n.actor_id
       where n.user_id = $1 and (${internals.notificationAccessSql('$1','n')}) ${data.before ? "and n.id < $2" : ""}
       order by n.id desc limit 300`,
      data.before ? [userId, data.before] : [userId],
    );
    // People you muted: their (social) notifications are left out, including rows from before the mute.
    const muted = await mutedSet(sql, userId);
    const fromMuted = (r: Row) => Boolean(r.actor_id && muted.has(String(r.actor_id)) && muteSilences(String(r.kind)));
    const unread = Number(
      (
        await sql.query<{ n: number }>(
          `select count(*)::int as n from notifications n
           where n.user_id = $1 and n.read = false and n.kind <> all($3)
             and (${internals.notificationAccessSql('$1','n')})
             and not (n.kind = any($2) and exists (select 1 from muted_people mp where mp.user_id = n.user_id and mp.muted_user_id = n.actor_id))`,
          [userId, [...MUTE_SILENCED_KINDS], CHAT_NOTIFICATION_KINDS],
        )
      )[0]?.n ?? 0,
    );
    const picked = rows
      .filter((r) => !fromMuted(r))
      .map((r) => {
        // Older rows have no target: work it out from their link.
        const fromHref = parseHref(String(r.href ?? ""));
        const targetType = String(r.target_type || fromHref.type || "");
        const targetId = String(r.target_id || fromHref.id || "");
        return { r, targetType, targetId, category: notificationCategory(String(r.kind)) };
      })
      // Chat messages have their own unread counts on the Chats tab, so the list leaves them out (like the mockups).
      .filter((x) => (data.filter === "all" ? x.category !== "messages" : x.category === data.filter))
      .slice(0, 60);

    const ids = (type: string) => [...new Set(picked.filter((x) => x.targetType === type && x.targetId).map((x) => x.targetId))];
    const postIds = ids("post").map(Number).filter(Number.isSafeInteger);
    const posts = new Map<number, Row>();
    if (postIds.length)
      for (const p of await sql.query<Row>(`select id, cover, title, hidden, author_user_id, community_id from posts where id = any($1)`, [postIds]))
        posts.set(Number(p.id), p);
    const communityIds = ids("community");
    const communities = new Map<string, Community>();
    if (communityIds.length) for (const c of await sql.query<Row>(`select * from communities where id = any($1)`, [communityIds])) communities.set(String(c.id), mapCommunity(c));
    const ctx = await viewerContext(sql, userId);
    const cards = new Map((await toCards(sql, [...communities.values()], ctx)).map((c) => [c.id, c]));
    const roomIds = ids("room").map(Number).filter(Number.isSafeInteger);
    const rooms = new Map<number, Row>();
    if (roomIds.length)
      for (const room of await sql.query<Row>(
        `select r.id, r.name, r.topic, r.kind, c.name as community_name, c.category,
                (select count(*)::int from chat_members cmv where cmv.room_id = r.id and cmv.in_voice = true and ${ACTIVE_IN_ROOM}) as live_count
         from chat_rooms r left join communities c on c.id = r.community_id where r.id = any($1)`,
        [roomIds],
      ))
        rooms.set(Number(room.id), room);
    const eventIds = ids("event").map(Number).filter(Number.isSafeInteger);
    const events = new Map<number, Row>();
    if (eventIds.length)
      for (const e of await sql.query<Row>(
        `select e.id, e.title, e.starts_at, e.community_id, c.name as community_name, c.cover from events e join communities c on c.id = e.community_id where e.id = any($1)`,
        [eventIds],
      ))
        events.set(Number(e.id), e);

    const items: NotificationItem[] = picked.map(({ r, targetType, targetId, category }) => {
      const kind = String(r.kind);
      const actor = r.actor_id && r.a_handle
        ? {
            userId: String(r.actor_id),
            nickname: String(r.a_name ?? "Member"),
            handle: String(r.a_handle),
            hue: Number(r.a_hue) || 220,
            avatarV: Number(r.a_v) || 0,
            headline: String(r.a_headline ?? ""),
            verified: asBool(r.a_verified),
            followers: Number(r.a_followers) || 0,
          }
        : null;
      const actorFollowed = actor ? ctx.following.has(actor.userId) : false;
      let thumb = String(r.thumb ?? "");
      let community: NotificationItem["community"] = null;
      let event: NotificationItem["event"] = null;
      let room: NotificationItem["room"] = null;
      let live = false;
      if (targetType === "post") {
        const p = posts.get(Number(targetId));
        if (p && !thumb && (!asBool(p.hidden) || p.author_user_id === userId)) thumb = postThumb(Number(p.id), String(p.cover ?? ""));
      } else if (targetType === "community") {
        const c = cards.get(targetId);
        if (c) {
          thumb ||= c.icon || c.cover;
          community = { id: c.id, name: c.name, memberCount: c.memberCount, icon: c.icon, cover: c.cover, hue: c.hue, faces: c.memberFaces };
        }
      } else if (targetType === "room") {
        const rm = rooms.get(Number(targetId));
        if (rm) {
          room = { id: Number(rm.id), name: String(rm.name), topic: String(rm.topic || rm.category || ""), communityName: String(rm.community_name ?? ""), liveCount: Number(rm.live_count) || 0 };
          live = kind === "live" ? room.liveCount > 0 : kind === "call" ? !asBool(r.read) && Date.now() - new Date(iso(r.created_at)).getTime() < 45_000 : false;
        }
      } else if (targetType === "event") {
        const e = events.get(Number(targetId));
        if (e) {
          event = { id: Number(e.id), title: String(e.title), startsAt: iso(e.starts_at), communityId: String(e.community_id), communityName: String(e.community_name) };
          thumb ||= String(e.cover ?? "");
        }
      }
      let action: NotificationItem["action"] = null;
      let actionTarget = "";
      if ((kind === "follow" || kind === "follow_accept") && actor && !actorFollowed) {
        action = "followBack";
        actionTarget = actor.userId;
      } else if (kind === "invite" && community && !ctx.joined.has(community.id)) {
        action = "join";
        actionTarget = community.id;
      } else if (kind === "live" || kind === "call" || kind === "event") {
        action = "open";
        actionTarget = String(r.href ?? "/");
      }
      const snippet = ["comment", "mention", "wall", "chat", "broadcast", "announcement", "appeal"].includes(kind) ? String(r.body ?? "") : "";
      return {
        id: Number(r.id),
        kind,
        title: String(r.title),
        body: String(r.body ?? ""),
        href: String(r.href ?? "/"),
        read: asBool(r.read),
        createdAt: iso(r.created_at),
        actorId: r.actor_id ? String(r.actor_id) : null,
        targetType,
        targetId,
        category,
        actor,
        thumb,
        snippet,
        verb: actor ? notificationVerb(kind) : "",
        action,
        actionTarget,
        actorFollowed,
        live,
        community,
        event,
        room,
      };
    });
    return { items, unread, next: rows.length === 300 || picked.length === 60 ? (items[items.length - 1]?.id ?? null) : null };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await sql`update notifications set read = true where user_id = ${userId} and read = false`;
    return { ok: true };
  });

// ───────────────────────────── Profiles ─────────────────────────────

/** Loads a profile by handle (or user id) with the viewer's relationship to it. Private profiles report `locked`. */
async function loadProfileFor(sql: Sql, handle: string, viewer: string | null) {
  const row = (await sql`select * from profiles where handle = ${handle} or user_id = ${handle} limit 1`)[0];
  if (!row) throw new Error("No one by that name.");
  const isSelf = viewer === row.user_id;
  const profile = scrubProfile(mapProfile(row), isSelf);
  const rel = viewer
    ? (
        await sql<Row>`
          select exists(select 1 from profile_follows where follower_id = ${viewer} and followee_id = ${profile.userId}) as following,
                 exists(select 1 from profile_follows where follower_id = ${profile.userId} and followee_id = ${viewer}) as follows_you,
                 exists(select 1 from follow_requests where follower_id = ${viewer} and followee_id = ${profile.userId}) as requested,
                 exists(select 1 from blocks where blocker_id = ${viewer} and blocked_id = ${profile.userId}) as blocked,
                 exists(select 1 from blocks where blocker_id = ${profile.userId} and blocked_id = ${viewer}) as blocked_by,
                 exists(select 1 from muted_people where user_id = ${viewer} and muted_user_id = ${profile.userId}) as muted`
      )[0]!
    : { following: false, follows_you: false, requested: false, blocked: false, blocked_by: false, muted: false };
  const following = asBool(rel.following);
  const blocked = asBool(rel.blocked);
  const locked = !isSelf && ((profile.privateAccount && !following) || blocked || asBool(rel.blocked_by));
  return { profile, isSelf, following, followsYou: asBool(rel.follows_you), requested: asBool(rel.requested), blocked, muted: asBool(rel.muted), locked };
}

/** The same viewer, minus a mute of `userId` (used when the viewer opens that person's own profile). */
function unmuted(ctx: ViewerContext, userId: string): ViewerContext {
  if (!ctx.muted.has(userId)) return ctx;
  const muted = new Set(ctx.muted);
  muted.delete(userId);
  return { ...ctx, muted };
}

async function followCounts(sql: Sql, userId: string) {
  const row = (
    await sql<Row>`
      select (select count(*)::int from profile_follows where followee_id = ${userId}) as followers,
             (select count(*)::int from profile_follows where follower_id = ${userId}) as following,
             (select count(*)::int from profile_follows a join profile_follows b on b.follower_id = a.followee_id and b.followee_id = a.follower_id
               where a.follower_id = ${userId}) as friends`
  )[0]!;
  return { followers: Number(row.followers) || 0, following: Number(row.following) || 0, friends: Number(row.friends) || 0 };
}

/**
 * Everything the redesigned profile shows: header (pronouns, location, website, headline, badges, online dot),
 * counts, follow state, showcase banners, streak, unlocked badges, three recent posts, communities and category
 * counts. Non-followers of a private account (and blocked people) get the header and counts only (`locked`).
 */
export const profileOverview = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { handle: string }) => ({ handle: String(d?.handle ?? "").trim().replace(/^@/, "") }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const viewer = viewerId(context);
    const who = await loadProfileFor(sql, data.handle, viewer);
    const { profile } = who;
    // Opening a muted person's profile on purpose still shows their posts (a mute only keeps them out of lists).
    const ctx = unmuted(await viewerContext(sql, viewer), profile.userId);
    const counts = await followCounts(sql, profile.userId);
    const postsCount = Number(
      (
        await sql.query<{ n: number }>(
          `select count(*)::int as n from posts p join communities com on com.id = p.community_id
           where p.author_user_id = $1 and coalesce(p.hidden, false) = false and p.type <> 'story'
             and com.visibility = 'public' and ${visiblePosts("$2")}`,
          [profile.userId, viewer ?? ""],
        )
      )[0]?.n ?? 0,
    );
    const categoryOptions: ProfileCategoryOption[] = profile.profileCategories
      .map((k) => PROFILE_CATEGORY_OPTIONS.find((o) => o.key === k))
      .filter((o): o is (typeof PROFILE_CATEGORY_OPTIONS)[number] => Boolean(o))
      .map((o) => ({ ...o }));
    const header = {
      ...profile,
      profileCategories: categoryOptions,
      profileCategoryKeys: profile.profileCategories,
      online: isOnlineNow(profile.lastSeenAt, profile.showOnline),
      creator: isCreator(profile.creator, counts.followers),
    };
    const out = {
      profile: header,
      stats: { posts: postsCount, ...counts },
      following: who.following,
      followsYou: who.followsYou,
      requested: who.requested,
      isSelf: who.isSelf,
      blocked: who.blocked,
      /** The viewer muted this person (see mutePerson). Never shown to the person themselves. */
      muted: who.muted,
      locked: who.locked,
      showcase: [] as Achievement[],
      streak: { days: 0, best: profile.bestStreak },
      badges: [] as Achievement[],
      recentPosts: [] as Post[],
      communities: [] as CommunityCardData[],
      categoryCounts: {} as Record<string, number>,
    };
    if (who.locked) return out;

    if (who.isSelf) await internals.syncAchievements(sql, profile.userId, { force: true });
    const { achievements, showcase } = await internals.achievementsFor(sql, profile.userId);
    const badges = achievements.filter((a) => a.unlocked).sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""));
    const membershipStreak = Number(
      (await sql<{ n: number }>`select coalesce(max(best_streak), 0)::int as n from memberships where user_id = ${profile.userId}`)[0]?.n ?? 0,
    );
    const streak = streakWeek(profile.lastCheckinAt ? utcDay(new Date(profile.lastCheckinAt)) : null, profile.streak);

    const recentRows = await sql.query<Row>(
      `select ${POST_SELECT}, ${POST_COMMUNITY_COLUMNS} ${POST_JOIN}
       join communities com on com.id = p.community_id
       where p.author_user_id = $1 and coalesce(p.hidden, false) = false and (p.expires_at is null or p.expires_at > now())
         and p.type not in ('story', 'wiki') and (com.visibility = 'public' or exists (select 1 from memberships am where am.community_id = com.id and am.user_id = $2 and am.status = 'active'))
         and ${READABLE_COMMUNITY("$2")} and ${visiblePosts("$2")}
       order by p.created_at desc limit 3`,
      [profile.userId, viewer ?? ""],
    );
    const tagRows = await sql.query<{ hashtags: string }>(
      `select p.hashtags from posts p join communities com on com.id = p.community_id
       where p.author_user_id = $1 and coalesce(p.hidden, false) = false and com.visibility = 'public' and p.hashtags <> '[]'
         and ${visiblePosts("$2")}
       order by p.created_at desc limit 1000`,
      [profile.userId, viewer ?? ""],
    );
    const categoryCounts: Record<string, number> = Object.fromEntries(PROFILE_CATEGORY_OPTIONS.map((o) => [o.key, 0]));
    for (const r of tagRows) for (const tag of parseJson<string[]>(r.hashtags, [])) if (tag in categoryCounts) categoryCounts[tag]! += 1;
    const joined =
      profile.hideJoined && !who.isSelf
        ? []
        : (
            await sql`select c.* from communities c join memberships m on m.community_id = c.id
                      where m.user_id = ${profile.userId} and m.status = 'active'
                        and (c.visibility = 'public' or ${who.isSelf})
                      order by m.joined_at desc limit 30`
          ).map(mapCommunity);
    return {
      ...out,
      showcase,
      streak: { days: streak.days, best: Math.max(profile.bestStreak, membershipStreak, streak.days) },
      badges,
      recentPosts: (await postCards(sql, recentRows, ctx)) as Post[],
      communities: await toCards(sql, joined, ctx),
      categoryCounts,
    };
  });

/** A person's posts, newest first, optionally only one tag (the profile category tiles use this). */
export const profilePosts = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { handle: string; tag?: string; cursor?: string | null }) => ({
    handle: String(d?.handle ?? "").trim().replace(/^@/, ""),
    tag: typeof d?.tag === "string" ? d.tag.trim().replace(/^#/, "").toLowerCase().slice(0, 24) : "",
    cursor: typeof d?.cursor === "string" ? d.cursor : null,
  }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const viewer = viewerId(context);
    const who = await loadProfileFor(sql, data.handle, viewer);
    if (who.locked) return { posts: [] as PostWithCommunity[], next: null as string | null, locked: true };
    const ctx = unmuted(await viewerContext(sql, viewer), who.profile.userId);
    const params: unknown[] = [who.profile.userId, viewer ?? ""];
    let where = "";
    if (data.tag && /^[a-z0-9_]{1,24}$/.test(data.tag)) {
      params.push(`%"${data.tag}"%`);
      where += ` and p.hashtags like $${params.length}`;
    }
    const cursor = parseCursor(data.cursor);
    if (cursor && "at" in cursor) {
      params.push(cursor.at, cursor.id);
      where += ` and (p.created_at, p.id) < ($${params.length - 1}::timestamptz, $${params.length}::int)`;
    }
    const rows = await sql.query<Row>(
      `select ${POST_SELECT}, ${POST_COMMUNITY_COLUMNS} ${POST_JOIN}
       join communities com on com.id = p.community_id
       where p.author_user_id = $1 and coalesce(p.hidden, false) = false and (p.expires_at is null or p.expires_at > now())
         and p.type <> 'story' and (com.visibility = 'public' or exists (select 1 from memberships am where am.community_id = com.id and am.user_id = $2 and am.status = 'active'))
         and ${READABLE_COMMUNITY("$2")} and ${visiblePosts("$2")} ${where}
       order by p.created_at desc, p.id desc limit ${PAGE + 1}`,
      params,
    );
    const pageRows = rows.slice(0, PAGE);
    const last = pageRows[pageRows.length - 1];
    return {
      posts: await postCards(sql, pageRows, ctx),
      next: rows.length > PAGE && last ? `${new Date(iso(last.created_at)).toISOString()}|${Number(last.id)}` : null,
      locked: false,
    };
  });

/** Followers, following, or friends (people who follow each other). Private accounts: followers only. */
export const followLists = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { handle: string; kind: "followers" | "following" | "friends" }) => ({
    handle: String(d?.handle ?? "").trim().replace(/^@/, ""),
    kind: d?.kind === "following" || d?.kind === "friends" ? d.kind : ("followers" as const),
  }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const viewer = viewerId(context);
    const ctx = await viewerContext(sql, viewer);
    const who = await loadProfileFor(sql, data.handle, viewer);
    const counts = await followCounts(sql, who.profile.userId);
    if (who.locked) return { people: [] as PersonRow[], counts, locked: true };
    const privacy = (await sql<Row>`select hide_followers,hide_following from profiles where user_id=${who.profile.userId}`)[0];
    if(viewer!==who.profile.userId && ((data.kind==='followers'&&asBool(privacy?.hide_followers)) || (data.kind!=='followers'&&asBool(privacy?.hide_following)))) return {people:[] as PersonRow[],counts,locked:true};
    const id = who.profile.userId;
    const query =
      data.kind === "followers"
        ? `select p.*, f.created_at as since from profile_follows f join profiles p on p.user_id = f.follower_id where f.followee_id = $1`
        : data.kind === "following"
          ? `select p.*, f.created_at as since from profile_follows f join profiles p on p.user_id = f.followee_id where f.follower_id = $1`
          : `select p.*, a.created_at as since from profile_follows a
             join profile_follows b on b.follower_id = a.followee_id and b.followee_id = a.follower_id
             join profiles p on p.user_id = a.followee_id where a.follower_id = $1`;
    const rows = (await sql.query<Row>(`${query} order by since desc limit 200`, [id])).filter((r) => !ctx.blocked.has(String(r.user_id)));
    const ids = rows.map((r) => String(r.user_id));
    const followsYou = await followersOfViewer(sql, viewer, ids);
    const requested = new Set(
      viewer && ids.length
        ? (await sql.query<{ followee_id: string }>(`select followee_id from follow_requests where follower_id = $1 and followee_id = any($2)`, [viewer, ids])).map((r) =>
            String(r.followee_id),
          )
        : [],
    );
    const people: PersonRow[] = rows.map((r) => {
      const p = mapProfile(r);
      return {
        userId: p.userId,
        handle: p.handle,
        displayName: p.displayName,
        avatarHue: p.avatarHue,
        avatarV: p.avatarVersion,
        headline: p.headline,
        verified: p.verified,
        online: isOnlineNow(p.lastSeenAt, p.showOnline),
        following: ctx.following.has(p.userId),
        followsYou: followsYou.has(p.userId),
        requested: requested.has(p.userId),
      };
    });
    return { people, counts, locked: false };
  });

/** People waiting for you to approve their follow request (private accounts). */
export const followRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const rows = await sql<Row>`
      select p.*, fr.created_at as asked_at from follow_requests fr join profiles p on p.user_id = fr.follower_id
      where fr.followee_id = ${userId} order by fr.created_at desc limit 200`;
    return rows.map((r) => {
      const p = mapProfile(r);
      return {
        userId: p.userId,
        handle: p.handle,
        displayName: p.displayName,
        avatarHue: p.avatarHue,
        avatarV: p.avatarVersion,
        headline: p.headline,
        verified: p.verified,
        createdAt: iso(r.asked_at),
      };
    });
  });

/** Approve or decline a follow request. Approving tells the person. */
export const answerFollowRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; accept: boolean }) => ({ userId: String(d?.userId ?? ""), accept: Boolean(d?.accept) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const gone = await sql`delete from follow_requests where follower_id = ${data.userId} and followee_id = ${userId} returning follower_id`;
    if (!gone.length) throw new Error("This request is no longer waiting.");
    if (data.accept) {
      await sql`insert into profile_follows (follower_id, followee_id) values (${data.userId}, ${userId}) on conflict do nothing`;
      const me = (await sql<{ display_name: string; handle: string }>`select display_name, handle from profiles where user_id = ${userId}`)[0];
      await notify(sql, data.userId, "follow_accept", "Follow request accepted", `${me?.display_name ?? "Someone"} accepted your request`, `/u/${me?.handle ?? ""}`, {
        actorId: userId,
        targetType: "profile",
        targetId: userId,
      });
    }
    return { ok: true, accepted: data.accept };
  });

// ───────────────────────────── Muting people ─────────────────────────────

/**
 * Mutes (or unmutes) a person, just for you. Softer than a block:
 *   - their posts and comments are left out of your feeds and lists (opening their profile still shows them),
 *   - they make no notifications or phone pushes for you (moderation notices still arrive),
 *   - they can still see you and message you, but their messages wait in your Requests.
 * They are never told. Muting moves an existing conversation with them into your Requests; unmuting puts it back
 * (unless it was a request anyway). Safe to repeat. Returns `{ muted }`.
 */
export const mutePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; muted: boolean }) => ({ userId: String(d?.userId ?? ""), muted: d?.muted !== false }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    if (data.userId === userId) throw new Error("You can't mute yourself.");
    const target = (await sql<{ user_id: string }>`select user_id from profiles where user_id = ${data.userId}`)[0];
    if (!target) throw new Error("Member not found.");
    const dm = (await sql<{ id: number }>`select id from chat_rooms where kind = 'dm' and name = ${dmName(userId, data.userId)}`)[0];
    if (data.muted) {
      await sql`insert into muted_people (user_id, muted_user_id) values (${userId}, ${data.userId}) on conflict do nothing`;
      // Unread notifications they already sent stop counting (the lists leave them out from now on).
      await sql.query(`update notifications set read = true where user_id = $1 and actor_id = $2 and read = false and kind = any($3)`, [
        userId,
        data.userId,
        [...MUTE_SILENCED_KINDS],
      ]);
      // An open conversation with them moves into your Requests, quietly (they still see a normal chat).
      if (dm)
        await sql`insert into message_requests (room_id, user_id, sender_id, via_mute) values (${dm.id}, ${userId}, ${data.userId}, true)
          on conflict (room_id, user_id) do update set status = 'pending', via_mute = true, decided_at = null
          where message_requests.status = 'accepted'`;
    } else {
      await sql`delete from muted_people where user_id = ${userId} and muted_user_id = ${data.userId}`;
      if (dm)
        await sql`update message_requests set status = 'accepted', via_mute = false, decided_at = now()
          where room_id = ${dm.id} and user_id = ${userId} and via_mute = true and status = 'pending'`;
    }
    return { muted: data.muted };
  });

/** The people you muted, most recent first (for a "Muted accounts" list in settings). */
export const listMutedPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MutedPerson[]> => {
    const sql = await db();
    const { userId } = context as Authed;
    const rows = await sql<Row>`
      select p.*, mp.created_at as muted_at from muted_people mp join profiles p on p.user_id = mp.muted_user_id
      where mp.user_id = ${userId} order by mp.created_at desc limit 500`;
    return rows.map((r) => {
      const p = mapProfile(r);
      return {
        userId: p.userId,
        handle: p.handle,
        displayName: p.displayName,
        avatarHue: p.avatarHue,
        avatarV: p.avatarVersion,
        headline: p.headline,
        verified: p.verified,
        mutedAt: iso(r.muted_at),
      };
    });
  });

/** The name of the direct-message room between two people (the same rule as `openDm`). */
function dmName(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm:${x}:${y}`;
}

/** Site owners (`KAMINO_ADMIN_EMAILS`) give or remove the blue tick and the Creator badge. */
export const adminSetVerified = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId?: string; handle?: string; verified?: boolean; creator?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    if (!(await isSiteAdmin(sql, userId))) throw new Error("Only the site owner can do this.");
    const target = (
      await sql<{ user_id: string; verified: unknown; creator: unknown }>`
        select user_id, verified, creator from profiles where user_id = ${data.userId ?? ""} or handle = ${(data.handle ?? "").replace(/^@/, "")} limit 1`
    )[0];
    if (!target) throw new Error("Member not found.");
    const verified = typeof data.verified === "boolean" ? data.verified : asBool(target.verified);
    const creator = typeof data.creator === "boolean" ? data.creator : asBool(target.creator);
    await sql`update profiles set verified = ${verified}, creator = ${creator} where user_id = ${target.user_id}`;
    return { userId: target.user_id, verified, creator };
  });

/** Site owners give or remove a community's blue tick. */
export const adminSetCommunityVerified = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; verified: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    if (!(await isSiteAdmin(sql, userId))) throw new Error("Only the site owner can do this.");
    const done = await sql`update communities set verified = ${Boolean(data.verified)} where id = ${data.slug} returning id`;
    if (!done.length) throw new Error("Community not found");
    return { slug: data.slug, verified: Boolean(data.verified) };
  });

// ───────────────────────────── Posts and composer ─────────────────────────────

/** Comments of a post, newest first or most liked first ("top"). */
export const listComments = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { postId: number; sort?: "newest" | "top" | "oldest" }) => ({
    postId: Number(d?.postId),
    sort: d?.sort === "top" || d?.sort === "oldest" ? d.sort : ("newest" as const),
  }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const viewer = viewerId(context);
    const post = await requirePostAccess(sql, viewer, data.postId);
    const order = data.sort === "top" ? "like_count desc, c.id desc" : data.sort === "oldest" ? "c.id asc" : "c.id desc";
    const rows = await sql.query<Row>(
      `select c.*, m.nickname, m.persona_hue, pr.handle, pr.display_name, pr.avatar_hue, pr.avatar_version, pr.verified as author_verified,
              (select count(*)::int from comment_likes cl where cl.comment_id = c.id) as like_count
       from comments c
       left join memberships m on m.user_id = c.author_user_id and m.community_id = $2
       left join profiles pr on pr.user_id = c.author_user_id
       where c.post_id = $1 and c.held = false
       order by ${order} limit 300`,
      [data.postId, String(post.community_id)],
    );
    const blocked = await blockedSet(sql, viewer);
    const muted = await mutedSet(sql, viewer);
    const liked = new Set(
      viewer ? (await sql<{ comment_id: number }>`select comment_id from comment_likes where user_id = ${viewer}`).map((r) => Number(r.comment_id)) : [],
    );
    return rows
      .filter((r) => !blocked.has(String(r.author_user_id)) && !muted.has(String(r.author_user_id)))
      .map(
        (r): Comment & { authorVerified: boolean; mine: boolean } => ({
          id: Number(r.id),
          postId: Number(r.post_id),
          author: chip({ ...r, user_id: r.author_user_id }),
          body: String(r.body),
          likeCount: Number(r.like_count) || 0,
          liked: liked.has(Number(r.id)),
          createdAt: iso(r.created_at),
          authorVerified: asBool(r.author_verified),
          mine: viewer === r.author_user_id,
        }),
      );
  });

/**
 * Deletes a comment. Allowed for the person who wrote it, for an active moderator (agent, leader or curator) of the
 * post's community, and for a site owner. The post's comment count goes down only for a comment that was counted
 * (a comment held by the safety check never was), and the comment's likes go with it. A moderator's deletion is
 * written to the community's audit log and settles any open safety flag about the comment. Returns `{ ok: true }`.
 */
export const deleteComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { commentId: number }) => ({ commentId: Number(d?.commentId) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    if (!Number.isSafeInteger(data.commentId) || data.commentId < 1) throw new Error("This comment is already gone.");
    const row = (
      await sql<Row>`select c.id, c.post_id, c.author_user_id, p.community_id
                     from comments c left join posts p on p.id = c.post_id where c.id = ${data.commentId}`
    )[0];
    if (!row) throw new Error("This comment is already gone.");
    const communityId = row.community_id ? String(row.community_id) : null;
    const isAuthor = String(row.author_user_id) === userId;
    const member = isAuthor || !communityId ? null : await membershipOf(sql, userId, communityId);
    const siteAdmin = isAuthor ? false : await isSiteAdmin(sql, userId);
    if (!canDeleteComment({ viewerId: userId, authorId: String(row.author_user_id), viewerRole: member?.role ?? null, viewerStatus: member?.status ?? null, siteAdmin }))
      throw new Error("You can only delete your own comments. Community moderators can remove others.");

    await sql`delete from comment_likes where comment_id = ${data.commentId}`;
    // The same removal moderators use (keeps posts.comment_count right for visible and held comments).
    await takeDown(sql, "comment", String(data.commentId));
    if (!isAuthor) {
      await sql`update safety_flags set status = 'removed', reviewed_by = ${userId}, reviewed_at = now()
        where target_type = 'comment' and target_id = ${String(data.commentId)} and status = 'open'`;
      if (communityId)
        await sql`insert into audit_log (community_id, actor_id, action, detail)
          values (${communityId}, ${userId}, 'comment:delete', ${`comment ${data.commentId} on post ${Number(row.post_id)}`})`;
    }
    return { ok: true as const };
  });

/** Up to six tag ideas for the composer: the community's topics, tags popular there, and words from the text. */
export const suggestTags = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { text?: string; slug?: string }) => ({ text: String(d?.text ?? "").slice(0, 4000), slug: String(d?.slug ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const viewer = viewerId(context);
    let topics: string[] = [];
    let popular: string[] = [];
    if (data.slug) {
      const community = (await sql`select * from communities where id = ${data.slug}`)[0];
      if (community) {
        const c = mapCommunity(community);
        if (await internals.canReadForViewer(sql,viewer,c,await membershipOf(sql, viewer, c.id))) {
          topics = c.topics;
          popular = (await trendingTags(sql, viewer ?? "", 10, c.id)).map((t) => t.tag);
        }
      }
    }
    if (!popular.length) popular = (await trendingTags(sql, viewer ?? "", 10)).map((t) => t.tag);
    return suggestTagsFrom({ text: data.text, topics, popular, limit: 6 });
  });
