/**
 * Small, pure rules behind the redesign's social features (no database, no network), so each one can be
 * unit-tested on its own (see `social-rules.test.ts`). The server functions that use them live in `social.ts`.
 *
 * Nothing here may import server-only code: the phone app and website can import these helpers too.
 */
import { INTEREST_OPTIONS, PROFILE_CATEGORY_OPTIONS } from "./types.ts";
import type { Hero, NotificationCategory, NotifyPrefs, Role } from "./types.ts";

// ───────────────────────────── Interests and categories ─────────────────────────────

export const INTEREST_KEYS: readonly string[] = INTEREST_OPTIONS.map((o) => o.key);
export const PROFILE_CATEGORY_KEYS: readonly string[] = PROFILE_CATEGORY_OPTIONS.map((o) => o.key);
export const MAX_PROFILE_CATEGORIES = 6;
export const MAX_TOPICS = 8;

/** Keeps only known interest keys, once each, in the order given. */
export function cleanInterests(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const key = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (INTEREST_KEYS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Keeps only known profile category keys, once each, at most six. */
export function cleanProfileCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const key = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (PROFILE_CATEGORY_KEYS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out.slice(0, MAX_PROFILE_CATEGORIES);
}

/** Community topic chips: short labels (up to 24 characters), no duplicates, at most eight. */
export function cleanTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const label = item.replace(/\s+/g, " ").trim().replace(/^#/, "").slice(0, 24).trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out.slice(0, MAX_TOPICS);
}

/** Older community categories (the original list) and the interests they belong to. */
const LEGACY_CATEGORY_INTERESTS: Record<string, string[]> = {
  anime: ["anime", "manga"],
  music: ["music", "kpop"],
  games: ["gaming"],
  game: ["gaming"],
  writing: ["writing", "books"],
  art: ["art", "photography"],
  roleplay: ["writing", "anime"],
  tabletop: ["gaming"],
  film: ["movies"],
  science: ["tech"],
  lifestyle: ["fitness", "food", "fashion", "travel", "pets"],
  cosplay: ["art", "anime"],
};

/** "K-Pop", "kpop", "K pop" -> "kpop". */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Which interests a community belongs to, from its category (old or new names) and its topic chips.
 * Example: category "Music" -> ["music", "kpop"]; category "Pets" -> ["pets"].
 */
export function interestsForCommunity(category: string, topics: string[] = []): string[] {
  const out = new Set<string>();
  const add = (word: string) => {
    const s = squash(word);
    if (!s) return;
    for (const o of INTEREST_OPTIONS) if (squash(o.key) === s || squash(o.label) === s) out.add(o.key);
    for (const key of LEGACY_CATEGORY_INTERESTS[s] ?? []) out.add(key);
  };
  add(category);
  for (const t of topics) add(t);
  return [...out];
}

/** Whether a community matches an interest key (used by the category chips). */
export function communityMatchesInterest(category: string, topics: string[], interest: string): boolean {
  return interestsForCommunity(category, topics).includes(interest);
}

// ───────────────────────────── Notifications ─────────────────────────────

const SOCIAL_KINDS = new Set(["like", "comment", "mention", "follow", "follow_request", "follow_accept", "wall", "tip", "follow_post"]);
const EVENT_KINDS = new Set(["event", "live", "call"]);
const MESSAGE_KINDS = new Set(["chat", "message"]);

/**
 * The tab a notification belongs to. Social: likes, comments, mentions, follows, wall notes.
 * Events: event reminders, live rooms, calls. Messages: direct messages (shown under "All" only).
 * Everything else (invites, joins, announcements, moderation, safety, achievements...) is Community.
 */
export function notificationCategory(kind: string): NotificationCategory {
  if (SOCIAL_KINDS.has(kind)) return "social";
  if (EVENT_KINDS.has(kind)) return "events";
  if (MESSAGE_KINDS.has(kind)) return "messages";
  return "community";
}

/** The words after the actor's name ("Mika liked your post"). "" when the title says it all. */
export function notificationVerb(kind: string): string {
  switch (kind) {
    case "like":
      return "liked your post";
    case "comment":
      return "commented on your post";
    case "mention":
      return "mentioned you";
    case "follow":
      return "started following you";
    case "follow_request":
      return "asked to follow you";
    case "follow_accept":
      return "accepted your follow request";
    case "wall":
      return "left a note on your wall";
    case "invite":
      return "invited you to join";
    case "live":
      return "is live in";
    case "call":
      return "is calling you";
    case "tip":
      return "sent you a tip";
    case "chat":
      return "sent you a message";
    default:
      return "";
  }
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { social: true, community: true, events: true, messages: true, digest: false };

/** Reads the stored `notify_prefs` JSON (missing keys keep their defaults). */
export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw || "{}");
    } catch {
      value = {};
    }
  }
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pick = (k: keyof NotifyPrefs) => (typeof obj[k] === "boolean" ? (obj[k] as boolean) : DEFAULT_NOTIFY_PREFS[k]);
  return { social: pick("social"), community: pick("community"), events: pick("events"), messages: pick("messages"), digest: pick("digest") };
}

/** True when `tz` is a time zone name this server understands ("" counts as UTC). */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The hour (0-23) at `now` in the time zone `tz` ("" or unknown = UTC). */
export function localHour(now: Date, tz: string): number {
  if (tz && isValidTimezone(tz)) {
    const text = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now);
    const hour = Number.parseInt(text, 10);
    if (Number.isInteger(hour)) return hour % 24;
  }
  return now.getUTCHours();
}

/**
 * Quiet hours: from `start` up to (not including) `end`. 22 -> 7 wraps past midnight. Off when either is null
 * or both are the same hour.
 */
export function inQuietHours(hour: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Whether a phone push should go out for this notification (the in-app list always gets the row). */
export function shouldPush(input: {
  kind: string;
  prefs: NotifyPrefs;
  quietStart: number | null;
  quietEnd: number | null;
  timezone: string;
  now?: Date;
}): boolean {
  const category = notificationCategory(input.kind);
  if (!input.prefs[category]) return false;
  return !inQuietHours(localHour(input.now ?? new Date(), input.timezone), input.quietStart, input.quietEnd);
}

/** Where an older notification points, read from its link (so older rows can show pictures too). */
export function parseHref(href: string): { type: "post" | "community" | "room" | "profile" | ""; id: string; slug: string } {
  const post = /^\/c\/([^/?#]+)\/p\/(\d+)/.exec(href);
  if (post) return { type: "post", id: post[2]!, slug: decodeURIComponent(post[1]!) };
  const community = /^\/c\/([^/?#]+)/.exec(href);
  if (community) return { type: "community", id: decodeURIComponent(community[1]!), slug: decodeURIComponent(community[1]!) };
  const room = /^\/chats\/(\d+)/.exec(href);
  if (room) return { type: "room", id: room[1]!, slug: "" };
  const profile = /^\/u\/([^/?#]+)/.exec(href);
  if (profile) return { type: "profile", id: decodeURIComponent(profile[1]!), slug: "" };
  return { type: "", id: "", slug: "" };
}

// ───────────────────────────── Messages ─────────────────────────────

/**
 * A new direct message lands in the recipient's "Requests" when they do not follow the sender and the two share
 * no community. Requests do not raise unread badges or send pushes until accepted.
 */
export function isMessageRequest(input: { recipientFollowsSender: boolean; sharesCommunity: boolean }): boolean {
  return !input.recipientFollowsSender && !input.sharesCommunity;
}

/**
 * The same rule with personal mutes: a message from someone the recipient muted always waits in Requests.
 * `viaMute` is true when the mute is the only reason, so the sender is not shown "waiting for them to accept"
 * (that would give the mute away) and unmuting can move the conversation back.
 */
export function messageRequestFor(input: { recipientFollowsSender: boolean; sharesCommunity: boolean; recipientMutedSender: boolean }): {
  request: boolean;
  viaMute: boolean;
} {
  const stranger = isMessageRequest(input);
  return { request: stranger || input.recipientMutedSender, viaMute: !stranger && input.recipientMutedSender };
}

// ───────────────────────────── Personal mutes ─────────────────────────────

/**
 * Notification kinds a personal mute silences: things a person does to you or with you (likes, comments,
 * mentions, follows, wall notes, tips, messages, calls, "is live", invites, wiki suggestions). Moderation notices,
 * safety messages, reminders and community news still arrive, even when the person behind them is muted.
 */
export const MUTE_SILENCED_KINDS: readonly string[] = [
  "like",
  "comment",
  "mention",
  "follow",
  "follow_request",
  "follow_accept",
  "wall",
  "tip",
  "chat",
  "call",
  "live",
  "invite",
  "wiki",
];

/** Does muting the actor of a notification of this kind keep it away (no row, no push)? */
export function muteSilences(kind: string): boolean {
  return MUTE_SILENCED_KINDS.includes(kind);
}

// ───────────────────────────── Comments ─────────────────────────────

/**
 * Who may delete a comment: the person who wrote it, an active moderator (agent, leader or curator) of the
 * post's community, or a site owner. Everyone else gets a kind "no".
 */
export function canDeleteComment(input: {
  viewerId: string;
  authorId: string;
  viewerRole: Role | string | null;
  viewerStatus: string | null;
  siteAdmin: boolean;
}): boolean {
  if (input.viewerId && input.viewerId === input.authorId) return true;
  if (input.siteAdmin) return true;
  return input.viewerStatus === "active" && ["agent", "leader", "curator"].includes(String(input.viewerRole));
}

// ───────────────────────────── Ranking ─────────────────────────────

/**
 * The "For You" score of a post. Simple on purpose, so anyone can explain it:
 *   freshness × (1 + likes + 2 × comments) × boosts
 * Freshness halves every 24 hours. Boosts: ×2 for a community you joined, ×1.5 when it matches your interests.
 */
export function forYouScore(input: { ageHours: number; likes: number; comments: number; interestMatch: boolean; joined: boolean }): number {
  const age = Math.max(0, input.ageHours);
  const freshness = Math.pow(0.5, age / 24);
  const engagement = 1 + Math.max(0, input.likes) + 2 * Math.max(0, input.comments);
  const boost = (input.joined ? 2 : 1) * (input.interestMatch ? 1.5 : 1);
  return freshness * engagement * boost;
}

/** Activity used to rank communities: posts, comments and check-ins in the last 30 days, plus members. */
export function communityActivityScore(input: { posts: number; comments: number; checkins: number; members: number }): number {
  return input.posts + input.comments + input.checkins + input.members;
}

export const RANK_BUCKETS = [1, 5, 10, 25, 50, 100] as const;

/**
 * Which "Top N%" badge a community gets. `position` is 1 for the most active of `total` communities.
 * Example: 3rd of 400 -> 0.75% -> 1 ("Top 1%"); 30th of 100 -> 30% -> 50.
 */
export function rankBucket(position: number, total: number): number {
  if (total <= 0 || position <= 0) return 100;
  const percent = (position / total) * 100;
  for (const bucket of RANK_BUCKETS) if (percent <= bucket) return bucket;
  return 100;
}

// ───────────────────────────── Numbers, dates, streaks ─────────────────────────────

/** 1,234 -> "1.2K", 245,000 -> "245K", 1,300,000 -> "1.3M". Small numbers stay as they are. */
export function compactNumber(n: number): string {
  const value = Math.round(Number(n) || 0);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fmt = (x: number, unit: string) => {
    const rounded = x >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
    return `${sign}${String(rounded).replace(/\.0$/, "")}${unit}`;
  };
  if (abs < 1000) return `${value}`;
  if (abs < 1_000_000) {
    const k = abs / 1000;
    return k >= 999.5 ? fmt(abs / 1_000_000, "M") : fmt(k, "K");
  }
  if (abs < 1_000_000_000) return fmt(abs / 1_000_000, "M");
  return fmt(abs / 1_000_000_000, "B");
}

/** "YYYY-MM-DD" of a date in UTC. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The daily streak card. Check-ins are counted per UTC day; a streak is still alive when the last check-in was
 * today or yesterday. `week` is Monday..Sunday of the current week: true for the days covered by the streak.
 */
export function streakWeek(lastCheckinDay: string | null, streak: number, now: Date = new Date()): { days: number; week: boolean[]; checkedInToday: boolean } {
  const today = utcDay(now);
  const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
  const alive = lastCheckinDay === today || lastCheckinDay === yesterday;
  const days = alive ? Math.max(0, streak) : 0;
  const week = [false, false, false, false, false, false, false];
  if (alive && days > 0 && lastCheckinDay) {
    const last = Date.parse(`${lastCheckinDay}T00:00:00Z`);
    const mondayOffset = (now.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = Date.parse(`${today}T00:00:00Z`) - mondayOffset * 86_400_000;
    for (let i = 0; i < 7; i++) {
      const day = monday + i * 86_400_000;
      week[i] = day <= last && day > last - days * 86_400_000;
    }
  }
  return { days, week, checkedInToday: lastCheckinDay === today };
}

// ───────────────────────────── Text, tags, search ─────────────────────────────

/** A hashtag as Kamino stores it: lower case letters, numbers and _, starting with a letter, 2-24 long. */
export function normalizeTag(raw: string): string | null {
  const tag = String(raw ?? "").trim().replace(/^#+/, "").toLowerCase();
  return /^[a-z][a-z0-9_]{1,23}$/.test(tag) ? tag : null;
}

export const MAX_POST_TAGS = 10;

/** Tags chosen in the composer first, then #tags found in the text; no duplicates, at most ten. */
export function mergeHashtags(explicit: unknown, fromText: string[]): string[] {
  const out: string[] = [];
  const list = Array.isArray(explicit) ? explicit : [];
  for (const raw of [...list, ...fromText]) {
    const tag = typeof raw === "string" ? normalizeTag(raw) : null;
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, MAX_POST_TAGS);
}

const STOP_WORDS = new Set(
  "about above after again against also because been before being below between both could does doing down during each from further have having here hers herself himself into itself just more most myself only other ought ours ourselves over same should some such than that their theirs them themselves then there these they this those through under until very were what when where which while whom with would your yours yourself yourselves really today going thing things still post posts".split(" "),
);

/**
 * Up to `limit` tag suggestions for the composer: the community's topics first, then tags popular there, then
 * longer words from the text. Tags already in the text are skipped.
 */
export function suggestTagsFrom(input: { text: string; topics: string[]; popular: string[]; limit?: number }): string[] {
  const limit = input.limit ?? 6;
  const already = new Set((input.text.match(/#[a-zA-Z][a-zA-Z0-9_]{1,23}/g) ?? []).map((t) => t.slice(1).toLowerCase()));
  const out: string[] = [];
  const add = (raw: string) => {
    const tag = normalizeTag(raw.replace(/[\s-]+/g, ""));
    if (tag && !already.has(tag) && !out.includes(tag) && out.length < limit) out.push(tag);
  };
  const words = (input.text.toLowerCase().match(/[a-z][a-z0-9]{3,20}/g) ?? []).filter((w) => !STOP_WORDS.has(w));
  const wordCounts = new Map<string, number>();
  for (const w of words) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  const topWords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([w]) => w);
  // Topics that appear in the text come first, then popular tags that appear in the text, then the rest.
  const inText = (t: string) => input.text.toLowerCase().includes(t.toLowerCase());
  for (const t of input.topics.filter(inText)) add(t);
  for (const t of input.popular.filter(inText)) add(t);
  for (const w of topWords.slice(0, 2)) add(w);
  for (const t of input.topics) add(t);
  for (const t of input.popular) add(t);
  for (const w of topWords) add(w);
  return out;
}

/** Letter triples of a word (" ab", "abc", "bc "), used for typo-tolerant search. */
export function trigrams(text: string): Set<string> {
  const clean = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= clean.length; i++) out.add(clean.slice(i, i + 3));
  return out;
}

/** How alike two texts are, 0..1 (shared letter triples, the same idea as Postgres pg_trgm). */
export function similarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

/**
 * The best fuzzy score of a search term against any word or the whole of a name.
 * "anmie" vs "Starlight Anime Club" -> compares with "anime" too, so small typos still match.
 */
export function fuzzyScore(term: string, name: string): number {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let best = similarity(term, name);
  for (const w of words) best = Math.max(best, similarity(term, w));
  return best;
}

/** Validates a profile website: empty, or an http(s) address up to 200 characters. Throws a friendly error. */
export function cleanWebsite(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.length > 200) throw new Error("That link is too long.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error("Enter a website address like https://example.com.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Website links must start with http:// or https://.");
  if (!url.hostname.includes(".") || url.username || url.password) throw new Error("Enter a website address like https://example.com.");
  return url.toString();
}

// ───────────────────────────── Feed cursors ─────────────────────────────

/** Newest-first cursors look like "2026-01-02T03:04:05.000Z|123"; ranked ones like "o:20". */
export function parseCursor(cursor: string | undefined | null): { at: string; id: number } | { offset: number } | null {
  if (!cursor) return null;
  const offset = /^o:(\d{1,5})$/.exec(cursor);
  if (offset) return { offset: Number(offset[1]) };
  const keyset = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\|(\d+)$/.exec(cursor);
  if (keyset && !Number.isNaN(Date.parse(keyset[1]!))) return { at: keyset[1]!, id: Number(keyset[2]) };
  return null;
}

// ───────────────────────────── Display constants ─────────────────────────────

/** Card button colours, used in turn by position: violet, blue, pink, green, orange. */
export const JOIN_COLORS = ["#944FFB", "#0099FE", "#F94B96", "#03D482", "#FFA41B"] as const;

export function joinColor(index: number): string {
  return JOIN_COLORS[((index % JOIN_COLORS.length) + JOIN_COLORS.length) % JOIN_COLORS.length]!;
}

/** Moderator badges on the community page: the owner (agent) is "Leader", leaders are "Co-leader", curators "Moderator". */
export function moderatorBadge(role: Role): { badge: "leader" | "coleader" | "moderator"; label: string } {
  if (role === "agent") return { badge: "leader", label: "Leader" };
  if (role === "leader") return { badge: "coleader", label: "Co-leader" };
  return { badge: "moderator", label: "Moderator" };
}

export const HOME_HEROES: Hero[] = [
  { id: "home-1", title: "Good People Brighter Days ♡", text: "Join communities, share your passions, and find your people.", cta: "Start Exploring", href: "/explore", art: "home-1" },
  { id: "home-2", title: "Live the story together", text: "Jump into AI role-play stories with your communities.", cta: "Find a Story", href: "/explore", art: "home-2" },
  { id: "home-3", title: "Earn achievements", text: "Check in every day, keep your streak, and collect badges.", cta: "See Badges", href: "/me", art: "home-3" },
  { id: "home-4", title: "Go live with friends", text: "Start a voice room and hang out in real time.", cta: "Start a Room", href: "/chats", art: "home-4" },
];

export const EXPLORE_BANNERS: Hero[] = [
  { id: "explore-1", title: "Discover Your People", text: "Find communities that love what you love.", cta: "Browse All", href: "/explore?browse=all", art: "explore-1" },
  { id: "explore-2", title: "Trending this week", text: "See where the conversations are happening right now.", cta: "See Trending", href: "/explore?sort=trending", art: "explore-2" },
  { id: "explore-3", title: "Start something new", text: "Create a community and invite your friends.", cta: "Create", href: "/new", art: "explore-3" },
];

// ───────────────────────────── Profiles ─────────────────────────────

/**
 * What other people may see of a profile: personal settings (quiet hours, time zone, push choices, interests) are
 * reset to neutral values, and the last-seen time is hidden when the person turned off "show when I'm online".
 */
export function scrubProfile<T extends {
  quietStart: number | null; quietEnd: number | null; timezone: string; notifyPrefs: NotifyPrefs; interests: string[];
  showOnline: boolean; lastSeenAt: string | null; showReadReceipts: boolean;
}>(profile: T, isSelf: boolean): T {
  if (isSelf) return profile;
  return {
    ...profile,
    quietStart: null,
    quietEnd: null,
    timezone: "",
    notifyPrefs: { ...DEFAULT_NOTIFY_PREFS },
    interests: [],
    showReadReceipts: true,
    lastSeenAt: profile.showOnline ? profile.lastSeenAt : null,
  };
}

/** Online = seen in the last five minutes and the person lets others see it. */
export function isOnlineNow(lastSeenAt: string | null | undefined, showOnline: boolean, now: number = Date.now()): boolean {
  if (!showOnline || !lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return !Number.isNaN(t) && now - t < 5 * 60 * 1000;
}

/** The "Creator" badge: given by the site owner, or automatic once someone has 1,000 followers. */
export const CREATOR_FOLLOWERS = 1000;
export function isCreator(flag: boolean, followers: number): boolean {
  return flag || followers >= CREATOR_FOLLOWERS;
}

/**
 * "Trending" order for communities: what happened recently counts most.
 *   3 × posts this week + posts this month + comments this month + check-ins this month + 2 × new members (14 days)
 */
export function trendingScore(input: { posts7: number; posts30: number; comments30: number; checkins30: number; newMembers14: number }): number {
  return 3 * input.posts7 + input.posts30 + input.comments30 + input.checkins30 + 2 * input.newMembers14;
}
