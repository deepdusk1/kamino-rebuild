import { BUBBLE_STYLES, COMMUNITY_MODULES, PROFILE_FRAME_IDS, THEME_STYLES } from "./types";
import { cleanInterests, cleanProfileCategories, cleanTopics, parseNotifyPrefs } from "./social-rules";
import type {
  BubbleStyle,
  ThemeStyle,
  HallEvent,
  AuthorChip,
  Character,
  ChatMessage,
  ChatRoom,
  Community,
  Membership,
  Notification,
  Post,
  PostPayload,
  Profile,
  ProfileFrame,
  Report,
} from "./types";

export function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1;
}

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw === "object" && raw !== null) return raw as T;
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function iso(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  return iso(v);
}

export function mapCommunity(row: Record<string, unknown>): Community {
  return {
    id: String(row.id),
    name: String(row.name),
    tagline: String(row.tagline ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category),
    cover: String(row.cover ?? ""),
    hue: Number(row.hue) || 220,
    themeStyle: THEME_STYLES.includes(row.theme_style as ThemeStyle) ? (row.theme_style as ThemeStyle) : "aurora",
    icon: String(row.icon ?? ""),
    visibility: (row.visibility as Community["visibility"]) ?? "public",
    ageGate: Number(row.age_gate) || 18,
    contentWarnings: parseJson<string[]>(row.content_warnings, []),
    rules: String(row.rules ?? ""),
    modules: parseJson<Community["modules"]>(row.modules, [...COMMUNITY_MODULES]),
    createdBy: String(row.created_by),
    memberCount: Number(row.member_count) || 0,
    createdAt: iso(row.created_at),
    topics: cleanTopics(parseJson<unknown>(row.topics, [])),
    language: String(row.language ?? "en") || "en",
    verified: asBool(row.verified),
  };
}

/** An hour 0-23, or null. */
function hourOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

const FRAMES: readonly ProfileFrame[] = PROFILE_FRAME_IDS;

function bubbleStyleOf(value: unknown): BubbleStyle {
  return BUBBLE_STYLES.includes(value as BubbleStyle) ? (value as BubbleStyle) : "soft";
}

export function mapProfile(row: Record<string, unknown>): Profile {
  const frameRaw = String(row.frame ?? "ring");
  return {
    userId: String(row.user_id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    bio: String(row.bio ?? ""),
    avatarHue: Number(row.avatar_hue) || 220,
    avatarVersion: Number(row.avatar_version) || 0,
    cover: String(row.cover ?? ""),
    mood: String(row.mood ?? ""),
    status: String(row.status ?? ""),
    frame: (FRAMES.includes(frameRaw as ProfileFrame) ? frameRaw : "ring") as ProfileFrame,
    lastSeenAt: isoOrNull(row.last_seen_at),
    bubbleHue: Number(row.bubble_hue) || 270,
    bubbleStyle: bubbleStyleOf(row.bubble_style),
    ageConfirmed: asBool(row.age_confirmed),
    minAgeConfirmed: row.min_age_confirmed_at != null,
    dmPrivacy: (row.dm_privacy as Profile["dmPrivacy"]) ?? "members",
    hideJoined: asBool(row.hide_joined),
    showOnline: row.show_online == null ? true : asBool(row.show_online),
    notifyLikes: row.notify_likes == null ? true : asBool(row.notify_likes),
    notifyComments: row.notify_comments == null ? true : asBool(row.notify_comments),
    notifyFollows: row.notify_follows == null ? true : asBool(row.notify_follows),
    notifyChat: row.notify_chat == null ? true : asBool(row.notify_chat),
    notifyWall: row.notify_wall == null ? true : asBool(row.notify_wall),
    rep: Number(row.rep) || 0,
    streak: Number(row.streak) || 0,
    lastCheckinAt: isoOrNull(row.last_checkin_at),
    createdAt: iso(row.created_at),
    pronouns: String(row.pronouns ?? ""),
    location: String(row.location ?? ""),
    website: String(row.website ?? ""),
    headline: String(row.headline ?? ""),
    verified: asBool(row.verified),
    creator: asBool(row.creator),
    interests: cleanInterests(parseJson<unknown>(row.interests, [])),
    profileCategories: cleanProfileCategories(parseJson<unknown>(row.profile_categories, [])),
    onboardedAt: isoOrNull(row.onboarded_at),
    privateAccount: asBool(row.private_account),
    showReadReceipts: row.show_read_receipts == null ? true : asBool(row.show_read_receipts),
    quietStart: hourOrNull(row.quiet_start),
    quietEnd: hourOrNull(row.quiet_end),
    notifyPrefs: parseNotifyPrefs(row.notify_prefs),
    timezone: String(row.timezone ?? ""),
    bestStreak: Math.max(Number(row.best_streak) || 0, Number(row.streak) || 0),
  };
}

/** Check-in streak fields of a membership row. A streak only counts while today or yesterday was checked in. */
function streakOf(row: Record<string, unknown>) {
  const last = row.last_checkin_on ? iso(row.last_checkin_on).slice(0, 10) : "";
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return {
    streak: last === today || last === yesterday ? Number(row.streak) || 0 : 0,
    bestStreak: Number(row.best_streak) || 0,
    checkedInToday: last === today,
  };
}

export function mapMembership(row: Record<string, unknown>): Membership {
  return {
    userId: String(row.user_id),
    communityId: String(row.community_id),
    role: (row.role as Membership["role"]) ?? "member",
    status: (row.status as Membership["status"]) ?? "active",
    nickname: String(row.nickname),
    personaBio: String(row.persona_bio ?? ""),
    personaHue: Number(row.persona_hue) || 220,
    rep: Number(row.rep) || 0,
    ...streakOf(row),
    handle: row.handle ? String(row.handle) : undefined,
    avatarV: Number(row.avatar_version) || 0,
    joinedAt: iso(row.joined_at),
  };
}

export function mapCharacter(row: Record<string, unknown>): Character {
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    fandom: String(row.fandom ?? ""),
    bio: String(row.bio ?? ""),
    appearance: String(row.appearance ?? ""),
    hue: Number(row.hue) || 200,
  };
}

export function mapAuthor(row: Record<string, unknown>): AuthorChip {
  return {
    userId: String(row.author_user_id ?? row.user_id),
    nickname: String(row.nickname || row.display_name || "Member"),
    handle: String(row.handle || "member"),
    hue: Number(row.persona_hue ?? row.avatar_hue) || 220,
    avatarV: Number(row.avatar_version) || 0,
  };
}

export function mapPost(row: Record<string, unknown>, liked: boolean, saved = false): Post {
  return {
    id: Number(row.id),
    communityId: String(row.community_id),
    author: mapAuthor(row),
    type: (row.type as Post["type"]) ?? "blog",
    wikiStatus: (row.wiki_status as Post["wikiStatus"]) ?? "draft",
    wikiReviewNote: String(row.wiki_review_note ?? ""),
    title: String(row.title),
    body: String(row.body ?? ""),
    // A cover kept in object storage is served through the post's own address (position 0).
    cover: String(row.cover ?? "").startsWith("s3:") ? `/api/v1/media/post/${Number(row.id)}/0` : String(row.cover ?? ""),
    payload: (() => {
      const payload = parseJson<PostPayload>(row.payload, {});
      return row.type === "quiz"
        ? { ...payload, questions: payload.questions?.map((q) => ({ ...q, answer: -1 })) }
        : payload;
    })(),
    featured: asBool(row.featured),
    pinned: asBool(row.pinned),
    hidden: asBool(row.hidden),
    announcement: asBool(row.announcement),
    commentsDisabled: asBool(row.comments_disabled),
    hashtags: parseJson<string[]>(row.hashtags, []),
    originalPostId: row.original_post_id == null ? null : Number(row.original_post_id),
    editedAt: isoOrNull(row.edited_at),
    saved,
    contentWarning: String(row.content_warning ?? ""),
    likeCount: Number(row.like_count) || 0,
    commentCount: Number(row.comment_count) || 0,
    liked,
    expiresAt: isoOrNull(row.expires_at),
    createdAt: iso(row.created_at),
    location: String(row.location ?? ""),
    visibility: row.visibility === "members" ? "members" : "public",
    publishAt: isoOrNull(row.publish_at),
    scheduled: row.publish_at ? new Date(iso(row.publish_at)).getTime() > Date.now() : false,
    authorVerified: asBool(row.author_verified),
  };
}

export function mapRoom(row: Record<string, unknown>): ChatRoom {
  const kind = (row.kind as ChatRoom["kind"]) ?? "public";
  const peerName = row.peer_name ? String(row.peer_name) : null;
  return {
    id: Number(row.id),
    communityId: row.community_id ? String(row.community_id) : null,
    name: kind === "dm" && peerName ? peerName : String(row.name),
    kind,
    createdBy: String(row.created_by),
    inviteRule: row.invite_rule === "members" ? "members" : "hosts",
    lastMessage: row.last_message ? String(row.last_message) : null,
    lastAt: isoOrNull(row.last_at),
    unread: Number(row.unread) || 0,
    voiceCount: Number(row.voice_count) || 0,
    watchUrl: String(row.watch_url ?? ""),
    watchTitle: String(row.watch_title ?? ""),
    peerName,
    peerHandle: row.peer_handle ? String(row.peer_handle) : null,
    peerHue: Number(row.peer_hue) || 220,
    peerAvatarV: Number(row.peer_avatar_v) || 0,
    peerUserId: row.peer_user_id ? String(row.peer_user_id) : null,
    pinned: asBool(row.pinned),
    muted: asBool(row.muted),
  };
}

export function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: Number(row.id),
    roomId: Number(row.room_id),
    author: mapAuthor(row),
    body: asBool(row.deleted) ? "" : String(row.body),
    replyTo: row.reply_to == null ? null : Number(row.reply_to),
    bubbleHue: Number(row.bubble_hue ?? row.persona_hue ?? row.avatar_hue) || 270,
    bubbleStyle: bubbleStyleOf(row.bubble_style),
    editedAt: isoOrNull(row.edited_at),
    deleted: asBool(row.deleted),
    mediaKind: asBool(row.deleted)
      ? null
      : row.media_kind === "image" || row.media_kind === "audio" || row.media_kind === "video"
        ? row.media_kind
        : null,
    reactions: [],
    createdAt: iso(row.created_at),
  };
}

export function mapNote(row: Record<string, unknown>): Notification {
  return {
    id: Number(row.id),
    kind: String(row.kind),
    title: String(row.title),
    body: String(row.body ?? ""),
    href: String(row.href ?? "/"),
    read: asBool(row.read),
    createdAt: iso(row.created_at),
    actorId: row.actor_id ? String(row.actor_id) : null,
    targetType: String(row.target_type ?? ""),
    targetId: String(row.target_id ?? ""),
  };
}

export function mapReport(row: Record<string, unknown>): Report {
  return {
    id: Number(row.id),
    reporterId: String(row.reporter_id),
    communityId: row.community_id ? String(row.community_id) : null,
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    reason: String(row.reason),
    details: String(row.details ?? ""),
    status: String(row.status),
    createdAt: iso(row.created_at),
  };
}

/**
 * A row from the events query in `server.ts` (`select e.*, rsvp_count, entry_count, my_entry_post_id`)
 * turned into what the apps show. `going` is whether the viewer said they will attend.
 */
export function mapHallEvent(row: Record<string, unknown>, going: boolean, now: number = Date.now()): HallEvent {
  const starts = new Date(String(row.starts_at)).getTime();
  const ends = row.ends_at ? new Date(String(row.ends_at)).getTime() : null;
  const phase: HallEvent["phase"] = row.judged_at ? "judged" : starts > now ? "upcoming" : ends !== null && ends <= now ? "closed" : "open";
  return {
    id: Number(row.id),
    communityId: String(row.community_id),
    title: String(row.title),
    body: String(row.body ?? ""),
    kind: row.kind === "challenge" ? "challenge" : "event",
    startsAt: iso(row.starts_at),
    endsAt: row.ends_at ? iso(row.ends_at) : null,
    createdBy: String(row.created_by),
    rsvpCount: Number(row.rsvp_count) || 0,
    going,
    entryCount: Number(row.entry_count) || 0,
    judged: Boolean(row.judged_at),
    myEntryPostId: row.my_entry_post_id == null ? null : Number(row.my_entry_post_id),
    phase,
  };
}
